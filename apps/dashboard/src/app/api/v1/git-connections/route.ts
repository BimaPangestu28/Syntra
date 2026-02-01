import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { gitConnections, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin']
): Promise<boolean> {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });
  return !!membership && allowedRoles.includes(membership.role);
}

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// Create git connection schema
const createGitConnectionSchema = z.object({
  org_id: z.string().uuid(),
  provider: z.enum(['github', 'gitlab', 'bitbucket']),
  name: z.string().min(1).max(255),
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  provider_username: z.string().optional(),
});

// GET /api/v1/git-connections - List git connections
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
    const orgId = searchParams.get('org_id');
    const provider = searchParams.get('provider');

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    const connections = await db.query.gitConnections.findMany({
      where: (c, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) => {
        const conditions = [inArrayWhere(c.orgId, targetOrgIds)];
        if (provider) conditions.push(eqWhere(c.provider, provider as any));
        return andWhere(...conditions);
      },
      orderBy: [desc(gitConnections.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: connections.map(c => ({
        id: c.id,
        org_id: c.orgId,
        provider: c.provider,
        name: c.name,
        provider_username: c.providerUsername,
        is_active: c.isActive,
        created_at: c.createdAt.toISOString(),
        updated_at: c.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/git-connections error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/git-connections - Create git connection
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
    const parsed = createGitConnectionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const hasAccess = await checkOrgAccess(session.user.id, parsed.data.org_id);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const [connection] = await db
      .insert(gitConnections)
      .values({
        orgId: parsed.data.org_id,
        provider: parsed.data.provider,
        name: parsed.data.name,
        accessToken: parsed.data.access_token, // Should be encrypted in production
        refreshToken: parsed.data.refresh_token,
        providerUsername: parsed.data.provider_username,
        webhookSecret,
        createdBy: session.user.id,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: connection.id,
          provider: connection.provider,
          name: connection.name,
          webhook_secret: webhookSecret,
          webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/${connection.provider}`,
          created_at: connection.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/git-connections error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
