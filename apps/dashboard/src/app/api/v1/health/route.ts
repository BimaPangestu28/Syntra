import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { servers, organizationMembers } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { checkServerHealth, checkAllServersHealth, pingServer, isHealthCheckerRunning } from '@/lib/health';

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// GET /api/v1/health - Get health status of all servers
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
    const serverId = searchParams.get('server_id');

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          servers: [],
          summary: {
            total: 0,
            healthy: 0,
            unhealthy: 0,
            offline: 0,
          },
          health_checker_running: isHealthCheckerRunning(),
        },
      });
    }

    // If specific server requested, check just that one
    if (serverId) {
      // Verify server belongs to user's org
      const server = await db.query.servers.findFirst({
        where: and(
          eq(servers.id, serverId),
          inArray(servers.orgId, orgIds)
        ),
      });

      if (!server) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Server not found', request_id: crypto.randomUUID() } },
          { status: 404 }
        );
      }

      const healthResult = await checkServerHealth(serverId);

      return NextResponse.json({
        success: true,
        data: {
          server_id: healthResult.serverId,
          server_name: healthResult.serverName,
          status: healthResult.status,
          is_connected: healthResult.isConnected,
          last_heartbeat: healthResult.lastHeartbeat?.toISOString(),
          error: healthResult.error,
        },
      });
    }

    // Get all servers for user's orgs
    const userServers = await db.query.servers.findMany({
      where: inArray(servers.orgId, orgIds),
    });

    // Check health of all servers
    const allResults = await checkAllServersHealth();

    // Filter results to only user's servers
    const userServerIds = new Set(userServers.map(s => s.id));
    const filteredResults = allResults.filter(r => userServerIds.has(r.serverId));

    // Calculate summary
    const summary = {
      total: filteredResults.length,
      healthy: filteredResults.filter(r => r.status === 'healthy').length,
      unhealthy: filteredResults.filter(r => r.status === 'unhealthy').length,
      offline: filteredResults.filter(r => r.status === 'offline').length,
    };

    return NextResponse.json({
      success: true,
      data: {
        servers: filteredResults.map(r => ({
          server_id: r.serverId,
          server_name: r.serverName,
          status: r.status,
          is_connected: r.isConnected,
          last_heartbeat: r.lastHeartbeat?.toISOString(),
          error: r.error,
        })),
        summary,
        health_checker_running: isHealthCheckerRunning(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/health error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/health/ping - Ping a specific server
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
    const serverId = body.server_id;

    if (!serverId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'server_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const orgIds = await getUserOrgIds(session.user.id);

    // Verify server belongs to user's org
    const server = await db.query.servers.findFirst({
      where: and(
        eq(servers.id, serverId),
        inArray(servers.orgId, orgIds)
      ),
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Server not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const pingResult = await pingServer(serverId);

    return NextResponse.json({
      success: true,
      data: {
        server_id: serverId,
        server_name: server.name,
        reachable: pingResult.success,
        latency_ms: pingResult.latencyMs,
        error: pingResult.error,
      },
    });
  } catch (error) {
    console.error('POST /api/v1/health/ping error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
