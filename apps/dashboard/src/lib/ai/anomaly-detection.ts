/**
 * AI Anomaly Detection
 *
 * Detects anomalies in service metrics using:
 * 1. Statistical analysis (Z-score based deviation from 7-day rolling baseline)
 * 2. AI-powered analysis (Claude) for context and correlation with recent deployments
 */

import { db } from '@/lib/db';
import { services, deployments, alerts, aiSuggestions } from '@/lib/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { queryMetrics, type AggregatedMetric } from '@/lib/clickhouse/client';
import { getAnthropicClient } from './client';

interface MetricBaseline {
  metricName: string;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p95: number;
  sampleCount: number;
}

interface Anomaly {
  metricName: string;
  currentValue: number;
  baselineMean: number;
  baselineStdDev: number;
  zScore: number;
  severity: 'info' | 'warning' | 'critical';
  direction: 'above' | 'below';
  timestamp: string;
}

interface AnomalyReport {
  serviceId: string;
  analyzedAt: string;
  anomalies: Anomaly[];
  aiAnalysis: string | null;
  correlatedDeployments: Array<{ id: string; createdAt: string; status: string; gitCommitMessage: string | null }>;
}

/**
 * Calculate baseline statistics for a metric over the last 7 days
 */
function calculateBaseline(dataPoints: number[]): { mean: number; stdDev: number; min: number; max: number; p95: number } {
  if (dataPoints.length === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0, p95: 0 };
  }

  const mean = dataPoints.reduce((sum, v) => sum + v, 0) / dataPoints.length;
  const variance = dataPoints.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / dataPoints.length;
  const stdDev = Math.sqrt(variance);
  const sorted = [...dataPoints].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);

  return {
    mean,
    stdDev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[p95Index] || sorted[sorted.length - 1],
  };
}

/**
 * Detect anomalies by comparing recent metrics (last 15 minutes) against 7-day baseline
 */
