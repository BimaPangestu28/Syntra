import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '@/lib/db';
import { uptimeMonitors, uptimeChecks, alerts } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { QUEUE_NAMES, queueNotification, type UptimeJobData } from '../index';

async function performCheck(job: Job<UptimeJobData>) {
  const { monitorId, url, method, headers, body, expectedStatusCode, expectedResponseContains, timeoutSeconds, alertAfterFailures, orgId } = job.data;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  let status: 'up' | 'down' = 'down';
  let statusCode: number | null = null;
  let responseTime: number | null = null;
  let errorMessage: string | null = null;

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers: headers || undefined,
      body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
      signal: controller.signal,
    });

    responseTime = Date.now() - startTime;
    statusCode = response.status;

    if (statusCode === expectedStatusCode) {
      if (expectedResponseContains) {
        const text = await response.text();
        status = text.includes(expectedResponseContains) ? 'up' : 'down';
        if (status === 'down') {
          errorMessage = 'Response body did not contain expected string';
        }
      } else {
        status = 'up';
      }
    } else {
      status = 'down';
      errorMessage = `Expected status ${expectedStatusCode}, got ${statusCode}`;
    }
  } catch (err: any) {
    responseTime = Date.now() - startTime;
    if (err.name === 'AbortError') {
      errorMessage = `Timeout after ${timeoutSeconds}s`;
    } else {
      errorMessage = err.message || 'Unknown error';
    }
  } finally {
    clearTimeout(timeout);
  }

  // Record the check
  await db.insert(uptimeChecks).values({
    monitorId,
    status,
    statusCode,
    responseTime,
    errorMessage,
    checkedFrom: 'primary',
  });

  // Update monitor status
  if (status === 'up') {
    await db
      .update(uptimeMonitors)
      .set({
        lastCheckAt: new Date(),
        lastStatus: 'up',
        lastResponseTime: responseTime,
        consecutiveFailures: 0,
        updatedAt: new Date(),
      })
      .where(eq(uptimeMonitors.id, monitorId));
  } else {
    // Increment consecutive failures
    const [updated] = await db
      .update(uptimeMonitors)
      .set({
        lastCheckAt: new Date(),
        lastStatus: 'down',
        lastResponseTime: responseTime,
        consecutiveFailures: sql`${uptimeMonitors.consecutiveFailures} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(uptimeMonitors.id, monitorId))
      .returning();

    // Check if we should alert
    if (updated && (updated.consecutiveFailures ?? 0) >= alertAfterFailures) {
      // Create an alert
      await db.insert(alerts).values({
        orgId,
        type: 'uptime_down',
        severity: 'critical',
        status: 'active',
        title: `Monitor down: ${url}`,
        message: errorMessage || `Monitor has been down for ${updated.consecutiveFailures} consecutive checks`,
        metadata: { monitorId, url, consecutiveFailures: updated.consecutiveFailures },
      });

      // Queue notification
      await queueNotification({
        type: 'alert',
        message: `Uptime monitor ${url} is down (${updated.consecutiveFailures} consecutive failures). ${errorMessage || ''}`,
        channels: ['email', 'slack'],
      });
    }
  }
}

export function createUptimeWorker() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<UptimeJobData>(
    QUEUE_NAMES.UPTIME,
    async (job) => {
      await performCheck(job);
    },
    {
      connection,
      concurrency: 20,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Uptime] Check completed for monitor ${job.data.monitorId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Uptime] Check failed for monitor ${job?.data.monitorId}:`, err);
  });

  return worker;
}
