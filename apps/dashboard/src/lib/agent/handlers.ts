import { db } from '@/lib/db';
import { servers, deployments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ConnectedAgent, HeartbeatPayload, RustHeartbeatPayload, WebSocketMessage } from './types';
import crypto from 'crypto';

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
  console.log(`[AgentHub] Alert from ${agent.serverId}:`, message.payload);
  // TODO: Process alert, send notifications
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
