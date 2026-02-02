import { Worker, Queue, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { config } from './config';
import { db, deployments, services } from './db';
import { createRedisConnection } from './redis';
import { createBuildLogger } from './logger';
import { cloneRepository } from './steps/clone';
import { buildImage } from './steps/build';
import { pushImage } from './steps/push';
import type { BuildJobData, DeploymentJobData, NotificationJobData, BuildContext } from './types';

const QUEUE_NAMES = {
  BUILD: 'build',
  DEPLOYMENT: 'deployment',
  NOTIFICATION: 'notification',
} as const;

// Queue producers for downstream jobs
let deploymentQueue: Queue<DeploymentJobData> | null = null;
let notificationQueue: Queue<NotificationJobData> | null = null;

function getDeploymentQueue(): Queue<DeploymentJobData> {
  if (!deploymentQueue) {
    deploymentQueue = new Queue<DeploymentJobData>(QUEUE_NAMES.DEPLOYMENT, {
      connection: createRedisConnection(),
    });
  }
  return deploymentQueue;
}

function getNotificationQueue(): Queue<NotificationJobData> {
  if (!notificationQueue) {
    notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATION, {
      connection: createRedisConnection(),
    });
  }
  return notificationQueue;
}

async function queueDeployment(data: DeploymentJobData): Promise<void> {
  const queue = getDeploymentQueue();
  const job = await queue.add('deploy', data, {
    jobId: `deploy-${data.deploymentId}`,
  });
  console.log(`[BuildWorker] Queued deployment job ${job.id} for ${data.deploymentId}`);
}

async function queueNotification(data: NotificationJobData): Promise<void> {
  const queue = getNotificationQueue();
  const job = await queue.add('notify', data);
  console.log(`[BuildWorker] Queued notification job ${job.id}`);
}

async function cleanup(workDir: string): Promise<void> {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`[BuildWorker] Failed to cleanup ${workDir}:`, error);
  }
}

async function processBuild(job: Job<BuildJobData>): Promise<void> {
  const { deploymentId, serviceId, git, dockerfile, buildArgs } = job.data;

  const workDir = path.join(os.tmpdir(), `syntra-build-${deploymentId}`);
  await fs.mkdir(workDir, { recursive: true });

  const ctx: BuildContext = {
    workDir,
    deploymentId,
    serviceId,
    logs: [],
  };

  const logger = createBuildLogger(ctx);

  console.log(`[BuildWorker] Processing build for deployment ${deploymentId}`);

  try {
    // Mark deployment as building
    await db
      .update(deployments)
      .set({
        status: 'building',
        buildStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));

    await logger.appendLog('=== Build Started ===');

    // Get service details with project
    const service = await db.query.services.findFirst({
      where: eq(services.id, serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      throw new Error(`Service ${serviceId} not found`);
    }

    // Clone repository
    await logger.appendLog(`Cloning repository: ${git.repoUrl}`);
    await logger.appendLog(`Branch: ${git.branch}`);
    const repoPath = await cloneRepository(workDir, git.repoUrl, git.branch, git.commitSha);
    await logger.appendLog('Repository cloned successfully');

    await job.updateProgress(30);

    // Build Docker image
    const imageName = `${service.project.slug}/${service.name}:${git.commitSha?.slice(0, 7) || 'latest'}`;
    await logger.appendLog(`Building Docker image: ${imageName}`);
    await logger.appendLog(`Dockerfile: ${dockerfile}`);
    await buildImage(repoPath, dockerfile, imageName, buildArgs);
    await logger.appendLog('Docker image built successfully');

    await job.updateProgress(70);

    // Push to registry
    await logger.appendLog(`Pushing image to registry: ${config.docker.registryUrl}`);
    const registryImage = await pushImage(
      imageName,
      config.docker.registryUrl,
      config.docker.registryUsername,
      config.docker.registryPassword,
    );
    await logger.appendLog('Image pushed successfully');

    await job.updateProgress(90);

    // Update deployment with image tag
    await db
      .update(deployments)
      .set({
        dockerImageTag: registryImage,
        buildFinishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));

    await logger.appendLog('=== Build Completed ===');
    await logger.appendLog(`Image: ${registryImage}`);
    await logger.flushNow();

    // Queue the deployment job
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, deploymentId),
    });

    if (deployment && deployment.serverId) {
      await queueDeployment({
        deploymentId,
        serviceId,
        serverId: deployment.serverId,
        docker: {
          image: registryImage,
          tag: git.commitSha?.slice(0, 7) || 'latest',
        },
        envVars: (service.envVars as Record<string, string>) || {},
        triggerType: 'manual',
      });

      await logger.appendLog('Deployment job queued');
    }

    // Send notification
    await queueNotification({
      type: 'deployment_started',
      deploymentId,
      serviceId,
      message: `Build completed for ${service.name}, deploying...`,
      channels: ['webhook'],
    });

    await logger.flushNow();
    console.log(`[BuildWorker] Build ${deploymentId} completed successfully`);
  } catch (error) {
    console.error(`[BuildWorker] Build ${deploymentId} failed:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await logger.appendLog('=== Build Failed ===');
    await logger.appendLog(`Error: ${errorMessage}`);
    await logger.flushNow();

    // Update deployment as failed
    await db
      .update(deployments)
      .set({
        status: 'failed',
        errorMessage,
        buildFinishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));

    // Send failure notification
    await queueNotification({
      type: 'deployment_failed',
      deploymentId,
      serviceId,
      message: `Build failed: ${errorMessage}`,
      channels: ['webhook'],
    });

    throw error;
  } finally {
    await cleanup(workDir);
  }
}

let worker: Worker<BuildJobData> | null = null;

export function startWorker(): Worker<BuildJobData> {
  if (worker) {
    console.log('[BuildWorker] Worker already running');
    return worker;
  }

  worker = new Worker<BuildJobData>(
    QUEUE_NAMES.BUILD,
    processBuild,
    {
      connection: createRedisConnection(),
      concurrency: config.worker.concurrency,
      limiter: {
        max: config.worker.buildsPerMinute,
        duration: 60000,
      },
    },
  );

  worker.on('completed', (job) => {
    console.log(`[BuildWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[BuildWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[BuildWorker] Worker error:', err);
  });

  console.log('[BuildWorker] Worker started');
  console.log(`[BuildWorker] Concurrency: ${config.worker.concurrency}, Rate limit: ${config.worker.buildsPerMinute}/min`);

  return worker;
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[BuildWorker] Worker stopped');
  }

  if (deploymentQueue) {
    await deploymentQueue.close();
    deploymentQueue = null;
  }

  if (notificationQueue) {
    await notificationQueue.close();
    notificationQueue = null;
  }
}
