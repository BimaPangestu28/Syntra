/**
 * Syntra Build Worker Service
 *
 * Standalone BullMQ worker that consumes Docker build jobs from the
 * shared Redis queue. Clones repos, builds Docker images, pushes to
 * a registry, and queues deployment jobs.
 */

import { config, validateConfig } from './config';
import { closeDb } from './db';
import { startWorker, stopWorker } from './worker';

async function main() {
  console.log('[BuildWorker] Starting service...');

  validateConfig();

  console.log('[BuildWorker] Config:', {
    redis: config.redis.url.replace(/\/\/.*@/, '//<credentials>@'),
    registry: config.docker.registryUrl,
    concurrency: config.worker.concurrency,
    buildsPerMinute: config.worker.buildsPerMinute,
    timeoutMs: config.worker.timeoutMs,
  });

  startWorker();

  console.log('[BuildWorker] Ready — waiting for build jobs');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[BuildWorker] Received ${signal}, shutting down...`);

    await stopWorker();
    await closeDb();

    console.log('[BuildWorker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[BuildWorker] Fatal error:', error);
  process.exit(1);
});
