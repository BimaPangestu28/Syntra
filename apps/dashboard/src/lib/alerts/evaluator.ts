import { db } from '@/lib/db';
import { alertRules, errorGroups, services } from '@/lib/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { createAlert } from '@/lib/alerts';

type Operator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

function compareThreshold(value: number, operator: Operator, threshold: number): boolean {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
    default: return false;
  }
}

function operatorLabel(op: Operator): string {
  switch (op) {
    case 'gt': return '>';
    case 'gte': return '>=';
    case 'lt': return '<';
    case 'lte': return '<=';
    case 'eq': return '=';
  }
}

interface EvaluationResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  currentValue: number;
  threshold: number;
  alertId?: string;
}

// Evaluate a single alert rule against current data
async function evaluateRule(rule: typeof alertRules.$inferSelect): Promise<EvaluationResult> {
  const windowStart = new Date(Date.now() - rule.windowMinutes * 60 * 1000);

  let currentValue = 0;

  switch (rule.metric) {
    case 'error_count': {
      // Count total error events in the time window
      const conditions = [gte(errorGroups.lastSeenAt, windowStart)];
      if (rule.serviceId) {
        conditions.push(eq(errorGroups.serviceId, rule.serviceId));
      }

      const result = await db
        .select({ total: sql<number>`COALESCE(SUM(${errorGroups.eventCount}), 0)` })
        .from(errorGroups)
        .where(and(...conditions));

      currentValue = Number(result[0]?.total ?? 0);
      break;
    }

    case 'error_rate': {
      // Errors per minute in the window
      const conditions = [gte(errorGroups.lastSeenAt, windowStart)];
      if (rule.serviceId) {
        conditions.push(eq(errorGroups.serviceId, rule.serviceId));
      }

      const result = await db
        .select({ total: sql<number>`COALESCE(SUM(${errorGroups.eventCount}), 0)` })
        .from(errorGroups)
        .where(and(...conditions));

      const totalErrors = Number(result[0]?.total ?? 0);
      currentValue = rule.windowMinutes > 0 ? Math.round(totalErrors / rule.windowMinutes) : totalErrors;
      break;
    }

    case 'new_error': {
      // Count of new error groups (first seen in the window)
      const conditions = [gte(errorGroups.firstSeenAt, windowStart)];
      if (rule.serviceId) {
        conditions.push(eq(errorGroups.serviceId, rule.serviceId));
      }

      const result = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(errorGroups)
        .where(and(...conditions));

      currentValue = Number(result[0]?.count ?? 0);
      break;
    }

    default:
      return { ruleId: rule.id, ruleName: rule.name, triggered: false, currentValue: 0, threshold: rule.threshold };
  }

  const triggered = compareThreshold(currentValue, rule.operator as Operator, rule.threshold);

  if (!triggered) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, currentValue, threshold: rule.threshold };
  }

  // Check cooldown
  if (rule.lastTriggeredAt) {
    const cooldownEnd = new Date(rule.lastTriggeredAt.getTime() + rule.cooldownMinutes * 60 * 1000);
    if (new Date() < cooldownEnd) {
      return { ruleId: rule.id, ruleName: rule.name, triggered: false, currentValue, threshold: rule.threshold };
    }
  }

  // Resolve service name for alert message
  let serviceName = 'all services';
  if (rule.serviceId) {
    const svc = await db.query.services.findFirst({
      where: eq(services.id, rule.serviceId),
      columns: { name: true },
    });
    if (svc) serviceName = svc.name;
  }

  const metricLabels: Record<string, string> = {
    error_count: 'Error count',
    error_rate: 'Error rate (per minute)',
    new_error: 'New error types',
  };

  const metricLabel = metricLabels[rule.metric] ?? rule.metric;

  // Create the alert
  const alertId = await createAlert({
    orgId: rule.orgId,
    type: `alert_rule_${rule.metric}`,
    severity: rule.severity as 'info' | 'warning' | 'error' | 'critical',
    title: `${rule.name}: ${metricLabel} threshold exceeded`,
    message: `${metricLabel} is ${currentValue} (${operatorLabel(rule.operator as Operator)} ${rule.threshold}) for ${serviceName} in the last ${rule.windowMinutes} minute(s).`,
    serviceId: rule.serviceId ?? undefined,
    metadata: {
      ruleId: rule.id,
      metric: rule.metric,
      currentValue,
      threshold: rule.threshold,
      operator: rule.operator,
      windowMinutes: rule.windowMinutes,
    },
    dedupeKey: `alert_rule_${rule.id}`,
  });

  // Update lastTriggeredAt
  await db
    .update(alertRules)
    .set({ lastTriggeredAt: new Date(), updatedAt: new Date() })
    .where(eq(alertRules.id, rule.id));

  return { ruleId: rule.id, ruleName: rule.name, triggered: true, currentValue, threshold: rule.threshold, alertId };
}

// Evaluate all enabled alert rules
export async function evaluateAllRules(): Promise<EvaluationResult[]> {
  const rules = await db.query.alertRules.findMany({
    where: eq(alertRules.isEnabled, true),
  });

  if (rules.length === 0) return [];

  const results: EvaluationResult[] = [];

  for (const rule of rules) {
    try {
      const result = await evaluateRule(rule);
      results.push(result);

      if (result.triggered) {
        console.log(
          `[AlertEvaluator] Rule "${rule.name}" triggered: ${result.currentValue} ${operatorLabel(rule.operator as Operator)} ${rule.threshold}`
        );
      }
    } catch (error) {
      console.error(`[AlertEvaluator] Error evaluating rule ${rule.id} ("${rule.name}"):`, error);
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggered: false,
        currentValue: -1,
        threshold: rule.threshold,
      });
    }
  }

  const triggeredCount = results.filter((r) => r.triggered).length;
  if (triggeredCount > 0) {
    console.log(`[AlertEvaluator] ${triggeredCount}/${results.length} rules triggered`);
  }

  return results;
}

// Periodic evaluation loop
let evaluationInterval: ReturnType<typeof setInterval> | null = null;

export function startAlertEvaluator(intervalMs: number = 60_000): void {
  if (evaluationInterval) {
    console.log('[AlertEvaluator] Already running');
    return;
  }

  console.log(`[AlertEvaluator] Starting (interval: ${intervalMs}ms)`);

  // Run immediately on start
  evaluateAllRules().catch((err) =>
    console.error('[AlertEvaluator] Initial evaluation error:', err)
  );

  evaluationInterval = setInterval(() => {
    evaluateAllRules().catch((err) =>
      console.error('[AlertEvaluator] Evaluation error:', err)
    );
  }, intervalMs);
}

export function stopAlertEvaluator(): void {
  if (evaluationInterval) {
    clearInterval(evaluationInterval);
    evaluationInterval = null;
    console.log('[AlertEvaluator] Stopped');
  }
}
