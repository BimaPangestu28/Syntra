import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, uptimeMonitors, uptimeChecks, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

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

const PERIOD_MAP: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * GET /api/v1/services/:serviceId/health - Get service health status
 */
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

    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: { project: true },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const access = await checkOrgAccess(session.user.id, service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || '24h';
    const periodMs = PERIOD_MAP[period] || PERIOD_MAP['24h'];
    const since = new Date(Date.now() - periodMs);

    // Get uptime monitors linked to this service
    const monitors = await db.query.uptimeMonitors.findMany({
      where: eq(uptimeMonitors.serviceId, params.serviceId),
    });

    if (monitors.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          service_id: params.serviceId,
          status: 'unknown',
          message: 'No uptime monitors configured',
          monitors: [],
        },
      });
    }

    const monitorResults = await Promise.all(
      monitors.map(async (monitor) => {
        // Get checks within the period
        const checks = await db.query.uptimeChecks.findMany({
          where: and(
            eq(uptimeChecks.monitorId, monitor.id),
            gte(uptimeChecks.createdAt, since)
          ),
          orderBy: [desc(uptimeChecks.createdAt)],
        });

        const totalChecks = checks.length;
        const successChecks = checks.filter((c) => c.status === 'up').length;
        const uptimePercent = totalChecks > 0 ? (successChecks / totalChecks) * 100 : 0;

        const responseTimes = checks
          .filter((c) => c.responseTime !== null)
          .map((c) => c.responseTime!);
        const avgResponseTime =
          responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : 0;

        const latestCheck = checks[0] || null;

        return {
          monitor_id: monitor.id,
          name: monitor.name,
          url: monitor.url,
          current_status: latestCheck?.status || monitor.lastStatus || 'unknown',
          uptime_percent: Math.round(uptimePercent * 100) / 100,
          avg_response_time_ms: Math.round(avgResponseTime),
          total_checks: totalChecks,
          last_check_at: latestCheck?.createdAt?.toISOString() || monitor.lastCheckAt?.toISOString() || null,
          recent_checks: checks.slice(0, 10).map((c) => ({
            status: c.status,
            status_code: c.statusCode,
            response_time: c.responseTime,
            error_message: c.errorMessage,
            checked_at: c.createdAt.toISOString(),
          })),
        };
      })
    );

    // Aggregate status: if any monitor is down, service is degraded
    const allStatuses = monitorResults.map((m) => m.current_status);
    let overallStatus = 'healthy';
    if (allStatuses.every((s) => s === 'down')) {
      overallStatus = 'down';
    } else if (allStatuses.some((s) => s === 'down')) {
      overallStatus = 'degraded';
    }

    const overallUptime =
      monitorResults.length > 0
        ? monitorResults.reduce((sum, m) => sum + m.uptime_percent, 0) / monitorResults.length
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        service_id: params.serviceId,
        status: overallStatus,
        uptime_percent: Math.round(overallUptime * 100) / 100,
        period,
        monitors: monitorResults,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/services/:serviceId/health error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
