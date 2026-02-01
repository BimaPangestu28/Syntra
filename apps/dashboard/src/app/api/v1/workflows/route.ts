import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflows, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Workflow trigger schema
const triggerSchema = z.object({
  type: z.enum(['error', 'metric', 'schedule', 'manual']),
  conditions: z.record(z.unknown()).optional(),
  schedule: z.string().optional(), // cron expression
});

// Workflow action schema
const actionSchema = z.object({
  type: z.enum(['notify', 'scale', 'restart', 'rollback', 'run_command', 'ai_analyze']),
  config: z.record(z.unknown()),
});

// Create workflow schema
const createWorkflowSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  trigger: triggerSchema,
  actions: z.array(actionSchema).min(1),
  is_active: z.boolean().optional().default(true),
});

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer', 'viewer']
) {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });

  if (!membership) return null;
  if (!allowedRoles.includes(membership.role)) return null;
  return membership;
}

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// GET /api/v1/workflows - List workflows
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    const triggerType = searchParams.get('trigger_type');
    const isActive = searchParams.get('is_active');

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // Filter to specific org if provided
    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    const workflowList = await db.query.workflows.findMany({
      where: (workflows, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) => {
        const conditions = [inArrayWhere(workflows.orgId, targetOrgIds)];

        if (isActive !== null) {
          conditions.push(eqWhere(workflows.isActive, isActive === 'true'));
        }

        return andWhere(...conditions);
      },
      orderBy: [desc(workflows.createdAt)],
      with: {
        organization: {
          columns: {
            id: true,
            name: true,
          },
        },
        creator: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Filter by trigger type if specified (done in memory since it's JSONB)
    let filtered = workflowList;
    if (triggerType) {
      filtered = workflowList.filter(w => (w.trigger as any)?.type === triggerType);
    }

    return NextResponse.json({
      success: true,
      data: filtered.map(w => ({
        id: w.id,
        org_id: w.orgId,
        name: w.name,
        description: w.description,
        trigger: w.trigger,
        actions: w.actions,
        is_active: w.isActive,
        last_triggered_at: w.lastTriggeredAt?.toISOString(),
        organization: w.organization ? { id: w.organization.id, name: w.organization.name } : null,
        created_by: w.creator ? { id: w.creator.id, name: w.creator.name } : null,
        created_at: w.createdAt?.toISOString(),
        updated_at: w.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/workflows error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/workflows - Create workflow
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = createWorkflowSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parsed.error.errors,
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, parsed.data.org_id, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Validate trigger configuration
    const trigger = parsed.data.trigger;
    if (trigger.type === 'schedule' && !trigger.schedule) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Schedule trigger requires a cron expression', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    if ((trigger.type === 'error' || trigger.type === 'metric') && !trigger.conditions) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `${trigger.type} trigger requires conditions`, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Create workflow
    const [workflow] = await db
      .insert(workflows)
      .values({
        orgId: parsed.data.org_id,
        name: parsed.data.name,
        description: parsed.data.description,
        trigger: parsed.data.trigger,
        actions: parsed.data.actions,
        isActive: parsed.data.is_active,
        createdBy: session.user.id,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: workflow.id,
          org_id: workflow.orgId,
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          actions: workflow.actions,
          is_active: workflow.isActive,
          created_at: workflow.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/workflows error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
