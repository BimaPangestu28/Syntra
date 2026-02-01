import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { costRecords, organizationMembers } from '@/lib/db/schema';
import { eq, and, inArray, sql, gte } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// GET /api/v1/costs/forecast - Get cost forecast
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

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: null });
    }

    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    // Get last 6 months of data for forecasting
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const historicalData = await db
      .select({
        month: sql<string>`TO_CHAR(${costRecords.periodStart}, 'YYYY-MM')`,
        total: sql<number>`SUM(${costRecords.amount})::int`,
      })
      .from(costRecords)
      .where(and(
        inArray(costRecords.orgId, targetOrgIds),
        gte(costRecords.periodStart, sixMonthsAgo)
      ))
      .groupBy(sql`TO_CHAR(${costRecords.periodStart}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${costRecords.periodStart}, 'YYYY-MM')`);

    // Get category breakdown for forecasting
    const categoryTrends = await db
      .select({
        category: costRecords.category,
        month: sql<string>`TO_CHAR(${costRecords.periodStart}, 'YYYY-MM')`,
        total: sql<number>`SUM(${costRecords.amount})::int`,
      })
      .from(costRecords)
      .where(and(
        inArray(costRecords.orgId, targetOrgIds),
        gte(costRecords.periodStart, sixMonthsAgo)
      ))
      .groupBy(costRecords.category, sql`TO_CHAR(${costRecords.periodStart}, 'YYYY-MM')`)
      .orderBy(costRecords.category, sql`TO_CHAR(${costRecords.periodStart}, 'YYYY-MM')`);

    // Simple linear forecast based on trend
    let forecast = null;
    if (historicalData.length >= 2) {
      const totals = historicalData.map(h => h.total);
      const avgGrowth = totals.slice(1).reduce((acc, val, i) => acc + (val - totals[i]), 0) / (totals.length - 1);
      const lastMonth = totals[totals.length - 1] || 0;

      // Calculate growth percentage
      const growthPercent = lastMonth > 0 ? ((avgGrowth / lastMonth) * 100) : 0;

      forecast = {
        next_month: {
          estimate_cents: Math.max(0, Math.round(lastMonth + avgGrowth)),
          estimate_formatted: `$${(Math.max(0, lastMonth + avgGrowth) / 100).toFixed(2)}`,
        },
        three_month: {
          estimate_cents: Math.max(0, Math.round(lastMonth + avgGrowth * 3)),
          estimate_formatted: `$${(Math.max(0, lastMonth + avgGrowth * 3) / 100).toFixed(2)}`,
        },
        six_month: {
          estimate_cents: Math.max(0, Math.round(lastMonth + avgGrowth * 6)),
          estimate_formatted: `$${(Math.max(0, lastMonth + avgGrowth * 6) / 100).toFixed(2)}`,
        },
        trend: avgGrowth > 0 ? 'increasing' : avgGrowth < 0 ? 'decreasing' : 'stable',
        growth_rate_percent: Math.round(growthPercent * 100) / 100,
        average_monthly_cents: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
        average_monthly_formatted: `$${((totals.reduce((a, b) => a + b, 0) / totals.length) / 100).toFixed(2)}`,
      };
    }

    // Process category trends for forecasting
    const categoryForecasts: Record<string, { trend: string; last_month: number; forecast: number }> = {};
    const categories = [...new Set(categoryTrends.map(c => c.category))];

    for (const category of categories) {
      const categoryData = categoryTrends
        .filter(c => c.category === category)
        .sort((a, b) => a.month.localeCompare(b.month));

      if (categoryData.length >= 2) {
        const totals = categoryData.map(c => c.total);
        const avgGrowth = totals.slice(1).reduce((acc, val, i) => acc + (val - totals[i]), 0) / (totals.length - 1);
        const lastMonth = totals[totals.length - 1] || 0;

        categoryForecasts[category] = {
          trend: avgGrowth > 0 ? 'increasing' : avgGrowth < 0 ? 'decreasing' : 'stable',
          last_month: lastMonth,
          forecast: Math.max(0, Math.round(lastMonth + avgGrowth)),
        };
      }
    }

    // Anomaly detection - flag months with unusual spending
    const anomalies: Array<{ month: string; amount: number; deviation: string }> = [];
    if (historicalData.length >= 3) {
      const totals = historicalData.map(h => h.total);
      const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
      const variance = totals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / totals.length;
      const stdDev = Math.sqrt(variance);

      historicalData.forEach((h, i) => {
        const deviation = (h.total - mean) / stdDev;
        if (Math.abs(deviation) > 1.5) {
          anomalies.push({
            month: h.month,
            amount: h.total,
            deviation: deviation > 0 ? 'high' : 'low',
          });
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        historical: historicalData.map(h => ({
          month: h.month,
          total_cents: h.total,
          total_formatted: `$${(h.total / 100).toFixed(2)}`,
        })),
        forecast,
        category_forecasts: Object.entries(categoryForecasts).map(([category, data]) => ({
          category,
          trend: data.trend,
          last_month_cents: data.last_month,
          last_month_formatted: `$${(data.last_month / 100).toFixed(2)}`,
          forecast_cents: data.forecast,
          forecast_formatted: `$${(data.forecast / 100).toFixed(2)}`,
        })),
        anomalies: anomalies.map(a => ({
          month: a.month,
          amount_cents: a.amount,
          amount_formatted: `$${(a.amount / 100).toFixed(2)}`,
          type: a.deviation === 'high' ? 'Unusually high spending' : 'Unusually low spending',
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/costs/forecast error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
