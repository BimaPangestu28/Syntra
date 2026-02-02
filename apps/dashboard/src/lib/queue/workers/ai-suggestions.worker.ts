import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, type AiSuggestionsJobData } from '../index';
import { generateSuggestions } from '@/lib/ai/suggestions';

async function processAiSuggestions(job: Job<AiSuggestionsJobData>) {
  const { serviceId, orgId } = job.data;

  const count = await generateSuggestions(serviceId, orgId);
  console.log(`[AI Suggestions] Generated ${count} suggestions for service ${serviceId}`);
}

export function createAiSuggestionsWorker() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<AiSuggestionsJobData>(
    QUEUE_NAMES.AI_SUGGESTIONS,
    async (job) => {
      await processAiSuggestions(job);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AI Suggestions] Job completed for service ${job.data.serviceId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[AI Suggestions] Job failed for service ${job?.data.serviceId}:`, err);
  });

  return worker;
}
