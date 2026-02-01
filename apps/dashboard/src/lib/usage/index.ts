import { db } from '@/lib/db';
import { usageRecords, subscriptions, billingPlans } from '@/lib/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export type UsageType =
  | 'compute_minutes'
  | 'build_minutes'
  | 'storage_gb'
  | 'bandwidth_gb'
  | 'deployments'
  | 'previews';

export interface UsageSummary {
  type: UsageType;
  quantity: number;
  limit: number | null; // null means unlimited
  used_percentage: number;
}

export interface PeriodUsage {
  period_start: Date;
  period_end: Date;
  usage: UsageSummary[];
  total_cost: number; // In cents
}

/**
 * Record usage for an organization
 */
export async function recordUsage(params: {
  orgId: string;
  usageType: UsageType;
  quantity: number;
  serviceId?: string;
  serverId?: string;
  deploymentId?: string;
  periodStart?: Date;
  periodEnd?: Date;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const now = new Date();
  const periodStart = params.periodStart || now;
  const periodEnd = params.periodEnd || now;

  const [record] = await db
    .insert(usageRecords)
    .values({
      orgId: params.orgId,
      serviceId: params.serviceId,
      serverId: params.serverId,
      deploymentId: params.deploymentId,
      usageType: params.usageType,
      quantity: params.quantity,
      periodStart,
      periodEnd,
      metadata: params.metadata,
    })
    .returning();

  return record.id;
}

/**
 * Record compute time for a service
 */
export async function recordComputeTime(params: {
  orgId: string;
  serviceId: string;
  serverId: string;
  minutes: number;
  startTime: Date;
  endTime: Date;
}): Promise<void> {
  await recordUsage({
    orgId: params.orgId,
    serviceId: params.serviceId,
    serverId: params.serverId,
    usageType: 'compute_minutes',
    quantity: params.minutes,
    periodStart: params.startTime,
    periodEnd: params.endTime,
    metadata: {
      type: 'compute',
    },
  });
}

/**
 * Record build time for a deployment
 */
export async function recordBuildTime(params: {
  orgId: string;
  serviceId: string;
  deploymentId: string;
  minutes: number;
  startTime: Date;
  endTime: Date;
}): Promise<void> {
  await recordUsage({
    orgId: params.orgId,
    serviceId: params.serviceId,
    deploymentId: params.deploymentId,
    usageType: 'build_minutes',
    quantity: params.minutes,
    periodStart: params.startTime,
    periodEnd: params.endTime,
    metadata: {
      type: 'build',
    },
  });
}

/**
 * Record a deployment
 */
export async function recordDeployment(params: {
  orgId: string;
  serviceId: string;
  deploymentId: string;
}): Promise<void> {
  const now = new Date();
  await recordUsage({
    orgId: params.orgId,
    serviceId: params.serviceId,
    deploymentId: params.deploymentId,
    usageType: 'deployments',
    quantity: 1,
    periodStart: now,
    periodEnd: now,
    metadata: {
      type: 'deployment',
    },
  });
}

/**
 * Get usage summary for an organization's current billing period
 */
export async function getUsageSummary(orgId: string): Promise<PeriodUsage> {
  // Get current subscription and plan
  const subscription = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.orgId, orgId),
      eq(subscriptions.status, 'active')
    ),
    with: {
      plan: true,
    },
  });

  // Determine billing period
  let periodStart: Date;
  let periodEnd: Date;

  if (subscription?.currentPeriodStart && subscription?.currentPeriodEnd) {
    periodStart = subscription.currentPeriodStart;
    periodEnd = subscription.currentPeriodEnd;
  } else {
    // Default to current month
    const now = new Date();
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  // Get usage totals by type
  const usageTotals = await db
    .select({
      usageType: usageRecords.usageType,
      total: sql<number>`sum(${usageRecords.quantity})::int`,
    })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.orgId, orgId),
      gte(usageRecords.periodStart, periodStart),
      lte(usageRecords.periodEnd, periodEnd)
    ))
    .groupBy(usageRecords.usageType);

  // Get limits from plan
  const limits = (subscription?.plan?.limits as Record<string, number | undefined>) || {};

  // Build usage summary
  const usageTypes: UsageType[] = [
    'compute_minutes',
    'build_minutes',
    'storage_gb',
    'bandwidth_gb',
    'deployments',
    'previews',
  ];

  const usage: UsageSummary[] = usageTypes.map(type => {
    const usageRecord = usageTotals.find(u => u.usageType === type);
    const quantity = usageRecord?.total || 0;
    const limit = limits[type] ?? null;
    const used_percentage = limit && limit > 0 ? (quantity / limit) * 100 : 0;

    return {
      type,
      quantity,
      limit: limit === -1 ? null : limit, // -1 means unlimited
      used_percentage: Math.min(used_percentage, 100),
    };
  });

  return {
    period_start: periodStart,
    period_end: periodEnd,
    usage,
    total_cost: 0, // Would be calculated based on pricing
  };
}

/**
 * Get usage history for an organization
 */
export async function getUsageHistory(
  orgId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{
  date: string;
  compute_minutes: number;
  build_minutes: number;
  deployments: number;
}>> {
  const results = await db
    .select({
      date: sql<string>`date_trunc('day', ${usageRecords.periodStart})::date`,
      usageType: usageRecords.usageType,
      total: sql<number>`sum(${usageRecords.quantity})::int`,
    })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.orgId, orgId),
      gte(usageRecords.periodStart, startDate),
      lte(usageRecords.periodEnd, endDate)
    ))
    .groupBy(sql`date_trunc('day', ${usageRecords.periodStart})::date`, usageRecords.usageType)
    .orderBy(sql`date_trunc('day', ${usageRecords.periodStart})::date`);

  // Group by date
  const byDate = new Map<string, {
    compute_minutes: number;
    build_minutes: number;
    deployments: number;
  }>();

  for (const row of results) {
    const dateStr = row.date;
    if (!byDate.has(dateStr)) {
      byDate.set(dateStr, {
        compute_minutes: 0,
        build_minutes: 0,
        deployments: 0,
      });
    }

    const entry = byDate.get(dateStr)!;
    switch (row.usageType) {
      case 'compute_minutes':
        entry.compute_minutes = row.total;
        break;
      case 'build_minutes':
        entry.build_minutes = row.total;
        break;
      case 'deployments':
        entry.deployments = row.total;
        break;
    }
  }

  return Array.from(byDate.entries()).map(([date, usage]) => ({
    date,
    ...usage,
  }));
}

/**
 * Check if organization has exceeded usage limits
 */
export async function checkUsageLimits(orgId: string): Promise<{
  exceeded: boolean;
  limits_exceeded: UsageType[];
}> {
  const summary = await getUsageSummary(orgId);

  const limitsExceeded: UsageType[] = [];

  for (const item of summary.usage) {
    if (item.limit !== null && item.quantity >= item.limit) {
      limitsExceeded.push(item.type);
    }
  }

  return {
    exceeded: limitsExceeded.length > 0,
    limits_exceeded: limitsExceeded,
  };
}
