import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { alertRules, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

const updateAlertRuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  service_id: z.string().uuid().nullable().optional(),
  metric: z.enum(['error_count', 'error_rate', 'new_error', 'latency_p99']).optional(),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']).optional(),
  threshold: z.number().int().min(0).optional(),
  window_minutes: z.number().int().min(1).max(1440).optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  channel_ids: z.array(z.string().uuid()).optional(),
  cooldown_minutes: z.number().int().min(1).max(1440).optional(),
  is_enabled: z.boolean().optional(),
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

// GET /api/v1/alert-rules/:ruleId
export async function GET(
  req: NextRequest,
  { params }: { params: { ruleId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const rule = await db.query.alertRules.findFirst({
      where: eq(alertRules.id, params.ruleId),
      with: {
        service: { columns: { id: true, name: true } },
        creator: { columns: { id: true, name: true } },
      },
    });

    if (!rule) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Alert rule not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const access = await checkOrgAccess(session.user.id, rule.orgId, ['owner', 'admin', 'developer', 'viewer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: rule.id,
        org_id: rule.orgId,
        name: rule.name,
        service: rule.service ? { id: rule.service.id, name: rule.service.name } : null,
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.threshold,
        window_minutes: rule.windowMinutes,
        severity: rule.severity,
        channel_ids: rule.channelIds,
        cooldown_minutes: rule.cooldownMinutes,
        is_enabled: rule.isEnabled,
        last_triggered_at: rule.lastTriggeredAt?.toISOString() ?? null,
        created_by: rule.creator ? { id: rule.creator.id, name: rule.creator.name } : null,
        created_at: rule.createdAt.toISOString(),
        updated_at: rule.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/alert-rules/:id error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/alert-rules/:ruleId
export async function PATCH(
  req: NextRequest,
  { params }: { params: { ruleId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const rule = await db.query.alertRules.findFirst({
      where: eq(alertRules.id, params.ruleId),
    });

    if (!rule) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Alert rule not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const access = await checkOrgAccess(session.user.id, rule.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateAlertRuleSchema.safeParse(body);

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

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.service_id !== undefined) updates.serviceId = parsed.data.service_id;
    if (parsed.data.metric !== undefined) updates.metric = parsed.data.metric;
    if (parsed.data.operator !== undefined) updates.operator = parsed.data.operator;
    if (parsed.data.threshold !== undefined) updates.threshold = parsed.data.threshold;
    if (parsed.data.window_minutes !== undefined) updates.windowMinutes = parsed.data.window_minutes;
    if (parsed.data.severity !== undefined) updates.severity = parsed.data.severity;
    if (parsed.data.channel_ids !== undefined) updates.channelIds = parsed.data.channel_ids;
    if (parsed.data.cooldown_minutes !== undefined) updates.cooldownMinutes = parsed.data.cooldown_minutes;
    if (parsed.data.is_enabled !== undefined) updates.isEnabled = parsed.data.is_enabled;

    const [updated] = await db
      .update(alertRules)
      .set(updates)
      .where(eq(alertRules.id, params.ruleId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        metric: updated.metric,
        operator: updated.operator,
        threshold: updated.threshold,
        is_enabled: updated.isEnabled,
        updated_at: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/alert-rules/:id error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/alert-rules/:ruleId
export async function DELETE(
  req: NextRequest,
  { params }: { params: { ruleId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const rule = await db.query.alertRules.findFirst({
      where: eq(alertRules.id, params.ruleId),
    });

    if (!rule) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Alert rule not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const access = await checkOrgAccess(session.user.id, rule.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    await db.delete(alertRules).where(eq(alertRules.id, params.ruleId));

    return NextResponse.json({ success: true, data: { id: params.ruleId } });
  } catch (error) {
    console.error('DELETE /api/v1/alert-rules/:id error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
