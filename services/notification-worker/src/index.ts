/**
 * Syntra Notification Worker Service
 *
 * Standalone BullMQ worker that consumes notification jobs from the
 * shared Redis queue. Looks up per-org notification channels from
 * PostgreSQL and delivers via email (Resend), Slack, Discord,
 * PagerDuty, and custom webhooks.
 */

import { config, validateConfig } from './config';
import { closeDb } from './db';
import { startWorker, stopWorker } from './worker';

async function main() {
  console.log('[NotificationWorker] Starting service...');

  validateConfig();

  console.log('[NotificationWorker] Config:', {
    redis: config.redis.url.replace(/\/\/.*@/, '//<credentials>@'),
    emailConfigured: !!config.email.resendApiKey,
    emailFrom: config.email.from,
    concurrency: config.worker.concurrency,
    notificationsPerMinute: config.worker.notificationsPerMinute,
  });

  startWorker();

  console.log('[NotificationWorker] Ready — waiting for notification jobs');

  const shutdown = async (signal: string) => {
    console.log(`[NotificationWorker] Received ${signal}, shutting down...`);

    await stopWorker();
    await closeDb();

    console.log('[NotificationWorker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[NotificationWorker] Fatal error:', error);
  process.exit(1);
});
