import { db } from '@/lib/db';
import { deployments, services } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { agentHub } from '@/lib/agent/hub';
import { alertContainerCrashed, createAlert } from '@/lib/alerts';

// Container restart configuration
export interface RestartPolicy {
  enabled: boolean;
  maxRestarts: number;
  restartDelayMs: number;
  resetTimeMs: number; // Time after which restart count resets
}

const DEFAULT_RESTART_POLICY: RestartPolicy = {
  enabled: true,
  maxRestarts: 3,
  restartDelayMs: 5000,
  resetTimeMs: 300000, // 5 minutes
};

// Track restart attempts
interface RestartTracker {
  containerId: string;
  restartCount: number;
  lastRestartTime: number;
  lastCrashTime: number;
}

const restartTrackers = new Map<string, RestartTracker>();

/**
 * Handle container crash event and potentially trigger restart
 */
export async function handleContainerCrash(
  serverId: string,
  containerId: string,
  containerName: string,
  exitCode: number,
  serviceId?: string
): Promise<{ restarted: boolean; reason?: string }> {
  const now = Date.now();

  // Get or create tracker
  let tracker = restartTrackers.get(containerId);
  if (!tracker) {
    tracker = {
      containerId,
      restartCount: 0,
      lastRestartTime: 0,
      lastCrashTime: now,
    };
    restartTrackers.set(containerId, tracker);
  }

  // Update crash time
  tracker.lastCrashTime = now;

  // Reset count if enough time has passed since last restart
  if (now - tracker.lastRestartTime > DEFAULT_RESTART_POLICY.resetTimeMs) {
    tracker.restartCount = 0;
  }

  // Get service restart policy
  let policy = DEFAULT_RESTART_POLICY;
  if (serviceId) {
    const service = await db.query.services.findFirst({
      where: eq(services.id, serviceId),
    });

    // Services can override restart policy via resources config
    if (service?.resources) {
      const resourceConfig = service.resources as Record<string, any>;
      if (resourceConfig.restartPolicy) {
        policy = { ...DEFAULT_RESTART_POLICY, ...resourceConfig.restartPolicy };
      }
    }
  }

  // Check if restart is allowed
  if (!policy.enabled) {
    console.log(`[ContainerHealth] Restart disabled for container ${containerName}`);
    return { restarted: false, reason: 'Restart policy disabled' };
  }

  if (tracker.restartCount >= policy.maxRestarts) {
    console.log(`[ContainerHealth] Max restarts (${policy.maxRestarts}) exceeded for container ${containerName}`);

    // Create critical alert
    await alertContainerCrashed(serverId, containerId, containerName, exitCode);

    return { restarted: false, reason: `Max restarts (${policy.maxRestarts}) exceeded` };
  }

  // Delay before restart
  await new Promise(resolve => setTimeout(resolve, policy.restartDelayMs));

  // Attempt restart
  const restarted = await restartContainer(serverId, containerId, containerName);

  if (restarted) {
    tracker.restartCount++;
    tracker.lastRestartTime = Date.now();
    console.log(`[ContainerHealth] Restarted container ${containerName} (attempt ${tracker.restartCount}/${policy.maxRestarts})`);
    return { restarted: true };
  } else {
    return { restarted: false, reason: 'Restart command failed' };
  }
}

/**
 * Restart a container on a specific server
 */
export async function restartContainer(
  serverId: string,
  containerId: string,
  containerName: string
): Promise<boolean> {
  if (!agentHub.isAgentConnected(serverId)) {
    console.error(`[ContainerHealth] Cannot restart container - server ${serverId} is offline`);
    return false;
  }

  const sent = agentHub.sendToAgent(serverId, {
    id: `restart-${Date.now()}`,
    type: 'container_restart',
    timestamp: new Date().toISOString(),
    payload: {
      container_id: containerId,
      container_name: containerName,
    },
  });

  return sent;
}

/**
 * Stop a container on a specific server
 */
export async function stopContainer(
  serverId: string,
  containerId: string,
  timeoutSeconds: number = 30
): Promise<boolean> {
  if (!agentHub.isAgentConnected(serverId)) {
    console.error(`[ContainerHealth] Cannot stop container - server ${serverId} is offline`);
    return false;
  }

  const sent = agentHub.sendToAgent(serverId, {
    id: `stop-${Date.now()}`,
    type: 'container_stop',
    timestamp: new Date().toISOString(),
    payload: {
      container_id: containerId,
      timeout_seconds: timeoutSeconds,
    },
  });

  return sent;
}

/**
 * Handle container health check failure
 */
export async function handleHealthCheckFailure(
  serverId: string,
  containerId: string,
  containerName: string,
  serviceId?: string
): Promise<void> {
  console.log(`[ContainerHealth] Health check failed for container ${containerName}`);

  // Create warning alert
  if (serviceId) {
    const service = await db.query.services.findFirst({
      where: eq(services.id, serviceId),
      with: {
        project: true,
      },
    });

    if (service) {
      await createAlert({
        orgId: service.project.orgId,
        type: 'service_unhealthy',
        severity: 'warning',
        title: `Service ${service.name} is unhealthy`,
        message: `Health check failed for container ${containerName} (${containerId.slice(0, 12)}).`,
        serverId,
        serviceId,
        dedupeKey: `unhealthy_${containerId}`,
      });
    }
  }

  // Restart the container
  const restarted = await restartContainer(serverId, containerId, containerName);

  if (!restarted) {
    console.error(`[ContainerHealth] Failed to restart unhealthy container ${containerName}`);
  }
}

/**
 * Process container event from agent
 */
export async function processContainerEvent(
  serverId: string,
  event: {
    type: 'die' | 'start' | 'stop' | 'kill' | 'oom';
    containerId: string;
    containerName: string;
    exitCode?: number;
    serviceId?: string;
  }
): Promise<void> {
  console.log(`[ContainerHealth] Container event: ${event.type} for ${event.containerName}`);

  switch (event.type) {
    case 'die':
      if (event.exitCode !== 0) {
        await handleContainerCrash(
          serverId,
          event.containerId,
          event.containerName,
          event.exitCode || 1,
          event.serviceId
        );
      }
      break;

    case 'oom':
      // OOM killed - create critical alert
      if (event.serviceId) {
        const service = await db.query.services.findFirst({
          where: eq(services.id, event.serviceId),
          with: {
            project: true,
          },
        });

        if (service) {
          await createAlert({
            orgId: service.project.orgId,
            type: 'container_oom_killed',
            severity: 'critical',
            title: `Container ${event.containerName} was OOM killed`,
            message: `Container ${event.containerName} was killed due to out-of-memory condition. Consider increasing memory limits.`,
            serverId,
            serviceId: event.serviceId,
            metadata: { containerId: event.containerId },
          });
        }
      }

      // Attempt restart
      await handleContainerCrash(
        serverId,
        event.containerId,
        event.containerName,
        137, // OOM exit code
        event.serviceId
      );
      break;

    case 'start':
      // Clear restart tracker on successful start
      restartTrackers.delete(event.containerId);
      break;

    case 'stop':
    case 'kill':
      // Intentional stop - clear tracker
      restartTrackers.delete(event.containerId);
      break;
  }
}

/**
 * Clear restart tracker for a container
 */
export function clearRestartTracker(containerId: string): void {
  restartTrackers.delete(containerId);
}

/**
 * Get restart tracker for a container
 */
export function getRestartTracker(containerId: string): RestartTracker | undefined {
  return restartTrackers.get(containerId);
}
