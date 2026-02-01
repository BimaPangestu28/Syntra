import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { costRecords, organizationMembers, services } from '@/lib/db/schema';
import { eq, and, desc, inArray, sql, gte, lte, between } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// GET /api/v1/costs - Get cost records and analytics
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
    const serviceId = searchParams.get('service_id');
    const category = searchParams.get('category');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const groupBy = searchParams.get('group_by'); // day, week, month, category, service
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: { records: [], summary: null } });
    }

    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    // Build conditions
    const conditions = [inArray(costRecords.orgId, targetOrgIds)];
    if (serviceId) conditions.push(eq(costRecords.serviceId, serviceId));
    if (category) conditions.push(eq(costRecords.category, category));
    if (startDate) conditions.push(gte(costRecords.periodStart, new Date(startDate)));
    if (endDate) conditions.push(lte(costRecords.periodEnd, new Date(endDate)));

    const whereClause = and(...conditions);

    // Get cost records
    const records = await db.query.costRecords.findMany({
      where: whereClause,
      with: {
        service: { columns: { id: true, name: true } },
        server: { columns: { id: true, name: true } },
      },
      orderBy: [desc(costRecords.periodEnd)],
      limit: Math.min(limit, 500),
      offset,
    });

    // Calculate summary
    const summaryResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${costRecords.amount}), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(costRecords)
      .where(whereClause);

    // Get breakdown by category
    const categoryBreakdown = await db
      .select({
        category: costRecords.category,
        total: sql<number>`SUM(${costRecords.amount})::int`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(costRecords)
      .where(whereClause)
      .groupBy(costRecords.category);

    // Get breakdown by service (top 10)
    const serviceBreakdown = await db
      .select({
        serviceId: costRecords.serviceId,
        serviceName: services.name,
        total: sql<number>`SUM(${costRecords.amount})::int`,
      })
      .from(costRecords)
      .leftJoin(services, eq(costRecords.serviceId, services.id))
      .where(whereClause)
      .groupBy(costRecords.serviceId, services.name)
      .orderBy(sql`SUM(${costRecords.amount}) DESC`)
      .limit(10);

    // Get daily trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyTrend = await db
      .select({
        date: sql<string>`DATE(${costRecords.periodStart})`,
        total: sql<number>`SUM(${costRecords.amount})::int`,
      })
      .from(costRecords)
      .where(and(
        ...conditions,
        gte(costRecords.periodStart, thirtyDaysAgo)
      ))
      .groupBy(sql`DATE(${costRecords.periodStart})`)
      .orderBy(sql`DATE(${costRecords.periodStart})`);

    // Calculate estimated monthly cost
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const currentMonthCosts = await db
      .select({
        total: sql<number>`COALESCE(SUM(${costRecords.amount}), 0)::int`,
      })
      .from(costRecords)
      .where(and(
        inArray(costRecords.orgId, targetOrgIds),
        gte(costRecords.periodStart, currentMonth)
      ));

    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const monthlyEstimate = Math.round((currentMonthCosts[0]?.total || 0) / dayOfMonth * daysInMonth);

    return NextResponse.json({
      success: true,
      data: {
        records: records.map(r => ({
          id: r.id,
          category: r.category,
          description: r.description,
          amount: r.amount,
          currency: r.currency,
          period_start: r.periodStart.toISOString(),
          period_end: r.periodEnd.toISOString(),
          service: r.service ? { id: r.service.id, name: r.service.name } : null,
          server: r.server ? { id: r.server.id, name: r.server.name } : null,
          metadata: r.metadata,
          created_at: r.createdAt.toISOString(),
        })),
        summary: {
          total_cents: summaryResult[0]?.total || 0,
          total_formatted: `$${((summaryResult[0]?.total || 0) / 100).toFixed(2)}`,
          record_count: summaryResult[0]?.count || 0,
          currency: 'usd',
          monthly_estimate_cents: monthlyEstimate,
          monthly_estimate_formatted: `$${(monthlyEstimate / 100).toFixed(2)}`,
        },
        breakdown: {
          by_category: categoryBreakdown.map(c => ({
            category: c.category,
            total_cents: c.total,
            total_formatted: `$${(c.total / 100).toFixed(2)}`,
            count: c.count,
          })),
          by_service: serviceBreakdown.map(s => ({
            service_id: s.serviceId,
            service_name: s.serviceName,
            total_cents: s.total,
            total_formatted: `$${(s.total / 100).toFixed(2)}`,
          })),
          daily_trend: dailyTrend.map(d => ({
            date: d.date,
            total_cents: d.total,
            total_formatted: `$${(d.total / 100).toFixed(2)}`,
          })),
        },
      },
    });
  } catch (error) {
    console.error('GET /api/v1/costs error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/costs - Record a cost (internal/agent use)
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
    const {
      org_id,
      service_id,
      server_id,
      database_id,
      category,
      description,
      amount,
      currency = 'usd',
      period_start,
      period_end,
      metadata,
    } = body;

    // Validate required fields
    if (!org_id || !category || typeof amount !== 'number' || !period_start || !period_end) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check org access
    const orgIds = await getUserOrgIds(session.user.id);
    if (!orgIds.includes(org_id)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const [record] = await db
      .insert(costRecords)
      .values({
        orgId: org_id,
        serviceId: service_id,
        serverId: server_id,
        databaseId: database_id,
        category,
        description,
        amount,
        currency,
        periodStart: new Date(period_start),
        periodEnd: new Date(period_end),
        metadata,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: record.id,
          category: record.category,
          amount: record.amount,
          currency: record.currency,
          period_start: record.periodStart.toISOString(),
          period_end: record.periodEnd.toISOString(),
          created_at: record.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/costs error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
