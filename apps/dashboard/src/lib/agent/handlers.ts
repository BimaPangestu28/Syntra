import { db } from '@/lib/db';
import { servers, deployments, services, alerts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ConnectedAgent, HeartbeatPayload, RustHeartbeatPayload, WebSocketMessage } from './types';
import crypto from 'crypto';
import { queueNotification } from '@/lib/queue';
import { publishEvent } from '@/lib/events/publisher';

type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'running' | 'stopped' | 'failed' | 'cancelled';

const STATUS_MAP: Record<string, DeploymentStatus> = {
  'pulling': 'building',
  'creating': 'building',
  'starting': 'deploying',
  'running': 'running',
  'stopped': 'stopped',
  'failed': 'failed',
  'deploying': 'deploying',
  'created': 'deploying',
  'exited': 'stopped',
};

/**
 * Handle heartbeat message (supports both original and Rust agent formats)
 */
export async function handleHeartbeat(
  agent: ConnectedAgent,
  payload: HeartbeatPayload | RustHeartbeatPayload
): Promise<void> {
  agent.lastHeartbeat = new Date();

  await db.update(servers)
    .set({
      status: 'online',
      lastHeartbeatAt: new Date(),
    })
    .where(eq(servers.id, agent.serverId));

  // Check if this is Rust agent format
  const isRustAgent = 'uptime_secs' in payload;

  if (isRustAgent) {
    const ack = {
      type: 'HeartbeatAck',
      payload: {
        timestamp: new Date().toISOString(),
        server_time: new Date().toISOString(),
      },
    };
    agent.ws.send(JSON.stringify(ack));
  } else {
    const pong: WebSocketMessage = {
      id: crypto.randomUUID(),
      type: 'pong',
      timestamp: new Date().toISOString(),
      payload: {},
    };
    agent.ws.send(JSON.stringify(pong));
  }
}

/**
 * Handle deploy status update
 */
