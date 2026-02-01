import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { servers, organizations, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schemas
const createServerSchema = z.object({
  name: z.string().min(1).max(255),
  tags: z.array(z.string()).optional().default([]),
});

// Helper to get user's organizations
async function getUserOrgs(userId: string) {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
    with: {
      organization: true,
    },
  });

  return memberships.map((m) => m.organization);
}

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

// GET /api/v1/servers - List servers
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20', 10), 100);

    // If org_id specified, check access
    if (orgId) {
      const access = await checkOrgAccess(session.user.id, orgId);
      if (!access) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
          { status: 403 }
        );
      }
    }

    // Get user's organizations
    const userOrgs = orgId
      ? [{ id: orgId }]
      : await getUserOrgs(session.user.id);

    const orgIds = userOrgs.map((o) => o.id);

    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, page, per_page: perPage },
      });
    }

    // Build query conditions
    let query = db.query.servers.findMany({
      where: (servers, { inArray, and, eq: whereEq }) => {
        const conditions = [inArray(servers.orgId, orgIds)];
        if (status && status !== 'all') {
          conditions.push(whereEq(servers.status, status as any));
        }
        return and(...conditions);
      },
      orderBy: [desc(servers.createdAt)],
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    const serverList = await query;

    // Get total count (simplified - in production use COUNT query)
    const total = serverList.length;

    return NextResponse.json({
      success: true,
      data: serverList.map((s) => ({
        id: s.id,
        org_id: s.orgId,
        name: s.name,
        hostname: s.hostname,
        public_ip: s.publicIp,
        private_ip: s.privateIp,
        runtime: s.runtime,
        runtime_version: s.runtimeVersion,
        status: s.status,
        agent_version: s.agentVersion,
        os_name: s.osName,
        os_version: s.osVersion,
        arch: s.arch,
        cpu_cores: s.cpuCores,
        memory_mb: s.memoryMb,
        disk_gb: s.diskGb,
        last_heartbeat_at: s.lastHeartbeatAt?.toISOString(),
        tags: s.tags,
        created_at: s.createdAt?.toISOString(),
        updated_at: s.updatedAt?.toISOString(),
      })),
      meta: {
        total,
        page,
        per_page: perPage,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/servers error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/servers - Register new server
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
    const parsed = createServerSchema.safeParse(body);

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

    const { name, tags } = parsed.data;

    // Get org_id from query or use default organization
    const { searchParams } = new URL(req.url);
    let orgId = searchParams.get('org_id');

    if (!orgId) {
      // Get user's first organization (or create one)
      const userOrgs = await getUserOrgs(session.user.id);

      if (userOrgs.length === 0) {
        // Create default organization
        const [newOrg] = await db
          .insert(organizations)
          .values({
            name: `${session.user.name || 'User'}'s Organization`,
            slug: `org-${crypto.randomBytes(4).toString('hex')}`,
            ownerId: session.user.id,
          })
          .returning();

        // Add user as owner
        await db.insert(organizationMembers).values({
          orgId: newOrg.id,
          userId: session.user.id,
          role: 'owner',
          acceptedAt: new Date(),
        });

        orgId = newOrg.id;
      } else {
        orgId = userOrgs[0].id;
      }
    }

    // Verify org access
    const access = await checkOrgAccess(session.user.id, orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Generate agent token
    const agentToken = `syn_agt_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(agentToken).digest('hex');

    // Create server record
    const [server] = await db
      .insert(servers)
      .values({
        orgId,
        name,
        agentTokenHash: tokenHash,
        tags,
        status: 'offline',
      })
      .returning();

    // Generate install command
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.syntra.catalystlabs.id';
    const scriptUrl = process.env.NEXT_PUBLIC_INSTALL_SCRIPT_URL || 'https://get.syntra.catalystlabs.id';
    const installCommand = `curl -fsSL ${scriptUrl} | sh -s -- --token ${agentToken}`;

    return NextResponse.json(
      {
        success: true,
        data: {
          server_id: server.id,
          install_command: installCommand,
          token: agentToken, // Only shown once
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/servers error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
