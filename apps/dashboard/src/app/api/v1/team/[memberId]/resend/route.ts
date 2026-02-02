import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { organizationMembers, organizations, users, invitationTokens } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { sendInvitationEmail } from '@/lib/email';
import crypto from 'crypto';

// POST /api/v1/team/[memberId]/resend - Resend invitation email
export async function POST(
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

    const member = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, memberId),
      with: { user: true },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Member not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check if the member is still pending
    if (member.acceptedAt) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_ACCEPTED', message: 'Member has already accepted the invitation', request_id: crypto.randomUUID() } },
        { status: 409 }
      );
    }

    // Check org access (owner/admin)
    const callerMembership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, member.orgId)
      ),
    });

    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Only owners and admins can resend invitations', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Delete any existing token for this membership
    await db.delete(invitationTokens).where(eq(invitationTokens.membershipId, memberId));

    // Generate new token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(invitationTokens).values({
      token,
      membershipId: memberId,
      expiresAt,
    });

    // Get org info
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, member.orgId),
    });

    const inviterName = session.user.name || session.user.email || 'A team member';

    // Send email
    await sendInvitationEmail(
      member.user.email,
      inviterName,
      org?.name || 'your organization',
      token
    );

    return NextResponse.json({
      success: true,
      data: { resent: true },
    });
  } catch (error) {
    console.error('POST /api/v1/team/[memberId]/resend error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