export async function handleDeployStatus(
  agent: ConnectedAgent,
  message: WebSocketMessage
): Promise<void> {
  const payload = message.payload as {
    deployment_id?: string;
    container_id?: string;
    status: string;
    error_message?: string;
  };

  console.log(`[AgentHub] Deploy status from ${agent.serverId}:`, payload);

  if (!payload.deployment_id) return;

  const dbStatus = STATUS_MAP[payload.status] || 'running';

  await db.update(deployments)
    .set({
      status: dbStatus,
      containerId: payload.container_id,
      errorMessage: payload.error_message,
      ...(dbStatus === 'running' ? { deployFinishedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(deployments.id, payload.deployment_id));

  console.log(`[AgentHub] Updated deployment ${payload.deployment_id} status to ${dbStatus}`);

  // Queue notifications and publish events for terminal states
  if (dbStatus === 'running' || dbStatus === 'failed') {
    try {
      const deployment = await db.query.deployments.findFirst({
        where: eq(deployments.id, payload.deployment_id),
        with: { service: { with: { project: true } } },
      });

      if (deployment) {
        const serviceName = deployment.service?.name || 'unknown';
        const orgId = deployment.service?.project?.orgId;

        if (dbStatus === 'running') {
          await queueNotification({
            type: 'deployment_success',
            deploymentId: deployment.id,
            serviceId: deployment.serviceId,
            message: `Deployment ${deployment.id.slice(0, 8)} for ${serviceName} succeeded`,
            channels: ['email', 'slack'],
          });

          if (orgId) {
            await publishEvent(orgId, 'deployment.completed', {
              deployment_id: deployment.id,
              service_id: deployment.serviceId,
              service_name: serviceName,
              trigger_type: deployment.triggerType || 'manual',
              git_commit_sha: deployment.gitCommitSha || undefined,
            });
          }
        } else if (dbStatus === 'failed') {
          await queueNotification({
            type: 'deployment_failed',
            deploymentId: deployment.id,
            serviceId: deployment.serviceId,
            message: `Deployment ${deployment.id.slice(0, 8)} for ${serviceName} failed: ${payload.error_message || 'Unknown error'}`,
            channels: ['email', 'slack'],
          });

          if (orgId) {
            await publishEvent(orgId, 'deployment.failed', {
              deployment_id: deployment.id,
              service_id: deployment.serviceId,
              service_name: serviceName,
              trigger_type: deployment.triggerType || 'manual',
              error_message: payload.error_message,
              git_commit_sha: deployment.gitCommitSha || undefined,
            });
          }
        }
      }
    } catch (notifyError) {
      console.error('[AgentHub] Failed to queue notification for deploy status:', notifyError);
    }
  }
}

/**
 * Handle container status message (from Rust agent)
 */
export async function handleContainerStatus(
  agent: ConnectedAgent,
  message: WebSocketMessage
): Promise<void> {
  const payload = message.payload as {
    container_id: string;
    name: string;
    status: string;
    health?: string;
    ports: Array<{ container_port: number; host_port: number; protocol: string }>;
    timestamp: string;
  };

  console.log(`[AgentHub] Container status from ${agent.serverId}:`, payload.name, payload.status);

  const dbStatus = STATUS_MAP[payload.status] || 'running';

  const recentDeployment = await db.query.deployments.findFirst({
    where: (deployments, { eq, and }) => and(
      eq(deployments.serverId, agent.serverId),
      eq(deployments.status, 'deploying')
    ),
    orderBy: (deployments, { desc }) => [desc(deployments.createdAt)],
  });

  if (recentDeployment) {
    await db.update(deployments)
      .set({
        status: dbStatus,
        containerId: payload.container_id,
        ...(dbStatus === 'running' ? { deployFinishedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, recentDeployment.id));

    console.log(`[AgentHub] Updated deployment ${recentDeployment.id} from container status`);
  }
}

/**
 * Handle task result message (from Rust agent)
 */
export async function handleTaskResult(
  agent: ConnectedAgent,
  message: WebSocketMessage
): Promise<void> {
  const payload = message.payload as {
    task_id: string;
    agent_id: string;
    success: boolean;
    output?: string;
    error?: string;
    duration_ms: number;
    timestamp: string;
  };

  console.log(`[AgentHub] Task result from ${agent.serverId}:`, payload.task_id, payload.success);

  if (payload.success) {
    await db.update(deployments)
      .set({
        status: 'running' as const,
        containerId: payload.output || undefined,
        deployFinishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, payload.task_id));
  } else {
    await db.update(deployments)
      .set({
        status: 'failed' as const,
        errorMessage: payload.error || 'Deployment failed',
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, payload.task_id));
  }

  console.log(`[AgentHub] Updated deployment ${payload.task_id} from task result`);

  // Queue notifications for task results
  try {
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, payload.task_id),
      with: { service: { with: { project: true } } },
    });

    if (deployment) {
      const serviceName = deployment.service?.name || 'unknown';
      const orgId = deployment.service?.project?.orgId;

      if (payload.success) {
        await queueNotification({
          type: 'deployment_success',
          deploymentId: deployment.id,
          serviceId: deployment.serviceId,
          message: `Deployment for ${serviceName} completed successfully`,
          channels: ['email', 'slack'],
        });

        if (orgId) {
          await publishEvent(orgId, 'deployment.completed', {
            deployment_id: deployment.id,
            service_id: deployment.serviceId,
            service_name: serviceName,
            trigger_type: deployment.triggerType || 'manual',
            git_commit_sha: deployment.gitCommitSha || undefined,
            duration_ms: payload.duration_ms,
          });
        }
      } else {
        await queueNotification({
          type: 'deployment_failed',
          deploymentId: deployment.id,
          serviceId: deployment.serviceId,
          message: `Deployment for ${serviceName} failed: ${payload.error || 'Unknown error'}`,
          channels: ['email', 'slack'],
        });

        if (orgId) {
          await publishEvent(orgId, 'deployment.failed', {
            deployment_id: deployment.id,
            service_id: deployment.serviceId,
            service_name: serviceName,
            trigger_type: deployment.triggerType || 'manual',
            error_message: payload.error,
            git_commit_sha: deployment.gitCommitSha || undefined,
          });
        }
      }
    }
  } catch (notifyError) {
    console.error('[AgentHub] Failed to queue notification for task result:', notifyError);
  }
}

/**
 * Handle telemetry batch
 */
export async function handleTelemetryBatch(
  agent: ConnectedAgent,
  message: WebSocketMessage
): Promise<void> {
  const { ingestTelemetryBatch } = await import('@/lib/telemetry/ingestion');

  const payload = message.payload as {
    batch_id?: string;
    metrics?: {
      server?: Record<string, unknown>;
      containers?: Array<Record<string, unknown>>;
    };
    logs?: Array<Record<string, unknown>>;
    events?: Array<Record<string, unknown>>;
  };

  await ingestTelemetryBatch({
    batch_id: payload.batch_id || message.id,
    server_id: agent.serverId,
    agent_id: agent.agentId,
    timestamp: message.timestamp,
    metrics: payload.metrics as any,
    logs: payload.logs as any,
    events: payload.events as any,
  });

  console.log(`[AgentHub] Telemetry batch ingested from ${agent.serverId}`);
}

/**
 * Handle alert from agent
 */
export async function handleAlert(
  agent: ConnectedAgent,
  message: WebSocketMessage
): Promise<void> {
  const payload = message.payload as {
    type?: string;
    severity?: 'info' | 'warning' | 'error' | 'critical';
    title?: string;
    message?: string;
    service_id?: string;
    metadata?: Record<string, unknown>;
  };

  console.log(`[AgentHub] Alert from ${agent.serverId}:`, payload);

  try {
    // Look up the server to get org ID
    const server = await db.query.servers.findFirst({
      where: eq(servers.id, agent.serverId),
      columns: { orgId: true },
    });

    if (!server) return;

    // Create alert record
    const [alert] = await db
      .insert(alerts)
      .values({
        orgId: server.orgId,
        serverId: agent.serverId,
        serviceId: payload.service_id || null,
        type: payload.type || 'agent_alert',
        severity: payload.severity || 'warning',
        status: 'active',
        title: payload.title || 'Agent Alert',
        message: payload.message || 'Alert received from agent',
        metadata: payload.metadata,
      })
      .returning();

    // Queue notification
    await queueNotification({
      type: 'alert',
      serverId: agent.serverId,
      serviceId: payload.service_id || undefined,
      message: `${(payload.severity || 'warning').toUpperCase()}: ${payload.title || 'Agent Alert'} - ${payload.message || ''}`,
      channels: ['email', 'slack'],
    });

    // Publish webhook event
    await publishEvent(server.orgId, 'alert.fired', {
      alert_id: alert.id,
      rule_id: '',
      rule_name: payload.title || 'Agent Alert',
      severity: payload.severity || 'warning',
      metric: payload.type || 'agent_alert',
      metric_value: 0,
      threshold: 0,
      operator: 'eq',
      service_id: payload.service_id,
    });

    console.log(`[AgentHub] Alert created: ${alert.id}`);
  } catch (error) {
    console.error('[AgentHub] Failed to process alert:', error);
  }
}

/**
 * Handle agent disconnect
 */
export async function handleDisconnect(serverId: string): Promise<void> {
  await db.update(servers)
    .set({
      status: 'offline',
      updatedAt: new Date(),
    })
    .where(eq(servers.id, serverId));

  console.log(`[AgentHub] Agent disconnected: ${serverId}`);
}
