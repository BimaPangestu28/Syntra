import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { organizations, organizationMembers, billingPlans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { createCheckoutSession, createCustomer } from '@/lib/stripe';
import { z } from 'zod';
import crypto from 'crypto';

const checkoutSchema = z.object({
  org_id: z.string().uuid(),
  plan_id: z.string().uuid(),
});

// POST /api/v1/billing/checkout - Create a Stripe checkout session
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
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check org access (owner/admin only for billing)
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

    if (!org) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const plan = await db.query.billingPlans.findFirst({
      where: eq(billingPlans.id, parsed.data.plan_id),
    });

    if (!plan) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Plan not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Ensure org has a Stripe customer
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      customerId = await createCustomer(
        org.name,
        session.user.email || '',
        org.id
      );
      await db
        .update(organizations)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
    }

    // Create checkout session
    // Use plan name as Stripe price ID placeholder (in production, store price IDs in billingPlans)
    const priceId = (plan.limits as any)?.stripe_price_id || `price_${plan.name}`;

    const baseUrl = process.env.NEXTAUTH_URL || req.headers.get('origin') || '';
    const checkoutUrl = await createCheckoutSession({
      customerId,
      priceId,
      orgId: org.id,
      successUrl: `${baseUrl}/settings/billing?checkout=success`,
      cancelUrl: `${baseUrl}/settings/billing?checkout=cancelled`,
    });

    return NextResponse.json({
      success: true,
      data: { checkout_url: checkoutUrl },
    });
  } catch (error) {
    console.error('POST /api/v1/billing/checkout error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
