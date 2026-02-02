import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, organizations, organizationMembers, invitationTokens } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { checkPermission } from '@/lib/auth/require-permission';
import { z } from 'zod';
import { sendInvitationEmail } from '@/lib/email';

// Request schemas
const inviteMemberSchema = z.object({
  org_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'developer', 'viewer']),
});

// Helper to get user's first organization
async function getUserFirstOrg(userId: string) {
  const membership = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
    with: {
      organization: true,
    },
  });

  return membership?.organization ?? null;
}

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

// GET /api/v1/team - List organization members
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
    let orgId = searchParams.get('org_id');

    // Default to user's first org if not specified
    let org;
    if (!orgId) {
      const defaultOrg = await getUserFirstOrg(session.user.id);
      if (!defaultOrg) {
        return NextResponse.json({
          success: true,
          data: { org: null, members: [] },
        });
      }
      orgId = defaultOrg.id;
      org = defaultOrg;
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Fetch org info if not already loaded
    if (!org) {
      org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      });
    }

    // Fetch members with user info
    const members = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.orgId, orgId),
      with: {
        user: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        current_user_id: session.user.id,
        org: org ? {
          id: org.id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
        } : null,
        members: members.map((m) => ({
          id: m.id,
          user: {
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            image: m.user.image,
          },
          role: m.role,
          invited_at: m.invitedAt?.toISOString() ?? null,
          accepted_at: m.acceptedAt?.toISOString() ?? null,
          created_at: m.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/team error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/team - Invite a member
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
    const parsed = inviteMemberSchema.safeParse(body);

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

    const { org_id, email, role } = parsed.data;

    // Check org:members:invite permission
    const access = await checkPermission(session.user.id, org_id, 'org:members:invite');
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions: org:members:invite required', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check if user already exists in the org (by email)
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      // Check if already a member
      const existingMember = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.orgId, org_id),
          eq(organizationMembers.userId, existingUser.id)
        ),
      });

      if (existingMember) {
        return NextResponse.json(
          { success: false, error: { code: 'ALREADY_MEMBER', message: 'User is already a member of this organization', request_id: crypto.randomUUID() } },
          { status: 409 }
        );
      }

      // User exists, add directly with acceptedAt set
      const [member] = await db
        .insert(organizationMembers)
        .values({
          orgId: org_id,
          userId: existingUser.id,
          role,
          invitedBy: session.user.id,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        })
        .returning();

      return NextResponse.json(
        {
          success: true,
          data: {
            id: member.id,
            user: {
              id: existingUser.id,
              name: existingUser.name,
              email: existingUser.email,
              image: existingUser.image,
            },
            role: member.role,
            invited_at: member.invitedAt?.toISOString() ?? null,
            accepted_at: member.acceptedAt?.toISOString() ?? null,
            joined_at: member.createdAt.toISOString(),
          },
        },
        { status: 201 }
      );
    }

    // User doesn't exist - create a pending invite
    // First create a placeholder user record with just the email
    const [newUser] = await db
      .insert(users)
      .values({
        email,
      })
      .returning();

    const [member] = await db
      .insert(organizationMembers)
      .values({
        orgId: org_id,
        userId: newUser.id,
        role,
        invitedBy: session.user.id,
        invitedAt: new Date(),
        // acceptedAt is null - pending invite
      })
      .returning();

    // Generate invitation token and send email
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(invitationTokens).values({
      token,
      membershipId: member.id,
      expiresAt,
    });

    // Get org name for email
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, org_id),
    });

    const inviterName = session.user.name || session.user.email || 'A team member';

    // Send invitation email (fire-and-forget, don't fail the request)
    sendInvitationEmail(email, inviterName, org?.name || 'your organization', token).catch((err) => {
      console.error('Failed to send invitation email:', err);
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: member.id,
          user: {
            id: newUser.id,
            name: null,
            email: newUser.email,
            image: null,
          },
          role: member.role,
          status: 'pending',
          invited_at: member.invitedAt?.toISOString() ?? null,
          accepted_at: null,
          joined_at: member.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/team error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
