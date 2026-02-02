import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invitationTokens, organizationMembers, organizations, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// GET /api/v1/invitations/[token] - Verify invitation token
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invitation = await db.query.invitationTokens.findFirst({
      where: eq(invitationTokens.token, token),
      with: {
        membership: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Invalid or expired invitation', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: { code: 'EXPIRED', message: 'This invitation has expired', request_id: crypto.randomUUID() } },
        { status: 410 }
      );
    }

    // Check if already accepted
    if (invitation.membership.acceptedAt) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_ACCEPTED', message: 'This invitation has already been accepted', request_id: crypto.randomUUID() } },
        { status: 409 }
      );
    }

    // Get org info
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, invitation.membership.orgId),
    });

    return NextResponse.json({
      success: true,
      data: {
        org_name: org?.name || 'Unknown',
        org_slug: org?.slug,
        role: invitation.membership.role,
        expires_at: invitation.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/invitations/[token] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/invitations/[token] - Accept invitation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated. Please sign in first.', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { token } = await params;

    const invitation = await db.query.invitationTokens.findFirst({
      where: eq(invitationTokens.token, token),
      with: {
        membership: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Invalid or expired invitation', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: { code: 'EXPIRED', message: 'This invitation has expired', request_id: crypto.randomUUID() } },
        { status: 410 }
      );
    }

    if (invitation.membership.acceptedAt) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_ACCEPTED', message: 'This invitation has already been accepted', request_id: crypto.randomUUID() } },
        { status: 409 }
      );
    }

    // Update the membership: set userId to current user and mark as accepted
    await db
      .update(organizationMembers)
      .set({
        userId: session.user.id,
        acceptedAt: new Date(),
      })
      .where(eq(organizationMembers.id, invitation.membership.id));

    // Delete the token
    await db.delete(invitationTokens).where(eq(invitationTokens.id, invitation.id));

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, invitation.membership.orgId),
    });

    return NextResponse.json({
      success: true,
      data: {
        org_id: invitation.membership.orgId,
        org_name: org?.name,
        role: invitation.membership.role,
      },
    });
  } catch (error) {
    console.error('POST /api/v1/invitations/[token] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
