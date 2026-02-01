import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection for BullMQ
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
};

// Queue names
export const QUEUE_NAMES = {
  DEPLOYMENT: 'deployment',
  BUILD: 'build',
  NOTIFICATION: 'notification',
} as const;

// Job types
export interface DeploymentJobData {
  deploymentId: string;
  serviceId: string;
  serverId: string;
  git?: {
    repoUrl: string;
    branch: string;
    commitSha?: string;
  };
  docker?: {
    image: string;
    tag: string;
  };
  envVars: Record<string, string>;
  triggeredBy?: string;
  triggerType: 'manual' | 'git_push' | 'api' | 'rollback';
}

export interface BuildJobData {
  deploymentId: string;
  serviceId: string;
  git: {
    repoUrl: string;
    branch: string;
    commitSha?: string;
  };
  dockerfile: string;
  buildArgs?: Record<string, string>;
  registry?: string;
}

export interface NotificationJobData {
  type: 'deployment_started' | 'deployment_success' | 'deployment_failed' | 'alert';
  deploymentId?: string;
  serviceId?: string;
  serverId?: string;
  message: string;
  channels: ('email' | 'slack' | 'webhook')[];
  recipients?: string[];
}

// Create queues
let deploymentQueue: Queue<DeploymentJobData> | null = null;
let buildQueue: Queue<BuildJobData> | null = null;
let notificationQueue: Queue<NotificationJobData> | null = null;

export function getDeploymentQueue(): Queue<DeploymentJobData> {
  if (!deploymentQueue) {
    deploymentQueue = new Queue<DeploymentJobData>(QUEUE_NAMES.DEPLOYMENT, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 3600, // Keep for 24 hours
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 3600, // Keep failed for 7 days
        },
      },
    });
  }
  return deploymentQueue;
}

export function getBuildQueue(): Queue<BuildJobData> {
  if (!buildQueue) {
    buildQueue = new Queue<BuildJobData>(QUEUE_NAMES.BUILD, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 10000,
        },
        removeOnComplete: {
          count: 500,
          age: 24 * 3600,
        },
        removeOnFail: {
          count: 1000,
          age: 7 * 24 * 3600,
        },
      },
    });
  }
  return buildQueue;
}

export function getNotificationQueue(): Queue<NotificationJobData> {
  if (!notificationQueue) {
    notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATION, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: {
          count: 1000,
        },
      },
    });
  }
  return notificationQueue;
}

// Helper to add deployment job
export async function queueDeployment(data: DeploymentJobData, priority: number = 0) {
  const queue = getDeploymentQueue();
  const job = await queue.add('deploy', data, {
    priority,
    jobId: `deploy-${data.deploymentId}`,
  });
  console.log(`[Queue] Added deployment job ${job.id} for deployment ${data.deploymentId}`);
  return job;
}

// Helper to add build job
export async function queueBuild(data: BuildJobData) {
  const queue = getBuildQueue();
  const job = await queue.add('build', data, {
    jobId: `build-${data.deploymentId}`,
  });
  console.log(`[Queue] Added build job ${job.id} for deployment ${data.deploymentId}`);
  return job;
}

// Helper to add notification job
export async function queueNotification(data: NotificationJobData) {
  const queue = getNotificationQueue();
  const job = await queue.add('notify', data);
  console.log(`[Queue] Added notification job ${job.id}`);
  return job;
}

// Get queue stats
export async function getQueueStats() {
  const deployQueue = getDeploymentQueue();
  const buildQ = getBuildQueue();
  const notifyQueue = getNotificationQueue();

  const [deployStats, buildStats, notifyStats] = await Promise.all([
    Promise.all([
      deployQueue.getWaitingCount(),
      deployQueue.getActiveCount(),
      deployQueue.getCompletedCount(),
      deployQueue.getFailedCount(),
    ]),
    Promise.all([
      buildQ.getWaitingCount(),
      buildQ.getActiveCount(),
      buildQ.getCompletedCount(),
      buildQ.getFailedCount(),
    ]),
    Promise.all([
      notifyQueue.getWaitingCount(),
      notifyQueue.getActiveCount(),
      notifyQueue.getCompletedCount(),
      notifyQueue.getFailedCount(),
    ]),
  ]);

  return {
    deployment: {
      waiting: deployStats[0],
      active: deployStats[1],
      completed: deployStats[2],
      failed: deployStats[3],
    },
    build: {
      waiting: buildStats[0],
      active: buildStats[1],
      completed: buildStats[2],
      failed: buildStats[3],
    },
    notification: {
      waiting: notifyStats[0],
      active: notifyStats[1],
      completed: notifyStats[2],
      failed: notifyStats[3],
    },
  };
}

// Cleanup function for graceful shutdown
export async function closeQueues() {
  const queues = [deploymentQueue, buildQueue, notificationQueue].filter(Boolean);
  await Promise.all(queues.map((q) => q?.close()));
  console.log('[Queue] All queues closed');
}
