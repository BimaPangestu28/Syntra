import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

/**
 * Permission to role mapping.
 * Each permission maps to the roles that are allowed to perform it.
 */
const PERMISSION_ROLES: Record<string, string[]> = {
  'service:create': ['owner', 'admin', 'developer'],
  'service:deploy': ['owner', 'admin', 'developer'],
  'service:delete': ['owner', 'admin'],
  'env:write': ['owner', 'admin', 'developer'],
  'org:members:invite': ['owner', 'admin'],
  'org:members:remove': ['owner', 'admin'],
};

/**
 * Check if a user has a specific permission within an organization.
 * Returns the membership record if authorized, null otherwise.
 */
export async function checkPermission(
  userId: string,
  orgId: string,
  permission: string
): Promise<typeof organizationMembers.$inferSelect | null> {
  const allowedRoles = PERMISSION_ROLES[permission];
  if (!allowedRoles) {
    console.warn(`[RBAC] Unknown permission: ${permission}`);
    return null;
  }

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

/**
 * Higher-order function that wraps an API route handler with permission checking.
 *
 * The wrapped handler receives the session user ID and the verified membership.
 * The `getOrgId` callback extracts the organization ID from the request context.
 */
export function withPermission(
  permission: string,
  getOrgId: (req: NextRequest, params: Record<string, string>) => Promise<string | null>,
  handler: (
    req: NextRequest,
    context: {
      params: Record<string, string>;
      userId: string;
      membership: typeof organizationMembers.$inferSelect;
    }
  ) => Promise<NextResponse>
) {
  return async (req: NextRequest, { params }: { params: Record<string, string> }) => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 401 }
      );
    }

    const orgId = await getOrgId(req, params);
    if (!orgId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 404 }
      );
    }

    const membership = await checkPermission(session.user.id, orgId, permission);
    if (!membership) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Insufficient permissions: ${permission} required`,
            request_id: crypto.randomUUID(),
          },
        },
        { status: 403 }
      );
    }

    return handler(req, {
      params,
      userId: session.user.id,
      membership,
    });
  };
}
