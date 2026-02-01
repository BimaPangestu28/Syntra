import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { getUsageSummary, getUsageHistory } from '@/lib/usage';

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string
): Promise<boolean> {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });
  return !!membership;
}

// GET /api/v1/usage - Get usage summary
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
    const view = searchParams.get('view') || 'summary'; // summary, history
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'org_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check access
    const hasAccess = await checkOrgAccess(session.user.id, orgId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    if (view === 'history') {
      // Get usage history
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const history = await getUsageHistory(orgId, start, end);

      return NextResponse.json({
        success: true,
        data: {
          view: 'history',
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          history,
        },
      });
    }

    // Get usage summary
    const summary = await getUsageSummary(orgId);

    return NextResponse.json({
      success: true,
      data: {
        view: 'summary',
        period_start: summary.period_start.toISOString(),
        period_end: summary.period_end.toISOString(),
        usage: summary.usage.map(u => ({
          type: u.type,
          quantity: u.quantity,
          limit: u.limit,
          used_percentage: Math.round(u.used_percentage * 100) / 100,
        })),
        total_cost_cents: summary.total_cost,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/usage error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
