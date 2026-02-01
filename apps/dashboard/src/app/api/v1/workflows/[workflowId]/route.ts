import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflows, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';
import { executeWorkflow } from '@/lib/workflows';

// Update schema
const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  trigger: z.object({
    type: z.enum(['error', 'metric', 'schedule', 'manual']),
    conditions: z.record(z.unknown()).optional(),
    schedule: z.string().optional(),
  }).optional(),
  actions: z.array(z.object({
    type: z.enum(['notify', 'scale', 'restart', 'rollback', 'run_command', 'ai_analyze']),
    config: z.record(z.unknown()),
  })).min(1).optional(),
  is_active: z.boolean().optional(),
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

// GET /api/v1/workflows/[workflowId] - Get workflow details
export async function GET(
  req: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, params.workflowId),
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
            email: true,
          },
        },
      },
    });

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, workflow.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: workflow.id,
        org_id: workflow.orgId,
        name: workflow.name,
        description: workflow.description,
        trigger: workflow.trigger,
        actions: workflow.actions,
        is_active: workflow.isActive,
        last_triggered_at: workflow.lastTriggeredAt?.toISOString(),
        organization: workflow.organization ? { id: workflow.organization.id, name: workflow.organization.name } : null,
        created_by: workflow.creator ? {
          id: workflow.creator.id,
          name: workflow.creator.name,
          email: workflow.creator.email,
        } : null,
        created_at: workflow.createdAt?.toISOString(),
        updated_at: workflow.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/workflows/[workflowId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/workflows/[workflowId] - Update workflow
export async function PATCH(
  req: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, params.workflowId),
    });

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, workflow.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateWorkflowSchema.safeParse(body);

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

    const updates: Record<string, any> = { updatedAt: new Date() };

    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.trigger !== undefined) updates.trigger = parsed.data.trigger;
    if (parsed.data.actions !== undefined) updates.actions = parsed.data.actions;
    if (parsed.data.is_active !== undefined) updates.isActive = parsed.data.is_active;

    const [updated] = await db
      .update(workflows)
      .set(updates)
      .where(eq(workflows.id, params.workflowId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        trigger: updated.trigger,
        actions: updated.actions,
        is_active: updated.isActive,
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/workflows/[workflowId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/workflows/[workflowId] - Delete workflow
export async function DELETE(
  req: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, params.workflowId),
    });

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, workflow.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    await db.delete(workflows).where(eq(workflows.id, params.workflowId));

    return NextResponse.json({
      success: true,
      message: 'Workflow deleted successfully',
    });
  } catch (error) {
    console.error('DELETE /api/v1/workflows/[workflowId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/workflows/[workflowId] - Trigger workflow manually
export async function POST(
  req: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, params.workflowId),
    });

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, workflow.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    if (!workflow.isActive) {
      return NextResponse.json(
        { success: false, error: { code: 'WORKFLOW_DISABLED', message: 'Workflow is not active', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Get optional context from request body
    const body = await req.json().catch(() => ({}));
    const context = body.context || {};

    // Execute workflow
    const result = await executeWorkflow(params.workflowId, {
      trigger: 'manual',
      triggeredBy: session.user.id,
      ...context,
    });

    // Update last triggered timestamp
    await db
      .update(workflows)
      .set({ lastTriggeredAt: new Date(), updatedAt: new Date() })
      .where(eq(workflows.id, params.workflowId));

    return NextResponse.json({
      success: true,
      data: {
        workflow_id: params.workflowId,
        triggered_at: new Date().toISOString(),
        result,
      },
    });
  } catch (error) {
    console.error('POST /api/v1/workflows/[workflowId] trigger error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
