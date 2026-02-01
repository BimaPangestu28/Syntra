import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '@/lib/db';
import { deployments, services, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { BuildJobData, queueDeployment, queueNotification } from '../index';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Redis connection
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
};

// Registry configuration
const REGISTRY_URL = process.env.DOCKER_REGISTRY_URL || 'localhost:5000';
const REGISTRY_USERNAME = process.env.DOCKER_REGISTRY_USERNAME;
const REGISTRY_PASSWORD = process.env.DOCKER_REGISTRY_PASSWORD;

interface BuildContext {
  workDir: string;
  deploymentId: string;
  serviceId: string;
  logs: string[];
}

// Append log and update deployment
async function appendLog(ctx: BuildContext, message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;
  ctx.logs.push(logLine);

  // Update build logs in database
  await db
    .update(deployments)
    .set({
      buildLogs: ctx.logs.join('\n'),
      updatedAt: new Date(),
    })
    .where(eq(deployments.id, ctx.deploymentId));

  console.log(`[BuildWorker] ${ctx.deploymentId}: ${message}`);
}

// Clone git repository
async function cloneRepository(
  ctx: BuildContext,
  repoUrl: string,
  branch: string,
  commitSha?: string
): Promise<void> {
  await appendLog(ctx, `Cloning repository: ${repoUrl}`);
  await appendLog(ctx, `Branch: ${branch}`);

  // Clone the repository
  const cloneCmd = `git clone --depth 1 --branch ${branch} ${repoUrl} ${ctx.workDir}/repo`;
  await execAsync(cloneCmd);

  // If specific commit is requested, checkout
  if (commitSha) {
    await appendLog(ctx, `Checking out commit: ${commitSha}`);
    await execAsync(`cd ${ctx.workDir}/repo && git fetch --depth 1 origin ${commitSha} && git checkout ${commitSha}`);
  }

  await appendLog(ctx, 'Repository cloned successfully');
}

// Build Docker image
async function buildImage(
  ctx: BuildContext,
  dockerfile: string,
  imageName: string,
  buildArgs?: Record<string, string>
): Promise<string> {
  const repoPath = path.join(ctx.workDir, 'repo');
  const dockerfilePath = path.join(repoPath, dockerfile);

  // Check if Dockerfile exists
  try {
    await fs.access(dockerfilePath);
  } catch {
    throw new Error(`Dockerfile not found at: ${dockerfile}`);
  }

  await appendLog(ctx, `Building Docker image: ${imageName}`);
  await appendLog(ctx, `Dockerfile: ${dockerfile}`);

  // Prepare build args
  let buildArgsStr = '';
  if (buildArgs) {
    buildArgsStr = Object.entries(buildArgs)
      .map(([key, value]) => `--build-arg ${key}="${value}"`)
      .join(' ');
  }

  // Build the image
  const buildCmd = `cd ${repoPath} && docker build -t ${imageName} -f ${dockerfile} ${buildArgsStr} .`;

  try {
    const { stdout, stderr } = await execAsync(buildCmd, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for logs
    });

    // Parse build output for logs
    const buildOutput = stdout || stderr;
    const lines = buildOutput.split('\n').filter(line => line.trim());
    for (const line of lines.slice(-20)) { // Last 20 lines
      await appendLog(ctx, line);
    }

    await appendLog(ctx, 'Docker image built successfully');
    return imageName;
  } catch (error: any) {
    const errorOutput = error.stderr || error.stdout || error.message;
    await appendLog(ctx, `Build failed: ${errorOutput}`);
    throw new Error(`Docker build failed: ${errorOutput}`);
  }
}

// Push image to registry
async function pushImage(ctx: BuildContext, imageName: string): Promise<string> {
  const registryImage = `${REGISTRY_URL}/${imageName}`;

  await appendLog(ctx, `Tagging image for registry: ${registryImage}`);

  // Tag the image
  await execAsync(`docker tag ${imageName} ${registryImage}`);

  // Login to registry if credentials provided
  if (REGISTRY_USERNAME && REGISTRY_PASSWORD) {
    await appendLog(ctx, 'Logging into Docker registry');
    await execAsync(
      `echo "${REGISTRY_PASSWORD}" | docker login ${REGISTRY_URL} -u ${REGISTRY_USERNAME} --password-stdin`
    );
  }

  // Push the image
  await appendLog(ctx, `Pushing image to registry: ${registryImage}`);

  try {
    await execAsync(`docker push ${registryImage}`);
    await appendLog(ctx, 'Image pushed successfully');
    return registryImage;
  } catch (error: any) {
    await appendLog(ctx, `Push failed: ${error.message}`);
    throw new Error(`Failed to push image: ${error.message}`);
  }
}

// Cleanup build directory
async function cleanup(ctx: BuildContext): Promise<void> {
  try {
    await fs.rm(ctx.workDir, { recursive: true, force: true });
    await appendLog(ctx, 'Cleaned up build directory');
  } catch (error) {
    console.error(`[BuildWorker] Failed to cleanup: ${error}`);
  }
}

// Process build job
async function processBuild(job: Job<BuildJobData>): Promise<void> {
  const { deploymentId, serviceId, git, dockerfile, buildArgs, registry } = job.data;

  // Create temp directory for build
  const workDir = path.join(os.tmpdir(), `syntra-build-${deploymentId}`);
  await fs.mkdir(workDir, { recursive: true });

  const ctx: BuildContext = {
    workDir,
    deploymentId,
    serviceId,
    logs: [],
  };

  console.log(`[BuildWorker] Processing build for deployment ${deploymentId}`);

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

    await appendLog(ctx, '=== Build Started ===');

    // Get service details
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
    await cloneRepository(ctx, git.repoUrl, git.branch, git.commitSha);

    // Update progress
    await job.updateProgress(30);

    // Build image
    const imageName = `${service.project.slug}/${service.name}:${git.commitSha?.slice(0, 7) || 'latest'}`;
    await buildImage(ctx, dockerfile, imageName, buildArgs);

    // Update progress
    await job.updateProgress(70);

    // Push to registry
    const registryImage = await pushImage(ctx, imageName);

    // Update progress
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

    await appendLog(ctx, '=== Build Completed ===');
    await appendLog(ctx, `Image: ${registryImage}`);

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

      await appendLog(ctx, 'Deployment job queued');
    }

    // Send notification
    await queueNotification({
      type: 'deployment_started',
      deploymentId,
      serviceId,
      message: `Build completed for ${service.name}, deploying...`,
      channels: ['webhook'],
    });

    console.log(`[BuildWorker] Build ${deploymentId} completed successfully`);

  } catch (error) {
    console.error(`[BuildWorker] Build ${deploymentId} failed:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await appendLog(ctx, `=== Build Failed ===`);
    await appendLog(ctx, `Error: ${errorMessage}`);

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
    await cleanup(ctx);
  }
}

// Create and start worker
let worker: Worker<BuildJobData> | null = null;

export function startBuildWorker() {
  if (worker) {
    console.log('[BuildWorker] Worker already running');
    return worker;
  }

  worker = new Worker<BuildJobData>(
    'build',
    processBuild,
    {
      connection: getRedisConnection(),
      concurrency: 2, // Process up to 2 builds concurrently
      limiter: {
        max: 5,
        duration: 60000, // Max 5 builds per minute
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[BuildWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[BuildWorker] Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    console.error('[BuildWorker] Worker error:', err);
  });

  console.log('[BuildWorker] Started');
  return worker;
}

export function stopBuildWorker() {
  if (worker) {
    worker.close();
    worker = null;
    console.log('[BuildWorker] Stopped');
  }
}

export { worker as buildWorker };
