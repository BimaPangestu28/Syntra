import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { detectAnomaliesForAllServices } from '@/lib/ai/anomaly-detection';

const QUEUE_NAME = 'anomaly-detection';

export function createAnomalyDetectionWorker() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      console.log('[AnomalyDetection] Starting anomaly detection run...');
      await detectAnomaliesForAllServices();
      console.log('[AnomalyDetection] Anomaly detection run complete');
    },
    { connection, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error('[AnomalyDetection] Worker failed:', err);
  });

  return worker;
}
