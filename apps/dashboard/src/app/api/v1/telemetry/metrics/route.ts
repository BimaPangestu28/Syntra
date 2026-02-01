import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { servers, organizationMembers } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import {
  getServerMetrics,
  getContainerMetrics,
  getMetricTimeSeries,
} from '@/lib/telemetry/ingestion';

// GET /api/v1/telemetry/metrics - Get metrics for servers/containers
export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: requestId } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get('server_id');
    const containerId = searchParams.get('container_id');
    const metric = searchParams.get('metric');
    const startTime = searchParams.get('start');
    const endTime = searchParams.get('end');
    const type = searchParams.get('type') || 'current'; // current, timeseries

    // Get user's organizations
    const memberships = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, session.user.id),
    });
    const orgIds = memberships.map(m => m.orgId);

    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {},
      });
    }

    // If server_id provided, verify access
    if (serverId) {
      const server = await db.query.servers.findFirst({
        where: and(
          eq(servers.id, serverId),
          inArray(servers.orgId, orgIds)
        ),
      });

      if (!server) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: requestId } },
          { status: 403 }
        );
      }

      if (type === 'current') {
        // Get current metrics
        const metrics = await getServerMetrics(serverId);

        return NextResponse.json({
          success: true,
          data: {
            server_id: serverId,
            metrics: metrics ? {
              cpu_percent: parseFloat(metrics.cpu_percent || '0'),
              memory_used_mb: parseFloat(metrics.memory_used_mb || '0'),
              memory_total_mb: parseFloat(metrics.memory_total_mb || '0'),
              memory_percent: parseFloat(metrics.memory_percent || '0'),
              disk_used_gb: parseFloat(metrics.disk_used_gb || '0'),
              disk_total_gb: parseFloat(metrics.disk_total_gb || '0'),
              disk_percent: parseFloat(metrics.disk_percent || '0'),
              load_avg_1m: parseFloat(metrics.load_avg_1m || '0'),
              container_count: parseInt(metrics.container_count || '0'),
              uptime_seconds: parseInt(metrics.uptime_seconds || '0'),
              updated_at: parseInt(metrics.updated_at || '0'),
            } : null,
          },
        });
      }

      if (type === 'timeseries' && metric) {
        const start = startTime ? parseInt(startTime) : Date.now() - 3600000; // Default last hour
        const end = endTime ? parseInt(endTime) : Date.now();

        const timeSeries = await getMetricTimeSeries('server', serverId, metric, start, end);

        return NextResponse.json({
          success: true,
          data: {
            server_id: serverId,
            metric,
            start_time: start,
            end_time: end,
            data_points: timeSeries,
          },
        });
      }
    }

    // If container_id provided
    if (containerId) {
      if (type === 'current') {
        const metrics = await getContainerMetrics(containerId);

        if (!metrics) {
          return NextResponse.json({
            success: true,
            data: {
              container_id: containerId,
              metrics: null,
            },
          });
        }

        // Verify server access
        const server = await db.query.servers.findFirst({
          where: and(
            eq(servers.id, metrics.server_id),
            inArray(servers.orgId, orgIds)
          ),
        });

        if (!server) {
          return NextResponse.json(
            { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: requestId } },
            { status: 403 }
          );
        }

        return NextResponse.json({
          success: true,
          data: {
            container_id: containerId,
            metrics: {
              server_id: metrics.server_id,
              container_name: metrics.container_name,
              service_id: metrics.service_id || null,
              cpu_percent: parseFloat(metrics.cpu_percent || '0'),
              memory_used_mb: parseFloat(metrics.memory_used_mb || '0'),
              memory_limit_mb: parseFloat(metrics.memory_limit_mb || '0'),
              memory_percent: parseFloat(metrics.memory_percent || '0'),
              network_rx_bytes: parseInt(metrics.network_rx_bytes || '0'),
              network_tx_bytes: parseInt(metrics.network_tx_bytes || '0'),
              status: metrics.status,
              updated_at: parseInt(metrics.updated_at || '0'),
            },
          },
        });
      }

      if (type === 'timeseries' && metric) {
        const start = startTime ? parseInt(startTime) : Date.now() - 3600000;
        const end = endTime ? parseInt(endTime) : Date.now();

        const timeSeries = await getMetricTimeSeries('container', containerId, metric, start, end);

        return NextResponse.json({
          success: true,
          data: {
            container_id: containerId,
            metric,
            start_time: start,
            end_time: end,
            data_points: timeSeries,
          },
        });
      }
    }

    // If no specific resource requested, return all servers metrics
    const userServers = await db.query.servers.findMany({
      where: inArray(servers.orgId, orgIds),
    });

    const serverMetrics = await Promise.all(
      userServers.map(async (server) => {
        const metrics = await getServerMetrics(server.id);
        return {
          server_id: server.id,
          server_name: server.name,
          status: server.status,
          metrics: metrics ? {
            cpu_percent: parseFloat(metrics.cpu_percent || '0'),
            memory_percent: parseFloat(metrics.memory_percent || '0'),
            disk_percent: parseFloat(metrics.disk_percent || '0'),
            container_count: parseInt(metrics.container_count || '0'),
            updated_at: parseInt(metrics.updated_at || '0'),
          } : null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        servers: serverMetrics,
      },
    });

  } catch (error) {
    console.error('GET /api/v1/telemetry/metrics error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: requestId } },
      { status: 500 }
    );
  }
}
