import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '@/lib/db';
import { deployments, services } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { agentHub } from '@/lib/agent/hub';
import { QUEUE_NAMES, DeploymentJobData, queueNotification } from '../index';

// Redis connection
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
};

// Process deployment job
async function processDeployment(job: Job<DeploymentJobData>): Promise<void> {
  const { deploymentId, serviceId, serverId, git, docker, envVars, triggerType } = job.data;

  console.log(`[DeploymentWorker] Processing deployment ${deploymentId}`);

  try {
    // Update deployment status to building
    await db
      .update(deployments)
      .set({
        status: 'building',
        buildStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));

    // Get service details
    const service = await db.query.services.findFirst({
      where: eq(services.id, serviceId),
      with: {
        project: true,
        server: true,
      },
    });

    if (!service) {
      throw new Error(`Service ${serviceId} not found`);
    }

    if (!service.server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // Check if agent is connected
    if (!agentHub.isAgentConnected(serverId)) {
      throw new Error(`Agent for server ${serverId} is not connected`);
    }

    // Prepare deploy payload
    const deployPayload = {
      deployment_id: deploymentId,
      service: {
        id: service.id,
        name: service.name,
        type: service.type,
        source_type: service.sourceType,
        docker_image: service.dockerImage || docker?.image,
        dockerfile_path: service.dockerfilePath,
        port: service.port,
        replicas: service.replicas,
        health_check: {
          path: service.healthCheckPath,
          interval_seconds: service.healthCheckInterval,
        },
        env_vars: envVars,
        resources: service.resources,
      },
      git: git
        ? {
            repo_url: git.repoUrl,
            branch: git.branch,
            commit_sha: git.commitSha,
          }
        : undefined,
      docker: docker
        ? {
            image: docker.image,
            tag: docker.tag,
          }
        : undefined,
    };

    // Send deploy command to agent
    const sent = agentHub.sendToAgent(serverId, {
      id: job.id || deploymentId,
      type: 'deploy',
      timestamp: new Date().toISOString(),
      payload: deployPayload,
    });

    if (!sent) {
      throw new Error('Failed to send deploy command to agent');
    }

    // Update progress
    await job.updateProgress(50);

    // Note: The actual deployment completion is handled by the agent
    // sending back status updates via WebSocket
    // This worker just initiates the deployment

    console.log(`[DeploymentWorker] Deployment ${deploymentId} initiated successfully`);

    // Send notification
    await queueNotification({
      type: 'deployment_started',
      deploymentId,
      serviceId,
      serverId,
      message: `Deployment started for ${service.name}`,
      channels: ['webhook'],
    });

  } catch (error) {
    console.error(`[DeploymentWorker] Deployment ${deploymentId} failed:`, error);

    // Update deployment as failed
    await db
      .update(deployments)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));

    // Send failure notification
    await queueNotification({
      type: 'deployment_failed',
      deploymentId,
      serviceId,
      serverId,
      message: `Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      channels: ['webhook'],
    });

    throw error;
  }
}

// Create and start worker
let worker: Worker<DeploymentJobData> | null = null;

export function startDeploymentWorker() {
  if (worker) {
    console.log('[DeploymentWorker] Worker already running');
    return worker;
  }

  worker = new Worker<DeploymentJobData>(
    QUEUE_NAMES.DEPLOYMENT,
    processDeployment,
    {
      connection: getRedisConnection(),
      concurrency: 5, // Process up to 5 deployments concurrently
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[DeploymentWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[DeploymentWorker] Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    console.error('[DeploymentWorker] Worker error:', err);
  });

  console.log('[DeploymentWorker] Started');
  return worker;
}

export function stopDeploymentWorker() {
  if (worker) {
    worker.close();
    worker = null;
    console.log('[DeploymentWorker] Stopped');
  }
}

export { worker as deploymentWorker };
