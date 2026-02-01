import { db } from '@/lib/db';
import { autoScalingRules, scalingEvents, services, servers } from '@/lib/db/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { agentHub } from '@/lib/agent/hub';
import crypto from 'crypto';

export type ScalingMetric =
  | 'cpu_percent'
  | 'memory_percent'
  | 'request_count'
  | 'response_time_ms'
  | 'custom';

export interface ScalingDecision {
  shouldScale: boolean;
  direction: 'up' | 'down' | null;
  newReplicas: number;
  currentReplicas: number;
  reason: string;
}

/**
 * Evaluate auto-scaling rules for a service
 */
export async function evaluateScalingRules(
  serviceId: string,
  metrics: Record<string, number>
): Promise<ScalingDecision> {
  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
  });

  if (!service) {
    throw new Error(`Service ${serviceId} not found`);
  }

  const currentReplicas = service.replicas || 1;

  // Get active scaling rules
  const rules = await db.query.autoScalingRules.findMany({
    where: and(
      eq(autoScalingRules.serviceId, serviceId),
      eq(autoScalingRules.isEnabled, true)
    ),
  });

  if (rules.length === 0) {
    return {
      shouldScale: false,
      direction: null,
      newReplicas: currentReplicas,
      currentReplicas,
      reason: 'No active scaling rules',
    };
  }

  const now = new Date();

  for (const rule of rules) {
    const metricName = rule.customMetricName || rule.metric;
    const metricValue = metrics[metricName];

    if (metricValue === undefined) {
      continue;
    }

    // Check cooldown
    if (rule.lastScaleAction) {
      const cooldownSeconds = rule.lastScaleDirection === 'up'
        ? rule.scaleUpCooldown
        : rule.scaleDownCooldown;

      const cooldownEnd = new Date(rule.lastScaleAction.getTime() + cooldownSeconds * 1000);

      if (now < cooldownEnd) {
        continue; // Still in cooldown
      }
    }

    // Check scale up threshold
    if (metricValue >= rule.scaleUpThreshold && currentReplicas < rule.maxReplicas) {
      const newReplicas = Math.min(
        currentReplicas + rule.scaleUpBy,
        rule.maxReplicas
      );

      return {
        shouldScale: true,
        direction: 'up',
        newReplicas,
        currentReplicas,
        reason: `${metricName} (${metricValue}) >= threshold (${rule.scaleUpThreshold})`,
      };
    }

    // Check scale down threshold
    if (metricValue <= rule.scaleDownThreshold && currentReplicas > rule.minReplicas) {
      const newReplicas = Math.max(
        currentReplicas - rule.scaleDownBy,
        rule.minReplicas
      );

      return {
        shouldScale: true,
        direction: 'down',
        newReplicas,
        currentReplicas,
        reason: `${metricName} (${metricValue}) <= threshold (${rule.scaleDownThreshold})`,
      };
    }
  }

  return {
    shouldScale: false,
    direction: null,
    newReplicas: currentReplicas,
    currentReplicas,
    reason: 'Metrics within thresholds',
  };
}

/**
 * Scale a service to a specific number of replicas
 */
export async function scaleService(params: {
  serviceId: string;
  replicas: number;
  ruleId?: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { serviceId, replicas, ruleId, reason } = params;

  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
    with: {
      server: true,
    },
  });

  if (!service) {
    return { success: false, error: 'Service not found' };
  }

  if (!service.serverId || !service.server) {
    return { success: false, error: 'Service has no server assigned' };
  }

  const fromReplicas = service.replicas || 1;
  const toReplicas = Math.max(1, replicas);
  const direction = toReplicas > fromReplicas ? 'up' : 'down';

  // Check if agent is connected
  if (!agentHub.isAgentConnected(service.serverId)) {
    // Record failed event
    await db.insert(scalingEvents).values({
      serviceId,
      ruleId,
      direction,
      fromReplicas,
      toReplicas,
      reason,
      status: 'failed',
      errorMessage: 'Server is offline',
    });

    return { success: false, error: 'Server is offline' };
  }

  // Update service replicas
  await db
    .update(services)
    .set({ replicas: toReplicas, updatedAt: new Date() })
    .where(eq(services.id, serviceId));

  // Send scale command to agent
  const sent = agentHub.sendToAgent(service.serverId, {
    id: crypto.randomUUID(),
    type: 'scale',
    timestamp: new Date().toISOString(),
    payload: {
      service_id: serviceId,
      replicas: toReplicas,
    },
  });

  // Update rule if auto-scaling
  if (ruleId) {
    await db
      .update(autoScalingRules)
      .set({
        lastScaleAction: new Date(),
        lastScaleDirection: direction,
        updatedAt: new Date(),
      })
      .where(eq(autoScalingRules.id, ruleId));
  }

  // Record scaling event
  await db.insert(scalingEvents).values({
    serviceId,
    ruleId,
    direction,
    fromReplicas,
    toReplicas,
    reason,
    status: sent ? 'completed' : 'pending',
  });

  console.log(`[Scaling] Service ${service.name}: ${fromReplicas} -> ${toReplicas} replicas`);

  return { success: true };
}

/**
 * Get scaling history for a service
 */
export async function getScalingHistory(
  serviceId: string,
  limit: number = 20
): Promise<Array<{
  id: string;
  direction: string;
  fromReplicas: number;
  toReplicas: number;
  reason: string | null;
  status: string;
  createdAt: Date;
}>> {
  const events = await db.query.scalingEvents.findMany({
    where: eq(scalingEvents.serviceId, serviceId),
    orderBy: [desc(scalingEvents.createdAt)],
    limit,
  });

  return events.map(e => ({
    id: e.id,
    direction: e.direction,
    fromReplicas: e.fromReplicas,
    toReplicas: e.toReplicas,
    reason: e.reason,
    status: e.status,
    createdAt: e.createdAt,
  }));
}

/**
 * Get current scaling status for a service
 */
export async function getScalingStatus(serviceId: string): Promise<{
  currentReplicas: number;
  rules: Array<{
    id: string;
    name: string;
    metric: string;
    isEnabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    lastScaleAction: Date | null;
  }>;
  recentEvents: Array<{
    direction: string;
    fromReplicas: number;
    toReplicas: number;
    createdAt: Date;
  }>;
}> {
  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
  });

  if (!service) {
    throw new Error('Service not found');
  }

  const rules = await db.query.autoScalingRules.findMany({
    where: eq(autoScalingRules.serviceId, serviceId),
  });

  const recentEvents = await db.query.scalingEvents.findMany({
    where: eq(scalingEvents.serviceId, serviceId),
    orderBy: [desc(scalingEvents.createdAt)],
    limit: 5,
  });

  return {
    currentReplicas: service.replicas || 1,
    rules: rules.map(r => ({
      id: r.id,
      name: r.name,
      metric: r.customMetricName || r.metric,
      isEnabled: r.isEnabled ?? true,
      minReplicas: r.minReplicas,
      maxReplicas: r.maxReplicas,
      scaleUpThreshold: r.scaleUpThreshold,
      scaleDownThreshold: r.scaleDownThreshold,
      lastScaleAction: r.lastScaleAction,
    })),
    recentEvents: recentEvents.map(e => ({
      direction: e.direction,
      fromReplicas: e.fromReplicas,
      toReplicas: e.toReplicas,
      createdAt: e.createdAt,
    })),
  };
}
