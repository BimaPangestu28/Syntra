import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { servers, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin']
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

// POST /api/v1/servers/:serverId/regenerate-token - Regenerate agent token
export async function POST(
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
    const access = await checkOrgAccess(session.user.id, server.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied. Only admins and owners can regenerate tokens.', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Generate new agent token
    const agentToken = `syn_agt_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(agentToken).digest('hex');

    // Update server with new token hash
    await db
      .update(servers)
      .set({
        agentTokenHash: tokenHash,
        updatedAt: new Date(),
      })
      .where(eq(servers.id, params.serverId));

    // Generate install command
    const scriptUrl = process.env.NEXT_PUBLIC_INSTALL_SCRIPT_URL || 'https://get.syntra.catalystlabs.id';
    const installCommand = `curl -fsSL ${scriptUrl} | sh -s -- --token ${agentToken}`;

    return NextResponse.json({
      success: true,
      data: {
        server_id: server.id,
        server_name: server.name,
        install_command: installCommand,
        token: agentToken, // Only shown once
        message: 'Token regenerated successfully. The old token is now invalid.',
      },
    });
  } catch (error) {
    console.error('POST /api/v1/servers/:serverId/regenerate-token error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
