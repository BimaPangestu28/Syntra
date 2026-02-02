import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { uptimeMonitors, uptimeChecks, organizationMembers, alerts } from '@/lib/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

const PERIOD_MAP: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// GET /api/v1/uptime/[monitorId]/stats
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { monitorId } = await params;
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || '24h';

    const periodMs = PERIOD_MAP[period];
    if (!periodMs) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid period. Use: 1h, 24h, 7d, 30d', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const monitor = await db.query.uptimeMonitors.findFirst({
      where: eq(uptimeMonitors.id, monitorId),
    });

    if (!monitor) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Monitor not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check access
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, monitor.orgId)
      ),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const since = new Date(Date.now() - periodMs);

    // Fetch checks in the period
    const checks = await db.query.uptimeChecks.findMany({
      where: and(
        eq(uptimeChecks.monitorId, monitorId),
        gte(uptimeChecks.createdAt, since)
      ),
      orderBy: [desc(uptimeChecks.createdAt)],
    });

    // Calculate stats
    const totalChecks = checks.length;
    const upChecks = checks.filter(c => c.status === 'up').length;
    const uptimePercentage = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;

    const responseTimes = checks
      .filter(c => c.responseTime !== null)
      .map(c => c.responseTime!);

    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    const p50 = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.5)] : null;
    const p95 = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.95)] : null;
    const p99 = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.99)] : null;

    // Find incidents (consecutive down periods)
    const incidents: Array<{ started_at: string; ended_at: string | null; duration_ms: number; checks_count: number }> = [];
    let currentIncident: { startedAt: Date; endedAt: Date | null; count: number } | null = null;

    // Process checks in chronological order
    const chronologicalChecks = [...checks].reverse();
    for (const check of chronologicalChecks) {
      if (check.status === 'down') {
        if (!currentIncident) {
          currentIncident = { startedAt: check.createdAt, endedAt: null, count: 1 };
        } else {
          currentIncident.count++;
          currentIncident.endedAt = check.createdAt;
        }
      } else {
        if (currentIncident) {
          incidents.push({
            started_at: currentIncident.startedAt.toISOString(),
            ended_at: (currentIncident.endedAt || currentIncident.startedAt).toISOString(),
            duration_ms: (currentIncident.endedAt || currentIncident.startedAt).getTime() - currentIncident.startedAt.getTime(),
            checks_count: currentIncident.count,
          });
          currentIncident = null;
        }
      }
    }
    if (currentIncident) {
      incidents.push({
        started_at: currentIncident.startedAt.toISOString(),
        ended_at: null, // still ongoing
        duration_ms: Date.now() - currentIncident.startedAt.getTime(),
        checks_count: currentIncident.count,
      });
    }

    // Build chart data - bucket checks into intervals
    const bucketCount = Math.min(totalChecks, 60);
    const bucketSize = bucketCount > 0 ? Math.ceil(totalChecks / bucketCount) : 1;
    const chartData: Array<{ timestamp: string; response_time: number | null; status: string }> = [];

    for (let i = 0; i < checks.length; i += bucketSize) {
      const bucket = checks.slice(i, i + bucketSize);
      const avgTime = bucket
        .filter(c => c.responseTime !== null)
        .reduce((sum, c) => sum + c.responseTime!, 0) / bucket.filter(c => c.responseTime !== null).length;
      const hasDown = bucket.some(c => c.status === 'down');

      chartData.push({
        timestamp: bucket[0].createdAt.toISOString(),
        response_time: isNaN(avgTime) ? null : Math.round(avgTime),
        status: hasDown ? 'down' : 'up',
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        period,
        total_checks: totalChecks,
        uptime_percentage: Math.round(uptimePercentage * 100) / 100,
        response_times: {
          avg: avgResponseTime,
          p50,
          p95,
          p99,
        },
        incidents,
        chart_data: chartData.reverse(), // chronological order
      },
    });
  } catch (error) {
    console.error('GET /api/v1/uptime/[monitorId]/stats error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
