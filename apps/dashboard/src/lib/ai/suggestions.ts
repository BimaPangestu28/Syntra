import { getAnthropicClient, MODEL } from './client';
import { db } from '@/lib/db';
import { errorGroups, deployments, alerts, aiSuggestions } from '@/lib/db/schema';
import { eq, desc, gte, and } from 'drizzle-orm';

interface Suggestion {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Analyze recent errors for a service and generate suggestions.
 */
export async function analyzeRecentErrors(
  serviceId: string,
  orgId: string
): Promise<Suggestion[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h

  const errors = await db.query.errorGroups.findMany({
    where: and(
      eq(errorGroups.serviceId, serviceId),
      gte(errorGroups.lastSeenAt, since)
    ),
    orderBy: [desc(errorGroups.eventCount)],
    limit: 10,
  });

  if (errors.length === 0) return [];

  const errorSummary = errors
    .map((e) => `- ${e.type}: "${e.message}" (count: ${e.eventCount}, status: ${e.status})`)
    .join('\n');

  const prompt = `Analyze these errors from a service and provide actionable suggestions. Return JSON array of suggestions.

Errors:
${errorSummary}

Return a JSON array where each element has:
- type: "error_pattern"
- severity: "info" | "warning" | "critical"
- title: short title (max 100 chars)
- description: actionable description (max 500 chars)

Only return the JSON array, no other text.`;

  try {
    const response = await getAnthropicClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const suggestions: Suggestion[] = JSON.parse(text);
    return suggestions.slice(0, 5);
  } catch (error) {
    console.error('[AI Suggestions] Error analyzing errors:', error);
    return [];
  }
}

/**
 * Analyze metrics and deployment patterns to detect anomalies.
 */
export async function analyzeMetrics(
  serviceId: string,
  orgId: string
): Promise<Suggestion[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
  const suggestions: Suggestion[] = [];

  // Check for frequent failed deployments
  const recentDeploys = await db.query.deployments.findMany({
    where: and(
      eq(deployments.serviceId, serviceId),
      gte(deployments.createdAt, since)
    ),
    orderBy: [desc(deployments.createdAt)],
    limit: 20,
  });

  const failedDeploys = recentDeploys.filter((d) => d.status === 'failed');
  if (failedDeploys.length > 3) {
    suggestions.push({
      type: 'performance',
      severity: 'warning',
      title: `${failedDeploys.length} failed deployments in the last 7 days`,
      description: `Your service has experienced ${failedDeploys.length} failed deployments recently. Check build logs for common error patterns. Consider adding build validation or staging environment tests before deploying to production.`,
    });
  }

  // Check for recent critical alerts
  const recentAlerts = await db.query.alerts.findMany({
    where: and(
      eq(alerts.orgId, orgId),
      gte(alerts.createdAt, since)
    ),
    orderBy: [desc(alerts.createdAt)],
    limit: 10,
  });

  const criticalAlerts = recentAlerts.filter((a) => a.severity === 'critical');
  if (criticalAlerts.length > 0) {
    suggestions.push({
      type: 'performance',
      severity: 'critical',
      title: `${criticalAlerts.length} critical alerts in the last 7 days`,
      description: `Review and resolve critical alerts. Unresolved critical alerts may indicate infrastructure issues that could lead to downtime.`,
    });
  }

  // Check if the last N deployments were all rollbacks
  const rollbackDeploys = recentDeploys.filter((d) => d.triggerType === 'rollback');
  if (rollbackDeploys.length >= 3) {
    suggestions.push({
      type: 'performance',
      severity: 'warning',
      title: 'Frequent rollbacks detected',
      description: `${rollbackDeploys.length} rollbacks in the last 7 days suggest deployment instability. Consider adding automated tests, canary deployments, or better pre-deploy validation.`,
    });
  }

  return suggestions;
}

/**
 * Generate and store suggestions for a service.
 */
export async function generateSuggestions(serviceId: string, orgId: string) {
  const [errorSuggestions, metricSuggestions] = await Promise.all([
    analyzeRecentErrors(serviceId, orgId),
    analyzeMetrics(serviceId, orgId),
  ]);

  const allSuggestions = [...errorSuggestions, ...metricSuggestions];

  for (const suggestion of allSuggestions) {
    await db.insert(aiSuggestions).values({
      orgId,
      serviceId,
      type: suggestion.type,
      severity: suggestion.severity,
      title: suggestion.title,
      description: suggestion.description,
      metadata: suggestion.metadata,
    });
  }

  return allSuggestions.length;
}
