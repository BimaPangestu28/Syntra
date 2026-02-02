import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { usageRecords, organizationMembers } from '@/lib/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// GET /api/v1/billing/usage - Get aggregated usage for current period
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

    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, orgId)
      ),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Get current billing period (start of current month)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Aggregate usage by type
    const usage = await db
      .select({
        usageType: usageRecords.usageType,
        totalQuantity: sql<number>`sum(${usageRecords.quantity})`,
        totalCost: sql<number>`sum(${usageRecords.totalPrice})`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.orgId, orgId),
          gte(usageRecords.periodStart, periodStart)
        )
      )
      .groupBy(usageRecords.usageType);

    return NextResponse.json({
      success: true,
      data: {
        period_start: periodStart.toISOString(),
        period_end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString(),
        usage: usage.map((u) => ({
          type: u.usageType,
          quantity: Number(u.totalQuantity) || 0,
          cost: Number(u.totalCost) || 0,
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/billing/usage error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
