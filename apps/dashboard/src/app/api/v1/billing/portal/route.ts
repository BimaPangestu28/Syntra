import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { organizations, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { createCustomerPortalSession } from '@/lib/stripe';
import { z } from 'zod';
import crypto from 'crypto';

const portalSchema = z.object({
  org_id: z.string().uuid(),
});

// POST /api/v1/billing/portal - Create a Stripe Customer Portal session
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
    const parsed = portalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, parsed.data.org_id)
      ),
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Only owners and admins can manage billing', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, parsed.data.org_id),
    });

    if (!org?.stripeCustomerId) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_BILLING', message: 'No billing account found. Please set up a subscription first.', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL || req.headers.get('origin') || '';
    const portalUrl = await createCustomerPortalSession(
      org.stripeCustomerId,
      `${baseUrl}/settings/billing`
    );

    return NextResponse.json({
      success: true,
      data: { portal_url: portalUrl },
    });
  } catch (error) {
    console.error('POST /api/v1/billing/portal error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
