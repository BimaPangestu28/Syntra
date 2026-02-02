import { Worker, Job } from 'bullmq';
import { createRedisConnection } from './redis';
import { config } from './config';
import { getNotificationContext, getChannelsForOrg } from './context';
import { sendEmail } from './channels/email';
import { sendSlack } from './channels/slack';
import { sendDiscord } from './channels/discord';
import { sendPagerDuty } from './channels/pagerduty';
import { sendWebhook } from './channels/webhook';
import type { NotificationJobData, NotificationContext, ChannelConfig } from './types';

const CHANNEL_TYPE_MAP: Record<string, string> = {
  email: 'email',
  slack: 'slack',
  webhook: 'webhook',
  discord: 'discord',
  pagerduty: 'pagerduty',
};

async function deliverToChannel(
  channelType: string,
  data: NotificationJobData,
  context: NotificationContext,
  channelConfig: ChannelConfig
): Promise<void> {
  switch (channelType) {
    case 'email':
      await sendEmail(data, context, channelConfig);
      break;
    case 'slack':
      await sendSlack(data, context, channelConfig);
      break;
    case 'discord':
      await sendDiscord(data, context, channelConfig);
      break;
    case 'pagerduty':
      await sendPagerDuty(data, context, channelConfig);
      break;
    case 'webhook':
      await sendWebhook(data, context, channelConfig);
      break;
    default:
      console.log(`[NotificationWorker] Unknown channel type: ${channelType}`);
  }
}

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const data = job.data;

  console.log(`[NotificationWorker] Processing notification: ${data.type} (job ${job.id})`);

  // Enrich notification with deployment/service context
  const context = await getNotificationContext(data);

  // Determine org ID from context
  const orgId = context.orgId;
  if (!orgId) {
    console.log('[NotificationWorker] Could not determine org ID, skipping channel lookup');
    return;
  }

  // Look up notification channels for the org from the database
  const orgChannels = await getChannelsForOrg(orgId);

  if (orgChannels.length === 0) {
    console.log(`[NotificationWorker] No enabled notification channels for org ${orgId}`);
    return;
  }

  // Filter channels to those matching the requested channel types from the job
  // The job specifies broad types (email, slack, webhook); we match against DB channel types
  // DB channel types may include: email, slack, discord, pagerduty, webhook
  const requestedTypes = new Set(data.channels);

  // Map requested types to DB types. "slack" in job matches "slack" + "discord" in DB.
  // "webhook" in job matches "webhook" + "pagerduty" in DB.
  const matchingChannels = orgChannels.filter((ch) => {
    if (requestedTypes.has('slack') && (ch.type === 'slack' || ch.type === 'discord')) {
      return true;
    }
    if (requestedTypes.has('webhook') && (ch.type === 'webhook' || ch.type === 'pagerduty')) {
      return true;
    }
    if (requestedTypes.has('email') && ch.type === 'email') {
      return true;
    }
    return false;
  });

  if (matchingChannels.length === 0) {
    console.log(`[NotificationWorker] No matching channels for types: ${data.channels.join(', ')}`);
    return;
  }

  // Deliver to each matching channel
  const errors: Error[] = [];

  for (const channel of matchingChannels) {
    try {
      await deliverToChannel(channel.type, data, context, channel.config);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[NotificationWorker] Failed to deliver to ${channel.type} channel "${channel.name}":`,
        err.message
      );
      errors.push(err);
    }
  }

  // If ALL deliveries failed, throw to trigger BullMQ retry
  if (errors.length === matchingChannels.length && errors.length > 0) {
    throw new Error(
      `All notification channels failed: ${errors.map((e) => e.message).join(', ')}`
    );
  }

  console.log(
    `[NotificationWorker] Notification processed: ${matchingChannels.length - errors.length}/${matchingChannels.length} channels succeeded`
  );
}

let worker: Worker<NotificationJobData> | null = null;

export function startWorker(): void {
  if (worker) {
    console.log('[NotificationWorker] Worker already running');
    return;
  }

  worker = new Worker<NotificationJobData>('notification', processNotification, {
    connection: createRedisConnection(),
    concurrency: config.worker.concurrency,
    limiter: {
      max: config.worker.notificationsPerMinute,
      duration: 60000,
    },
  });

  worker.on('completed', (job) => {
    console.log(`[NotificationWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[NotificationWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[NotificationWorker] Worker error:', err);
  });

  console.log('[NotificationWorker] Worker started');
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[NotificationWorker] Worker stopped');
  }
}
