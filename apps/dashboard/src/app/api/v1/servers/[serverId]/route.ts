import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { servers, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';
import { agentHub } from '@/lib/agent/hub';

// Request schema
const updateServerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  tags: z.array(z.string()).optional(),
});

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

  if (!membership) {
    return null;
  }

  if (!allowedRoles.includes(membership.role)) {
    return null;
  }

  return membership;
}

// GET /api/v1/servers/:serverId - Get server details
export async function GET(
  req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const server = await db.query.servers.findFirst({
      where: eq(servers.id, params.serverId),
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Server not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, server.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Get real-time status from AgentHub
    const isConnected = agentHub.isAgentConnected(server.id);
    const agentInfo = agentHub.getAgentInfo(server.id);

    return NextResponse.json({
      success: true,
      data: {
        id: server.id,
        org_id: server.orgId,
        name: server.name,
        hostname: server.hostname,
        public_ip: server.publicIp,
        private_ip: server.privateIp,
        runtime: server.runtime,
        runtime_version: server.runtimeVersion,
        status: isConnected ? 'online' : server.status,
        agent_version: server.agentVersion,
        os_name: server.osName,
        os_version: server.osVersion,
        arch: server.arch,
        cpu_cores: server.cpuCores,
        memory_mb: server.memoryMb,
        disk_gb: server.diskGb,
        last_heartbeat_at: agentInfo?.lastHeartbeat?.toISOString() || server.lastHeartbeatAt?.toISOString(),
        tags: server.tags,
        created_at: server.createdAt?.toISOString(),
        updated_at: server.updatedAt?.toISOString(),
        // Real-time info
        is_connected: isConnected,
        agent_id: agentInfo?.agentId,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/servers/:serverId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/servers/:serverId - Update server
export async function PATCH(
  req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const server = await db.query.servers.findFirst({
      where: eq(servers.id, params.serverId),
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Server not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (need admin or owner)
    const access = await checkOrgAccess(session.user.id, server.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateServerSchema.safeParse(body);

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

    const updateData: Partial<typeof servers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name;
    }
    if (parsed.data.tags !== undefined) {
      updateData.tags = parsed.data.tags;
    }

    const [updated] = await db
      .update(servers)
      .set(updateData)
      .where(eq(servers.id, params.serverId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        org_id: updated.orgId,
        name: updated.name,
        hostname: updated.hostname,
        public_ip: updated.publicIp,
        private_ip: updated.privateIp,
        runtime: updated.runtime,
        runtime_version: updated.runtimeVersion,
        status: updated.status,
        agent_version: updated.agentVersion,
        os_name: updated.osName,
        os_version: updated.osVersion,
        arch: updated.arch,
        cpu_cores: updated.cpuCores,
        memory_mb: updated.memoryMb,
        disk_gb: updated.diskGb,
        last_heartbeat_at: updated.lastHeartbeatAt?.toISOString(),
        tags: updated.tags,
        created_at: updated.createdAt?.toISOString(),
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/servers/:serverId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/servers/:serverId - Delete server
export async function DELETE(
  req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const server = await db.query.servers.findFirst({
      where: eq(servers.id, params.serverId),
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Server not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (need admin or owner)
    const access = await checkOrgAccess(session.user.id, server.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // TODO: Check if server has running services and warn/prevent deletion

    await db.delete(servers).where(eq(servers.id, params.serverId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/v1/servers/:serverId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
