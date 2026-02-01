import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subscriptions, organizationMembers, billingPlans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// Helper to check org access (owner/admin only for billing)
async function checkBillingAccess(
  userId: string,
  orgId: string
): Promise<boolean> {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });
  return membership?.role === 'owner' || membership?.role === 'admin';
}

// GET /api/v1/billing/subscription - Get organization's subscription
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

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'org_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check access
    const hasAccess = await checkBillingAccess(session.user.id, orgId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied. Only owners and admins can view billing.', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.orgId, orgId),
      with: {
        plan: true,
      },
    });

    if (!subscription) {
      // Return free plan info
      const freePlan = await db.query.billingPlans.findFirst({
        where: eq(billingPlans.plan, 'free'),
      });

      return NextResponse.json({
        success: true,
        data: {
          status: 'free',
          plan: freePlan ? {
            id: freePlan.id,
            name: freePlan.name,
            display_name: freePlan.displayName,
            plan: freePlan.plan,
            limits: freePlan.limits,
            features: freePlan.features,
          } : null,
          current_period_start: null,
          current_period_end: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: subscription.id,
        status: subscription.status,
        plan: subscription.plan ? {
          id: subscription.plan.id,
          name: subscription.plan.name,
          display_name: subscription.plan.displayName,
          plan: subscription.plan.plan,
          price_monthly_cents: subscription.plan.priceMonthly,
          limits: subscription.plan.limits,
          features: subscription.plan.features,
        } : null,
        stripe_subscription_id: subscription.stripeSubscriptionId,
        current_period_start: subscription.currentPeriodStart?.toISOString(),
        current_period_end: subscription.currentPeriodEnd?.toISOString(),
        trial_ends_at: subscription.trialEndsAt?.toISOString(),
        cancelled_at: subscription.cancelledAt?.toISOString(),
        created_at: subscription.createdAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/billing/subscription error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/billing/subscription - Create or update subscription
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
    const { org_id, plan_id, stripe_subscription_id, stripe_customer_id } = body;

    if (!org_id || !plan_id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'org_id and plan_id are required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check access
    const hasAccess = await checkBillingAccess(session.user.id, org_id);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check if plan exists
    const plan = await db.query.billingPlans.findFirst({
      where: eq(billingPlans.id, plan_id),
    });

    if (!plan) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Plan not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check for existing subscription
    const existing = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.orgId, org_id),
    });

    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (existing) {
      // Update existing subscription
      const [updated] = await db
        .update(subscriptions)
        .set({
          planId: plan_id,
          status: 'active',
          stripeSubscriptionId: stripe_subscription_id,
          stripeCustomerId: stripe_customer_id,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existing.id))
        .returning();

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          plan_id: updated.planId,
        },
      });
    } else {
      // Create new subscription
      const [created] = await db
        .insert(subscriptions)
        .values({
          orgId: org_id,
          planId: plan_id,
          status: 'active',
          stripeSubscriptionId: stripe_subscription_id,
          stripeCustomerId: stripe_customer_id,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        })
        .returning();

      return NextResponse.json({
        success: true,
        data: {
          id: created.id,
          status: created.status,
          plan_id: created.planId,
        },
      }, { status: 201 });
    }
  } catch (error) {
    console.error('POST /api/v1/billing/subscription error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