export async function detectAnomalies(serviceId: string): Promise<AnomalyReport> {
  const now = new Date();
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch 7-day baseline metrics (aggregated to 1m)
  const baselineMetrics = await queryMetrics({
    serviceId,
    startTime: sevenDaysAgo,
    endTime: fifteenMinAgo,
    aggregated: true,
  }) as AggregatedMetric[];

  // Fetch recent metrics (last 15 min, raw)
  const recentMetrics = await queryMetrics({
    serviceId,
    startTime: fifteenMinAgo,
    endTime: now,
    aggregated: false,
  });

  // Group baseline by metric name
  const baselineByMetric = new Map<string, number[]>();
  for (const m of baselineMetrics) {
    const values = baselineByMetric.get(m.metric_name) || [];
    values.push(m.avg_value);
    baselineByMetric.set(m.metric_name, values);
  }

  // Group recent by metric name
  const recentByMetric = new Map<string, number[]>();
  for (const m of recentMetrics) {
    if ('value' in m) {
      const values = recentByMetric.get(m.metric_name) || [];
      values.push(m.value);
      recentByMetric.set(m.metric_name, values);
    }
  }

  // Detect anomalies
  const anomalies: Anomaly[] = [];
  const CRITICAL_Z = 3.5;
  const WARNING_Z = 2.5;
  const INFO_Z = 2.0;

  for (const [metricName, recentValues] of recentByMetric) {
    const baselineValues = baselineByMetric.get(metricName);
    if (!baselineValues || baselineValues.length < 10) continue; // Need sufficient baseline

    const baseline = calculateBaseline(baselineValues);
    if (baseline.stdDev === 0) continue; // No variation in baseline

    const currentMean = recentValues.reduce((s, v) => s + v, 0) / recentValues.length;
    const zScore = Math.abs((currentMean - baseline.mean) / baseline.stdDev);

    if (zScore >= INFO_Z) {
      const direction = currentMean > baseline.mean ? 'above' : 'below';
      let severity: Anomaly['severity'] = 'info';
      if (zScore >= CRITICAL_Z) severity = 'critical';
      else if (zScore >= WARNING_Z) severity = 'warning';

      anomalies.push({
        metricName,
        currentValue: currentMean,
        baselineMean: baseline.mean,
        baselineStdDev: baseline.stdDev,
        zScore,
        severity,
        direction,
        timestamp: now.toISOString(),
      });
    }
  }

  // Get recent deployments for correlation
  const recentDeployments = await db.query.deployments.findMany({
    where: and(
      eq(deployments.serviceId, serviceId),
      gte(deployments.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))
    ),
    orderBy: [desc(deployments.createdAt)],
    limit: 5,
  });

  const correlatedDeployments = recentDeployments.map(d => ({
    id: d.id,
    createdAt: d.createdAt.toISOString(),
    status: d.status,
    gitCommitMessage: d.gitCommitMessage,
  }));

  // AI analysis if there are significant anomalies
  let aiAnalysis: string | null = null;
  const significantAnomalies = anomalies.filter(a => a.severity !== 'info');

  if (significantAnomalies.length > 0) {
    try {
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Analyze these metric anomalies for a deployed service and provide a brief assessment:

Anomalies detected:
${significantAnomalies.map(a =>
  `- ${a.metricName}: current=${a.currentValue.toFixed(2)}, baseline_mean=${a.baselineMean.toFixed(2)}, z_score=${a.zScore.toFixed(1)}, direction=${a.direction}, severity=${a.severity}`
).join('\n')}

Recent deployments (last 24h):
${correlatedDeployments.length > 0
  ? correlatedDeployments.map(d => `- ${d.status} at ${d.createdAt}: ${d.gitCommitMessage || 'No message'}`).join('\n')
  : 'None'}

Provide: 1) Likely root cause 2) Whether this correlates with a deployment 3) Recommended action. Be concise (3-4 sentences).`,
        }],
      });

      aiAnalysis = response.content[0].type === 'text' ? response.content[0].text : null;
    } catch (err) {
      console.error('[AnomalyDetection] AI analysis failed:', err);
    }
  }

  return {
    serviceId,
    analyzedAt: now.toISOString(),
    anomalies,
    aiAnalysis,
    correlatedDeployments,
  };
}

/**
 * Run anomaly detection for all active services and store results
 */
export async function detectAnomaliesForAllServices(): Promise<void> {
  const activeServices = await db.query.services.findMany({
    where: eq(services.isActive, true),
    with: { project: true },
  });

  for (const service of activeServices) {
    try {
      const report = await detectAnomalies(service.id);

      // Create alerts for critical/warning anomalies
      for (const anomaly of report.anomalies) {
        if (anomaly.severity === 'info') continue;

        await db.insert(alerts).values({
          orgId: service.project.orgId,
          serviceId: service.id,
          type: 'anomaly',
          severity: anomaly.severity === 'critical' ? 'critical' : 'warning',
          status: 'active',
          title: `Anomaly: ${anomaly.metricName} is ${anomaly.zScore.toFixed(1)}σ ${anomaly.direction} baseline`,
          message: report.aiAnalysis || `${anomaly.metricName} current value (${anomaly.currentValue.toFixed(2)}) deviates significantly from 7-day baseline (mean: ${anomaly.baselineMean.toFixed(2)})`,
          metadata: {
            anomaly,
            correlatedDeployments: report.correlatedDeployments,
          },
        });
      }

      // Store AI suggestions if analysis available
      if (report.aiAnalysis && report.anomalies.length > 0) {
        await db.insert(aiSuggestions).values({
          orgId: service.project.orgId,
          serviceId: service.id,
          type: 'anomaly',
          severity: report.anomalies.some(a => a.severity === 'critical') ? 'critical' : 'warning',
          title: `Metric anomaly detected: ${report.anomalies.map(a => a.metricName).join(', ')}`,
          description: report.aiAnalysis,
        });
      }

      console.log(`[AnomalyDetection] Service ${service.name}: ${report.anomalies.length} anomalies found`);
    } catch (err) {
      console.error(`[AnomalyDetection] Failed for service ${service.id}:`, err);
    }
  }
}
