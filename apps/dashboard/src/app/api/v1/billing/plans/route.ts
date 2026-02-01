import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { billingPlans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// GET /api/v1/billing/plans - Get available billing plans
export async function GET(req: NextRequest) {
  try {
    const plans = await db.query.billingPlans.findMany({
      where: eq(billingPlans.isActive, true),
    });

    return NextResponse.json({
      success: true,
      data: plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        display_name: plan.displayName,
        description: plan.description,
        plan: plan.plan,
        price_monthly_cents: plan.priceMonthly,
        price_yearly_cents: plan.priceYearly,
        limits: plan.limits,
        features: plan.features,
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/billing/plans error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
