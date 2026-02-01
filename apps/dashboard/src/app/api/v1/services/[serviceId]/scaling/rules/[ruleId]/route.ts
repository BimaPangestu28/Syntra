import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, autoScalingRules, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Helper to check service access
async function checkServiceAccess(
  userId: string,
  serviceId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer']
): Promise<boolean> {
  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
    with: {
      project: true,
    },
  });

  if (!service) {
    return false;
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, service.project.orgId)
    ),
  });

  return !!membership && allowedRoles.includes(membership.role);
}

// Update rule schema
const updateRuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  metric: z.enum(['cpu_percent', 'memory_percent', 'request_count', 'response_time_ms', 'custom']).optional(),
  custom_metric_name: z.string().max(255).optional(),
  scale_up_threshold: z.number().int().min(1).max(100).optional(),
  scale_up_by: z.number().int().min(1).max(10).optional(),
  scale_up_cooldown: z.number().int().min(60).max(3600).optional(),
  scale_down_threshold: z.number().int().min(0).max(99).optional(),
  scale_down_by: z.number().int().min(1).max(10).optional(),
  scale_down_cooldown: z.number().int().min(60).max(3600).optional(),
  min_replicas: z.number().int().min(1).max(100).optional(),
  max_replicas: z.number().int().min(1).max(100).optional(),
  is_enabled: z.boolean().optional(),
});

// GET /api/v1/services/[serviceId]/scaling/rules/[ruleId] - Get scaling rule
export async function GET(
  req: NextRequest,
  { params }: { params: { serviceId: string; ruleId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const hasAccess = await checkServiceAccess(session.user.id, params.serviceId, ['owner', 'admin', 'developer', 'viewer']);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const rule = await db.query.autoScalingRules.findFirst({
      where: and(
        eq(autoScalingRules.id, params.ruleId),
        eq(autoScalingRules.serviceId, params.serviceId)
      ),
    });

    if (!rule) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Scaling rule not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: rule.id,
        service_id: rule.serviceId,
        name: rule.name,
        metric: rule.metric,
        custom_metric_name: rule.customMetricName,
        is_enabled: rule.isEnabled,
        scale_up_threshold: rule.scaleUpThreshold,
        scale_up_by: rule.scaleUpBy,
        scale_up_cooldown: rule.scaleUpCooldown,
        scale_down_threshold: rule.scaleDownThreshold,
        scale_down_by: rule.scaleDownBy,
        scale_down_cooldown: rule.scaleDownCooldown,
        min_replicas: rule.minReplicas,
        max_replicas: rule.maxReplicas,
        evaluation_period: rule.evaluationPeriod,
        evaluation_data_points: rule.evaluationDataPoints,
        last_scale_action: rule.lastScaleAction?.toISOString(),
        last_scale_direction: rule.lastScaleDirection,
        created_at: rule.createdAt?.toISOString(),
        updated_at: rule.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/services/[serviceId]/scaling/rules/[ruleId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/services/[serviceId]/scaling/rules/[ruleId] - Update scaling rule
export async function PATCH(
  req: NextRequest,
  { params }: { params: { serviceId: string; ruleId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const hasAccess = await checkServiceAccess(session.user.id, params.serviceId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const existingRule = await db.query.autoScalingRules.findFirst({
      where: and(
        eq(autoScalingRules.id, params.ruleId),
        eq(autoScalingRules.serviceId, params.serviceId)
      ),
    });

    if (!existingRule) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Scaling rule not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = updateRuleSchema.safeParse(body);

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

    // Validate thresholds
    const scaleUpThreshold = parsed.data.scale_up_threshold ?? existingRule.scaleUpThreshold;
    const scaleDownThreshold = parsed.data.scale_down_threshold ?? existingRule.scaleDownThreshold;

    if (scaleDownThreshold >= scaleUpThreshold) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'scale_down_threshold must be less than scale_up_threshold',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    // Build updates
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.metric !== undefined) updates.metric = parsed.data.metric;
    if (parsed.data.custom_metric_name !== undefined) updates.customMetricName = parsed.data.custom_metric_name;
    if (parsed.data.is_enabled !== undefined) updates.isEnabled = parsed.data.is_enabled;
    if (parsed.data.scale_up_threshold !== undefined) updates.scaleUpThreshold = parsed.data.scale_up_threshold;
    if (parsed.data.scale_up_by !== undefined) updates.scaleUpBy = parsed.data.scale_up_by;
    if (parsed.data.scale_up_cooldown !== undefined) updates.scaleUpCooldown = parsed.data.scale_up_cooldown;
    if (parsed.data.scale_down_threshold !== undefined) updates.scaleDownThreshold = parsed.data.scale_down_threshold;
    if (parsed.data.scale_down_by !== undefined) updates.scaleDownBy = parsed.data.scale_down_by;
    if (parsed.data.scale_down_cooldown !== undefined) updates.scaleDownCooldown = parsed.data.scale_down_cooldown;
    if (parsed.data.min_replicas !== undefined) updates.minReplicas = parsed.data.min_replicas;
    if (parsed.data.max_replicas !== undefined) updates.maxReplicas = parsed.data.max_replicas;

    const [updated] = await db
      .update(autoScalingRules)
      .set(updates)
      .where(eq(autoScalingRules.id, params.ruleId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        is_enabled: updated.isEnabled,
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/services/[serviceId]/scaling/rules/[ruleId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/services/[serviceId]/scaling/rules/[ruleId] - Delete scaling rule
export async function DELETE(
  req: NextRequest,
  { params }: { params: { serviceId: string; ruleId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const hasAccess = await checkServiceAccess(session.user.id, params.serviceId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const existingRule = await db.query.autoScalingRules.findFirst({
      where: and(
        eq(autoScalingRules.id, params.ruleId),
        eq(autoScalingRules.serviceId, params.serviceId)
      ),
    });

    if (!existingRule) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Scaling rule not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    await db.delete(autoScalingRules).where(eq(autoScalingRules.id, params.ruleId));

    return NextResponse.json({
      success: true,
      message: 'Scaling rule deleted',
    });
  } catch (error) {
    console.error('DELETE /api/v1/services/[serviceId]/scaling/rules/[ruleId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
