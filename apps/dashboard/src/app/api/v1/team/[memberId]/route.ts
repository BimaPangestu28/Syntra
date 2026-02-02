import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { checkPermission } from '@/lib/auth/require-permission';
import { z } from 'zod';

// Request schemas
const updateRoleSchema = z.object({
  role: z.enum(['admin', 'developer', 'viewer']),
});

// Helper to check org access and return membership
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

// PATCH /api/v1/team/:memberId - Update member role
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { memberId } = await params;

    const body = await req.json();
    const parsed = updateRoleSchema.safeParse(body);

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

    const { role } = parsed.data;

    // Find the target member
    const targetMember = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, memberId),
      with: {
        user: true,
      },
    });

    if (!targetMember) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Member not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Cannot change the owner's role
    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot change the owner\'s role', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Only owner/admin can change roles
    const access = await checkOrgAccess(session.user.id, targetMember.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Only owners and admins can change roles', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Cannot demote yourself if you're the only admin
    if (targetMember.userId === session.user.id && access.role === 'admin' && role !== 'admin') {
      const adminCount = await db.query.organizationMembers.findMany({
        where: and(
          eq(organizationMembers.orgId, targetMember.orgId),
          eq(organizationMembers.role, 'admin')
        ),
      });

      if (adminCount.length <= 1) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Cannot demote yourself when you are the only admin', request_id: crypto.randomUUID() } },
          { status: 403 }
        );
      }
    }

    // Update role
    const [updated] = await db
      .update(organizationMembers)
      .set({ role })
      .where(eq(organizationMembers.id, memberId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        user: {
          id: targetMember.user.id,
          name: targetMember.user.name,
          email: targetMember.user.email,
          image: targetMember.user.image,
        },
        role: updated.role,
        invited_at: updated.invitedAt?.toISOString() ?? null,
        accepted_at: updated.acceptedAt?.toISOString() ?? null,
        joined_at: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/team/:memberId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/team/:memberId - Remove member
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { memberId } = await params;

    // Find the target member
    const targetMember = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, memberId),
    });

    if (!targetMember) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Member not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Cannot remove the owner
    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot remove the organization owner', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Members can remove themselves (leave org)
    const isSelf = targetMember.userId === session.user.id;

    if (!isSelf) {
      // Check org:members:remove permission
      const removeAccess = await checkPermission(session.user.id, targetMember.orgId, 'org:members:remove');
      if (!removeAccess) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions: org:members:remove required', request_id: crypto.randomUUID() } },
          { status: 403 }
        );
      }
    }

    // Delete the membership
    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, memberId));

    return NextResponse.json({
      success: true,
      data: { id: memberId, removed: true },
    });
  } catch (error) {
    console.error('DELETE /api/v1/team/:memberId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
