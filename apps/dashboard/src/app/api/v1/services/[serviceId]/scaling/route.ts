import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, autoScalingRules, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';
import { scaleService, getScalingStatus, getScalingHistory } from '@/lib/scaling';

// Helper to check service access
async function checkServiceAccess(
  userId: string,
  serviceId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer', 'viewer']
): Promise<{ hasAccess: boolean; orgId?: string }> {
  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
    with: {
      project: true,
    },
  });

  if (!service) {
    return { hasAccess: false };
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, service.project.orgId)
    ),
  });

  if (!membership || !allowedRoles.includes(membership.role)) {
    return { hasAccess: false };
  }

  return { hasAccess: true, orgId: service.project.orgId };
}

// GET /api/v1/services/[serviceId]/scaling - Get scaling status
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

    const access = await checkServiceAccess(session.user.id, params.serviceId);
    if (!access.hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const includeHistory = searchParams.get('include_history') === 'true';

    const status = await getScalingStatus(params.serviceId);

    const response: any = {
      success: true,
      data: {
        current_replicas: status.currentReplicas,
        rules: status.rules.map(r => ({
          id: r.id,
          name: r.name,
          metric: r.metric,
          is_enabled: r.isEnabled,
          min_replicas: r.minReplicas,
          max_replicas: r.maxReplicas,
          scale_up_threshold: r.scaleUpThreshold,
          scale_down_threshold: r.scaleDownThreshold,
          last_scale_action: r.lastScaleAction?.toISOString(),
        })),
        recent_events: status.recentEvents.map(e => ({
          direction: e.direction,
          from_replicas: e.fromReplicas,
          to_replicas: e.toReplicas,
          created_at: e.createdAt.toISOString(),
        })),
      },
    };

    if (includeHistory) {
      const history = await getScalingHistory(params.serviceId, 50);
      response.data.history = history.map(h => ({
        id: h.id,
        direction: h.direction,
        from_replicas: h.fromReplicas,
        to_replicas: h.toReplicas,
        reason: h.reason,
        status: h.status,
        created_at: h.createdAt.toISOString(),
      }));
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('GET /api/v1/services/[serviceId]/scaling error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// Scale request schema
const scaleSchema = z.object({
  replicas: z.number().int().min(1).max(100),
  reason: z.string().optional(),
});

// POST /api/v1/services/[serviceId]/scaling - Manual scale
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

    // Only developers and above can scale
    const access = await checkServiceAccess(session.user.id, params.serviceId, ['owner', 'admin', 'developer']);
    if (!access.hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = scaleSchema.safeParse(body);

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

    const result = await scaleService({
      serviceId: params.serviceId,
      replicas: parsed.data.replicas,
      reason: parsed.data.reason || `Manual scale by user ${session.user.id}`,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'SCALE_FAILED', message: result.error, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        service_id: params.serviceId,
        replicas: parsed.data.replicas,
        message: 'Scale command sent',
      },
    });
  } catch (error) {
    console.error('POST /api/v1/services/[serviceId]/scaling error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
