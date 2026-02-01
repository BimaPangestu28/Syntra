import { db } from '@/lib/db';
import { alerts, notificationChannels, servers, services, deployments, organizations } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { queueNotification } from '@/lib/queue';

// Alert types
export type AlertType =
  | 'server_offline'
  | 'server_high_cpu'
  | 'server_high_memory'
  | 'server_high_disk'
  | 'deployment_failed'
  | 'deployment_timeout'
  | 'service_unhealthy'
  | 'ssl_expiring'
  | 'container_crashed'
  | 'container_oom_killed'
  | 'custom';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface CreateAlertOptions {
  orgId: string;
  type: AlertType | string;
  severity: AlertSeverity;
  title: string;
  message: string;
  serverId?: string;
  serviceId?: string;
  deploymentId?: string;
  metadata?: Record<string, unknown>;
  autoResolve?: boolean;
  dedupeKey?: string; // Key to deduplicate similar alerts
}

// Create an alert and optionally send notifications
export async function createAlert(options: CreateAlertOptions): Promise<string> {
  const {
    orgId,
    type,
    severity,
    title,
    message,
    serverId,
    serviceId,
    deploymentId,
    metadata,
    autoResolve = false,
    dedupeKey,
  } = options;

  // Check for duplicate active alerts if dedupeKey provided
  if (dedupeKey) {
    const existingAlert = await db.query.alerts.findFirst({
      where: and(
        eq(alerts.orgId, orgId),
        eq(alerts.type, type),
        eq(alerts.status, 'active')
      ),
    });

    if (existingAlert) {
      // Update the existing alert instead of creating a new one
      await db
        .update(alerts)
        .set({
          message,
          metadata: { ...existingAlert.metadata as Record<string, unknown>, ...metadata, duplicateCount: ((existingAlert.metadata as any)?.duplicateCount || 1) + 1 },
          updatedAt: new Date(),
        })
        .where(eq(alerts.id, existingAlert.id));

      return existingAlert.id;
    }
  }

  // Create the alert
  const [alert] = await db
    .insert(alerts)
    .values({
      orgId,
      type,
      severity,
      status: 'active',
      title,
      message,
      serverId,
      serviceId,
      deploymentId,
      metadata,
    })
    .returning();

  // Get notification channels for this org
  const channels = await db.query.notificationChannels.findMany({
    where: and(
      eq(notificationChannels.orgId, orgId),
      eq(notificationChannels.isEnabled, true)
    ),
  });

  // Queue notifications based on severity
  const notificationChannelTypes: ('slack' | 'email' | 'webhook')[] = [];

  // Map channel types to notification types
  for (const channel of channels) {
    if (channel.type === 'slack' || channel.type === 'discord') {
      notificationChannelTypes.push('slack');
    } else if (channel.type === 'webhook') {
      notificationChannelTypes.push('webhook');
    } else if (channel.type === 'email') {
      notificationChannelTypes.push('email');
    }
  }

  // Only send notifications for warning, error, critical
  if (severity !== 'info' && notificationChannelTypes.length > 0) {
    await queueNotification({
      type: 'alert',
      deploymentId,
      serviceId,
      serverId,
      message: `[${severity.toUpperCase()}] ${title}: ${message}`,
      channels: [...new Set(notificationChannelTypes)],
    });
  }

  console.log(`[Alerts] Created alert ${alert.id}: ${type} - ${title}`);

  return alert.id;
}

// Auto-resolve an alert by type and resource
export async function resolveAlertByType(
  type: AlertType | string,
  options: { serverId?: string; serviceId?: string; deploymentId?: string }
): Promise<void> {
  const conditions = [eq(alerts.type, type), eq(alerts.status, 'active')];

  if (options.serverId) {
    conditions.push(eq(alerts.serverId, options.serverId));
  }
  if (options.serviceId) {
    conditions.push(eq(alerts.serviceId, options.serviceId));
  }
  if (options.deploymentId) {
    conditions.push(eq(alerts.deploymentId, options.deploymentId));
  }

  await db
    .update(alerts)
    .set({
      status: 'resolved',
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(...conditions));
}

// Pre-defined alert creators for common scenarios

export async function alertServerOffline(serverId: string): Promise<string> {
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
    with: {
      organization: true,
    },
  });

  if (!server) {
    throw new Error(`Server ${serverId} not found`);
  }

  return createAlert({
    orgId: server.orgId,
    type: 'server_offline',
    severity: 'critical',
    title: `Server ${server.name} is offline`,
    message: `Server ${server.name} (${server.hostname || server.publicIp}) has stopped responding. Last heartbeat was received at ${server.lastHeartbeatAt?.toISOString() || 'unknown'}.`,
    serverId,
    dedupeKey: `server_offline_${serverId}`,
  });
}

