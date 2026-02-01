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

// Create rule schema
const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  metric: z.enum(['cpu_percent', 'memory_percent', 'request_count', 'response_time_ms', 'custom']),
  custom_metric_name: z.string().max(255).optional(),
  scale_up_threshold: z.number().int().min(1).max(100),
  scale_up_by: z.number().int().min(1).max(10).default(1),
  scale_up_cooldown: z.number().int().min(60).max(3600).default(300),
  scale_down_threshold: z.number().int().min(0).max(99),
  scale_down_by: z.number().int().min(1).max(10).default(1),
  scale_down_cooldown: z.number().int().min(60).max(3600).default(300),
  min_replicas: z.number().int().min(1).max(100).default(1),
  max_replicas: z.number().int().min(1).max(100).default(10),
  is_enabled: z.boolean().default(true),
});

// GET /api/v1/services/[serviceId]/scaling/rules - List scaling rules
export async function GET(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
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

    const rules = await db.query.autoScalingRules.findMany({
      where: eq(autoScalingRules.serviceId, params.serviceId),
    });

    return NextResponse.json({
      success: true,
      data: rules.map(r => ({
        id: r.id,
        name: r.name,
        metric: r.metric,
        custom_metric_name: r.customMetricName,
        is_enabled: r.isEnabled,
        scale_up_threshold: r.scaleUpThreshold,
        scale_up_by: r.scaleUpBy,
        scale_up_cooldown: r.scaleUpCooldown,
        scale_down_threshold: r.scaleDownThreshold,
        scale_down_by: r.scaleDownBy,
        scale_down_cooldown: r.scaleDownCooldown,
        min_replicas: r.minReplicas,
        max_replicas: r.maxReplicas,
        evaluation_period: r.evaluationPeriod,
        evaluation_data_points: r.evaluationDataPoints,
        last_scale_action: r.lastScaleAction?.toISOString(),
        last_scale_direction: r.lastScaleDirection,
        created_at: r.createdAt?.toISOString(),
        updated_at: r.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/services/[serviceId]/scaling/rules error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/services/[serviceId]/scaling/rules - Create scaling rule
export async function POST(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
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

    const body = await req.json();
    const parsed = createRuleSchema.safeParse(body);

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

    // Validate that scale_down_threshold < scale_up_threshold
    if (parsed.data.scale_down_threshold >= parsed.data.scale_up_threshold) {
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

    // Validate min/max replicas
    if (parsed.data.min_replicas > parsed.data.max_replicas) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'min_replicas cannot be greater than max_replicas',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    const [rule] = await db
      .insert(autoScalingRules)
      .values({
        serviceId: params.serviceId,
        name: parsed.data.name,
        metric: parsed.data.metric,
        customMetricName: parsed.data.custom_metric_name,
        isEnabled: parsed.data.is_enabled,
        scaleUpThreshold: parsed.data.scale_up_threshold,
        scaleUpBy: parsed.data.scale_up_by,
        scaleUpCooldown: parsed.data.scale_up_cooldown,
        scaleDownThreshold: parsed.data.scale_down_threshold,
        scaleDownBy: parsed.data.scale_down_by,
        scaleDownCooldown: parsed.data.scale_down_cooldown,
        minReplicas: parsed.data.min_replicas,
        maxReplicas: parsed.data.max_replicas,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: rule.id,
          name: rule.name,
          metric: rule.metric,
          is_enabled: rule.isEnabled,
          min_replicas: rule.minReplicas,
          max_replicas: rule.maxReplicas,
          created_at: rule.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/services/[serviceId]/scaling/rules error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
