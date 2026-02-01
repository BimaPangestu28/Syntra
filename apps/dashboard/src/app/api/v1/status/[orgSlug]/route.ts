import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { organizations, services, uptimeMonitors, uptimeChecks, alerts } from '@/lib/db/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import crypto from 'crypto';

// GET /api/v1/status/[orgSlug] - Get public status page data
// This endpoint is public and does not require authentication
export async function GET(
  req: NextRequest,
  { params }: { params: { orgSlug: string } }
) {
  try {
    // Find organization by slug
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.slug, params.orgSlug),
    });

    if (!org) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check if status page is enabled (you can add a field to org settings later)
    // For now, we'll return status for all orgs

    // Get uptime monitors for this org
    const monitors = await db.query.uptimeMonitors.findMany({
      where: and(
        eq(uptimeMonitors.orgId, org.id),
        eq(uptimeMonitors.isEnabled, true)
      ),
      with: {
        service: {
          columns: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    // Get recent uptime checks for each monitor (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const monitorsWithUptime = await Promise.all(
      monitors.map(async (monitor) => {
        // Get recent checks
        const recentChecks = await db.query.uptimeChecks.findMany({
          where: and(
            eq(uptimeChecks.monitorId, monitor.id),
            gte(uptimeChecks.createdAt, twentyFourHoursAgo)
          ),
          orderBy: [desc(uptimeChecks.createdAt)],
          limit: 50,
        });

        // Calculate uptime percentage
        const totalChecks = recentChecks.length;
        const upChecks = recentChecks.filter((c) => c.status === 'up').length;
        const uptimePercentage = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;

        // Calculate average response time
        const responseTimes = recentChecks
          .filter((c) => c.responseTime !== null)
          .map((c) => c.responseTime as number);
        const avgResponseTime =
          responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : null;

        return {
          id: monitor.id,
          name: monitor.name,
          service_name: monitor.service?.name || null,
          service_type: monitor.service?.type || null,
          status: monitor.lastStatus || 'unknown',
          uptime_percentage: Math.round(uptimePercentage * 100) / 100,
          avg_response_time: avgResponseTime ? Math.round(avgResponseTime) : null,
          last_check_at: monitor.lastCheckAt?.toISOString() || null,
        };
      })
    );

    // Get recent incidents (active and recently resolved alerts)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentAlerts = await db.query.alerts.findMany({
      where: and(
        eq(alerts.orgId, org.id),
        gte(alerts.createdAt, sevenDaysAgo)
      ),
      orderBy: [desc(alerts.createdAt)],
      limit: 20,
    });

    // Calculate overall status
    const hasActiveIncident = recentAlerts.some((a) => a.status === 'active');
    const hasDown = monitorsWithUptime.some((m) => m.status === 'down');
    const hasDegraded = monitorsWithUptime.some((m) => m.status === 'degraded');

    let overallStatus: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' = 'operational';
    if (hasDown && monitorsWithUptime.filter((m) => m.status === 'down').length > monitorsWithUptime.length / 2) {
      overallStatus = 'major_outage';
    } else if (hasDown) {
      overallStatus = 'partial_outage';
    } else if (hasDegraded || hasActiveIncident) {
      overallStatus = 'degraded';
    }

    return NextResponse.json({
      success: true,
      data: {
        organization: {
          name: org.name,
          slug: org.slug,
        },
        overall_status: overallStatus,
        services: monitorsWithUptime,
        incidents: recentAlerts.map((a) => ({
          id: a.id,
          title: a.title,
          message: a.message,
          severity: a.severity,
          status: a.status,
          started_at: a.createdAt.toISOString(),
          resolved_at: a.resolvedAt?.toISOString() || null,
        })),
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/status/[orgSlug] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