export async function alertServerOnline(serverId: string): Promise<void> {
  await resolveAlertByType('server_offline', { serverId });
}

export async function alertHighCpu(serverId: string, cpuPercent: number): Promise<string> {
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
  });

  if (!server) {
    throw new Error(`Server ${serverId} not found`);
  }

  return createAlert({
    orgId: server.orgId,
    type: 'server_high_cpu',
    severity: cpuPercent > 95 ? 'critical' : 'warning',
    title: `High CPU usage on ${server.name}`,
    message: `CPU usage is at ${cpuPercent.toFixed(1)}% on server ${server.name}.`,
    serverId,
    metadata: { cpuPercent },
    dedupeKey: `server_high_cpu_${serverId}`,
  });
}

export async function alertHighMemory(serverId: string, memoryPercent: number): Promise<string> {
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
  });

  if (!server) {
    throw new Error(`Server ${serverId} not found`);
  }

  return createAlert({
    orgId: server.orgId,
    type: 'server_high_memory',
    severity: memoryPercent > 95 ? 'critical' : 'warning',
    title: `High memory usage on ${server.name}`,
    message: `Memory usage is at ${memoryPercent.toFixed(1)}% on server ${server.name}.`,
    serverId,
    metadata: { memoryPercent },
    dedupeKey: `server_high_memory_${serverId}`,
  });
}

export async function alertDeploymentFailed(deploymentId: string, errorMessage: string): Promise<string> {
  const deployment = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
    with: {
      service: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!deployment) {
    throw new Error(`Deployment ${deploymentId} not found`);
  }

  return createAlert({
    orgId: deployment.service.project.orgId,
    type: 'deployment_failed',
    severity: 'error',
    title: `Deployment failed for ${deployment.service.name}`,
    message: `Deployment ${deploymentId.slice(0, 8)} failed: ${errorMessage}`,
    deploymentId,
    serviceId: deployment.serviceId,
    serverId: deployment.serverId || undefined,
    metadata: { errorMessage },
  });
}

export async function alertSslExpiring(domainId: string, domainName: string, daysUntilExpiry: number): Promise<string> {
  // Get org from domain's service
  const domain = await db.query.domains.findFirst({
    where: eq(domains.id, domainId),
    with: {
      service: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!domain) {
    throw new Error(`Domain ${domainId} not found`);
  }

  return createAlert({
    orgId: domain.service.project.orgId,
    type: 'ssl_expiring',
    severity: daysUntilExpiry <= 7 ? 'critical' : 'warning',
    title: `SSL certificate expiring for ${domainName}`,
    message: `The SSL certificate for ${domainName} will expire in ${daysUntilExpiry} days.`,
    serviceId: domain.serviceId,
    metadata: { domainId, daysUntilExpiry },
    dedupeKey: `ssl_expiring_${domainId}`,
  });
}

export async function alertContainerCrashed(
  serverId: string,
  containerId: string,
  containerName: string,
  exitCode: number
): Promise<string> {
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
  });

  if (!server) {
    throw new Error(`Server ${serverId} not found`);
  }

  return createAlert({
    orgId: server.orgId,
    type: 'container_crashed',
    severity: 'error',
    title: `Container ${containerName} crashed`,
    message: `Container ${containerName} (${containerId.slice(0, 12)}) exited with code ${exitCode} on server ${server.name}.`,
    serverId,
    metadata: { containerId, containerName, exitCode },
  });
}

// Import domains table for SSL alert function
import { domains } from '@/lib/db/schema';
