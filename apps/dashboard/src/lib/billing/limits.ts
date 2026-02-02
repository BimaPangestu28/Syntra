import { db } from '@/lib/db';
import { organizations, subscriptions, billingPlans, usageRecords } from '@/lib/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number | null;
}

const DEFAULT_FREE_LIMITS: Record<string, number> = {
  compute_minutes: 1000,
  build_minutes: 100,
  storage_gb: 5,
  bandwidth_gb: 10,
  deployments: 50,
  previews: 3,
  team_members: 3,
  servers: 1,
};

export async function checkLimit(
  orgId: string,
  limitType: string
): Promise<LimitCheckResult> {
  // Get org's subscription and plan
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org) {
    return { allowed: false, current: 0, limit: 0 };
  }

  // Find active subscription
  const sub = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.orgId, orgId),
      eq(subscriptions.status, 'active')
    ),
    with: { plan: true },
  });

  let limits: Record<string, number | undefined>;
  if (sub?.plan?.limits) {
    limits = sub.plan.limits;
  } else {
    limits = DEFAULT_FREE_LIMITS;
  }

  const limit = limits[limitType];

  // No limit set = unlimited
  if (limit === undefined || limit === null) {
    return { allowed: true, current: 0, limit: null };
  }

  // For team_members and servers, count directly
  if (limitType === 'team_members') {
    const { organizationMembers } = await import('@/lib/db/schema');
    const members = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizationMembers)
      .where(eq(organizationMembers.orgId, orgId));
    const current = Number(members[0]?.count) || 0;
    return { allowed: current < limit, current, limit };
  }

  if (limitType === 'servers') {
    const { servers } = await import('@/lib/db/schema');
    const serverCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(servers)
      .where(eq(servers.orgId, orgId));
    const current = Number(serverCount[0]?.count) || 0;
    return { allowed: current < limit, current, limit };
  }

  // For usage-based limits, aggregate from usageRecords
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const usage = await db
    .select({ total: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)` })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.orgId, orgId),
        eq(usageRecords.usageType, limitType as any),
        gte(usageRecords.periodStart, periodStart)
      )
    );

  const current = Number(usage[0]?.total) || 0;
  return { allowed: current < limit, current, limit };
}

/**
 * Get all limits and current usage for an org.
 */
export async function getAllLimits(orgId: string): Promise<Record<string, LimitCheckResult>> {
  const limitTypes = ['compute_minutes', 'build_minutes', 'storage_gb', 'bandwidth_gb', 'deployments', 'previews', 'team_members', 'servers'];
  const results: Record<string, LimitCheckResult> = {};

  await Promise.all(
    limitTypes.map(async (type) => {
      results[type] = await checkLimit(orgId, type);
    })
  );

  return results;
}
