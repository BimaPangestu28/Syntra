import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '@/lib/db';
import { alertRules, alerts } from '@/lib/db/schema';
import { eq, and, lt, gt } from 'drizzle-orm';
import { queryMetrics } from '@/lib/clickhouse/client';
import { queueNotification } from '@/lib/queue';
import { publishEvent } from '@/lib/events/publisher';

// Redis connection
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
};

export interface AlertEvaluationJobData {
  // Empty - this is a periodic job that evaluates all rules
}

/**
 * Evaluate a metric value against a rule's threshold
 */
function evaluateCondition(
  value: number,
  operator: string,
  threshold: number
): boolean {
  switch (operator) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
    default:
      console.warn(`[AlertEvaluation] Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Calculate metric value from ClickHouse data based on metric type
 */
async function getMetricValue(
  rule: {
    metric: string;
    serviceId: string | null;
    windowMinutes: number;
  }
): Promise<number | null> {
  const now = new Date();
  const startTime = new Date(now.getTime() - rule.windowMinutes * 60 * 1000);

  try {
    // Query aggregated metrics from ClickHouse
    const metrics = await queryMetrics({
      serviceId: rule.serviceId || undefined,
      metricName: rule.metric,
      startTime,
      endTime: now,
      aggregated: true,
    });

    if (!metrics || metrics.length === 0) {
      return null;
    }

    // For aggregated metrics, calculate based on metric type
    // Most recent average value is typically what we want
    const latestMetric = metrics[0];

    if ('avg_value' in latestMetric) {
      return latestMetric.avg_value;
    } else if ('value' in latestMetric) {
      return latestMetric.value;
    }

    return null;
  } catch (error) {
    console.error(`[AlertEvaluation] Error querying metrics for ${rule.metric}:`, error);
    return null;
  }
}

/**
 * Check if a rule is in cooldown period
 */
function isInCooldown(
  lastTriggeredAt: Date | null,
  cooldownMinutes: number
): boolean {
  if (!lastTriggeredAt) {
    return false;
  }

  const now = new Date();
  const cooldownEndTime = new Date(
    lastTriggeredAt.getTime() + cooldownMinutes * 60 * 1000
  );

  return now < cooldownEndTime;
}

/**
 * Process alert evaluation job
 */
async function processAlertEvaluation(
  job: Job<AlertEvaluationJobData>
): Promise<void> {
  console.log('[AlertEvaluation] Starting alert rule evaluation');

  try {
    // Query all enabled alert rules
    const rules = await db.query.alertRules.findMany({
      where: eq(alertRules.isEnabled, true),
      with: {
        service: {
          columns: { id: true, name: true },
        },
        organization: {
          columns: { id: true, name: true },
        },
      },
    });

    console.log(`[AlertEvaluation] Evaluating ${rules.length} enabled rules`);

    let triggeredCount = 0;

    for (const rule of rules) {
      try {
        // Check if rule is in cooldown
        if (isInCooldown(rule.lastTriggeredAt, rule.cooldownMinutes)) {
          console.log(
            `[AlertEvaluation] Rule ${rule.id} (${rule.name}) is in cooldown, skipping`
          );
          continue;
        }

        // Get current metric value
        const metricValue = await getMetricValue({
          metric: rule.metric,
          serviceId: rule.serviceId,
          windowMinutes: rule.windowMinutes,
        });

        if (metricValue === null) {
          console.log(
            `[AlertEvaluation] No metric data for rule ${rule.id} (${rule.name}), skipping`
          );
          continue;
        }

        // Evaluate condition
        const isTriggered = evaluateCondition(
          metricValue,
          rule.operator,
          rule.threshold
        );

        if (isTriggered) {
          console.log(
            `[AlertEvaluation] Rule ${rule.id} (${rule.name}) triggered: ${metricValue} ${rule.operator} ${rule.threshold}`
          );

          // Create alert record
          const [alert] = await db
            .insert(alerts)
            .values({
              orgId: rule.orgId,
              serviceId: rule.serviceId,
              type: 'metric_alert',
              severity: rule.severity,
              status: 'active',
              title: `Alert: ${rule.name}`,
              message: `${rule.metric} is ${metricValue} (threshold: ${rule.operator} ${rule.threshold})`,
              metadata: {
                ruleId: rule.id,
                ruleName: rule.name,
                metric: rule.metric,
                metricValue,
                operator: rule.operator,
                threshold: rule.threshold,
                windowMinutes: rule.windowMinutes,
              },
            })
            .returning();

          // Update lastTriggeredAt on the rule
          await db
            .update(alertRules)
            .set({ lastTriggeredAt: new Date() })
            .where(eq(alertRules.id, rule.id));

          // Publish webhook event for alert.fired
          try {
            await publishEvent(rule.orgId, 'alert.fired', {
              alert_id: alert.id,
              rule_id: rule.id,
              rule_name: rule.name,
              severity: rule.severity,
              metric: rule.metric,
              metric_value: metricValue,
              threshold: rule.threshold,
              operator: rule.operator,
              service_id: rule.serviceId || undefined,
            });
          } catch (publishError) {
            console.error(
              `[AlertEvaluation] Failed to publish alert event for rule ${rule.id}:`,
              publishError
            );
          }

          // Queue notifications for each channel
          if (rule.channelIds && rule.channelIds.length > 0) {
            // Fetch channel configurations
            const channels = await db.query.notificationChannels.findMany({
              where: (channels, { inArray }) =>
                inArray(channels.id, rule.channelIds as string[]),
            });

            for (const channel of channels) {
              if (!channel.isEnabled) {
                continue;
              }

              try {
                await queueNotification({
                  type: 'alert',
                  message: `${rule.severity.toUpperCase()}: ${rule.name}`,
                  serviceId: rule.serviceId || undefined,
                  channels: [channel.type as 'email' | 'slack' | 'webhook'],
                  recipients: channel.config.email ? [channel.config.email] : undefined,
                });

                console.log(
                  `[AlertEvaluation] Queued notification to channel ${channel.type}`
                );
              } catch (error) {
                console.error(
                  `[AlertEvaluation] Failed to queue notification for channel ${channel.id}:`,
                  error
                );
              }
            }
          }

          triggeredCount++;
        }
      } catch (error) {
        console.error(
          `[AlertEvaluation] Error evaluating rule ${rule.id}:`,
          error
        );
        // Continue with next rule
      }
    }

    console.log(
      `[AlertEvaluation] Evaluation complete. ${triggeredCount} rules triggered.`
    );
  } catch (error) {
    console.error('[AlertEvaluation] Error in alert evaluation:', error);
    throw error;
  }
}

// Create and start worker
let worker: Worker<AlertEvaluationJobData> | null = null;

export function createAlertEvaluationWorker(): Worker<AlertEvaluationJobData> {
  if (worker) {
    console.log('[AlertEvaluation] Worker already exists');
    return worker;
  }

  worker = new Worker<AlertEvaluationJobData>(
    'alert-evaluation',
    processAlertEvaluation,
    {
      connection: getRedisConnection(),
      concurrency: 1, // Only one evaluation at a time to prevent overlaps
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AlertEvaluation] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[AlertEvaluation] Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    console.error('[AlertEvaluation] Worker error:', err);
  });

  console.log('[AlertEvaluation] Worker created');
  return worker;
}

export function stopAlertEvaluationWorker() {
  if (worker) {
    worker.close();
    worker = null;
    console.log('[AlertEvaluation] Worker stopped');
  }
}

export { worker as alertEvaluationWorker };
