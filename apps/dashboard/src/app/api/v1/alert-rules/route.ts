import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { alertRules, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

const createAlertRuleSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  service_id: z.string().uuid().optional(),
  metric: z.enum(['error_count', 'error_rate', 'new_error', 'latency_p99']),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
  threshold: z.number().int().min(0),
  window_minutes: z.number().int().min(1).max(1440).default(5),
  severity: z.enum(['info', 'warning', 'error', 'critical']).default('warning'),
  channel_ids: z.array(z.string().uuid()).default([]),
  cooldown_minutes: z.number().int().min(1).max(1440).default(30),
  is_enabled: z.boolean().default(true),
});

async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer']
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

async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// GET /api/v1/alert-rules
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
    const serviceId = searchParams.get('service_id');

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const rules = await db.query.alertRules.findMany({
      where: (rules, { and: andW, eq: eqW, inArray: inArrayW }) => {
        const conditions = [inArrayW(rules.orgId, orgIds)];
        if (serviceId) {
          conditions.push(eqW(rules.serviceId, serviceId));
        }
        return andW(...conditions);
      },
      orderBy: [desc(alertRules.createdAt)],
      with: {
        service: { columns: { id: true, name: true } },
        creator: { columns: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: rules.map((r) => ({
        id: r.id,
        org_id: r.orgId,
        name: r.name,
        service: r.service ? { id: r.service.id, name: r.service.name } : null,
        metric: r.metric,
        operator: r.operator,
        threshold: r.threshold,
        window_minutes: r.windowMinutes,
        severity: r.severity,
        channel_ids: r.channelIds,
        cooldown_minutes: r.cooldownMinutes,
        is_enabled: r.isEnabled,
        last_triggered_at: r.lastTriggeredAt?.toISOString() ?? null,
        created_by: r.creator ? { id: r.creator.id, name: r.creator.name } : null,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/alert-rules error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/alert-rules
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
    const parsed = createAlertRuleSchema.safeParse(body);

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

    const access = await checkOrgAccess(session.user.id, parsed.data.org_id);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const [rule] = await db
      .insert(alertRules)
      .values({
        orgId: parsed.data.org_id,
        name: parsed.data.name,
        serviceId: parsed.data.service_id,
        metric: parsed.data.metric,
        operator: parsed.data.operator,
        threshold: parsed.data.threshold,
        windowMinutes: parsed.data.window_minutes,
        severity: parsed.data.severity,
        channelIds: parsed.data.channel_ids,
        cooldownMinutes: parsed.data.cooldown_minutes,
        isEnabled: parsed.data.is_enabled,
        createdBy: session.user.id,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: rule.id,
          name: rule.name,
          metric: rule.metric,
          operator: rule.operator,
          threshold: rule.threshold,
          window_minutes: rule.windowMinutes,
          severity: rule.severity,
          is_enabled: rule.isEnabled,
          created_at: rule.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/alert-rules error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
