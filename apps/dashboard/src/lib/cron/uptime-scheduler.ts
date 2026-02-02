import { db } from '@/lib/db';
import { uptimeMonitors } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUptimeQueue, type UptimeJobData } from '@/lib/queue';

/**
 * Schedule all enabled uptime monitors as repeatable BullMQ jobs.
 */
export async function scheduleAllUptimeMonitors() {
  const monitors = await db.query.uptimeMonitors.findMany({
    where: eq(uptimeMonitors.isEnabled, true),
  });

  const queue = getUptimeQueue();

  for (const monitor of monitors) {
    const jobData: UptimeJobData = {
      monitorId: monitor.id,
      url: monitor.url,
      method: monitor.method || 'GET',
      headers: monitor.headers || undefined,
      body: monitor.body || undefined,
      expectedStatusCode: monitor.expectedStatusCode || 200,
      expectedResponseContains: monitor.expectedResponseContains || undefined,
      timeoutSeconds: monitor.timeoutSeconds || 30,
      alertAfterFailures: monitor.alertAfterFailures || 3,
      orgId: monitor.orgId,
    };

    await queue.add('check', jobData, {
      repeat: {
        every: (monitor.intervalSeconds || 60) * 1000,
      },
      jobId: `uptime-repeat-${monitor.id}`,
    });
  }

  console.log(`[Uptime Scheduler] Scheduled ${monitors.length} monitors`);
}

/**
 * Reschedule a single monitor (after update or creation).
 */
export async function rescheduleMonitor(monitorId: string) {
  const queue = getUptimeQueue();
  const repeatJobId = `uptime-repeat-${monitorId}`;

  // Remove existing repeatable job
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id === repeatJobId) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  const monitor = await db.query.uptimeMonitors.findFirst({
    where: eq(uptimeMonitors.id, monitorId),
  });

  if (!monitor || !monitor.isEnabled) {
    return;
  }

  const jobData: UptimeJobData = {
    monitorId: monitor.id,
    url: monitor.url,
    method: monitor.method || 'GET',
    headers: monitor.headers || undefined,
    body: monitor.body || undefined,
    expectedStatusCode: monitor.expectedStatusCode || 200,
    expectedResponseContains: monitor.expectedResponseContains || undefined,
    timeoutSeconds: monitor.timeoutSeconds || 30,
    alertAfterFailures: monitor.alertAfterFailures || 3,
    orgId: monitor.orgId,
  };

  await queue.add('check', jobData, {
    repeat: {
      every: (monitor.intervalSeconds || 60) * 1000,
    },
    jobId: repeatJobId,
  });

  console.log(`[Uptime Scheduler] Rescheduled monitor ${monitorId}`);
}

/**
 * Remove a monitor's scheduled job.
 */
export async function unscheduleMonitor(monitorId: string) {
  const queue = getUptimeQueue();
  const repeatJobId = `uptime-repeat-${monitorId}`;

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id === repeatJobId) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  console.log(`[Uptime Scheduler] Unscheduled monitor ${monitorId}`);
}
