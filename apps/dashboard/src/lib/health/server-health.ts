import { db } from '@/lib/db';
import { servers } from '@/lib/db/schema';
import { eq, lt, and, ne } from 'drizzle-orm';
import { agentHub } from '@/lib/agent/hub';
import { alertServerOffline, alertServerOnline, createAlert } from '@/lib/alerts';

// Configuration
const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT_MS = 60000; // Consider offline after 60 seconds without heartbeat
const MAX_OFFLINE_ALERTS_PER_HOUR = 10; // Prevent alert storms

// Track offline alerts to prevent spam
const offlineAlertTracker = new Map<string, number>();

interface HealthCheckResult {
  serverId: string;
  serverName: string;
  status: 'healthy' | 'unhealthy' | 'offline';
  lastHeartbeat: Date | null;
  isConnected: boolean;
  error?: string;
}

/**
 * Check health status of a single server
 */
export async function checkServerHealth(serverId: string): Promise<HealthCheckResult> {
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
  });

  if (!server) {
    return {
      serverId,
      serverName: 'Unknown',
      status: 'offline',
      lastHeartbeat: null,
      isConnected: false,
      error: 'Server not found',
    };
  }

  const isConnected = agentHub.isAgentConnected(serverId);
  const now = new Date();
  const lastHeartbeat = server.lastHeartbeatAt;

  // Check heartbeat freshness
  let status: 'healthy' | 'unhealthy' | 'offline' = 'healthy';

  if (!isConnected) {
    status = 'offline';
  } else if (!lastHeartbeat) {
    status = 'unhealthy';
  } else {
    const heartbeatAge = now.getTime() - lastHeartbeat.getTime();
    if (heartbeatAge > HEARTBEAT_TIMEOUT_MS) {
      status = 'unhealthy';
    }
  }

  return {
    serverId,
    serverName: server.name,
    status,
    lastHeartbeat,
    isConnected,
  };
}

/**
 * Check health of all servers and update statuses
 */
export async function checkAllServersHealth(): Promise<HealthCheckResult[]> {
  const allServers = await db.query.servers.findMany({
    where: ne(servers.status, 'maintenance'), // Skip servers in maintenance
  });

  const results: HealthCheckResult[] = [];

  for (const server of allServers) {
    const isConnected = agentHub.isAgentConnected(server.id);
    const now = new Date();
    const lastHeartbeat = server.lastHeartbeatAt;

    let status: 'healthy' | 'unhealthy' | 'offline' = 'healthy';
    let newDbStatus: 'online' | 'offline' | 'error' | 'maintenance' = server.status;

    if (!isConnected) {
      status = 'offline';
      newDbStatus = 'offline';
    } else if (!lastHeartbeat) {
      status = 'unhealthy';
      newDbStatus = 'error';
    } else {
      const heartbeatAge = now.getTime() - lastHeartbeat.getTime();
      if (heartbeatAge > HEARTBEAT_TIMEOUT_MS) {
        status = 'unhealthy';
        newDbStatus = 'error';
      } else {
        newDbStatus = 'online';
      }
    }

    // Update server status if changed
    if (newDbStatus !== server.status) {
      await db
        .update(servers)
        .set({
          status: newDbStatus,
          updatedAt: new Date(),
        })
        .where(eq(servers.id, server.id));

      console.log(`[HealthCheck] Server ${server.name} status changed: ${server.status} -> ${newDbStatus}`);

      // Create alerts for status changes
      if (newDbStatus === 'offline' && server.status === 'online') {
        // Check rate limit
        const alertCount = offlineAlertTracker.get(server.id) || 0;
        if (alertCount < MAX_OFFLINE_ALERTS_PER_HOUR) {
          await alertServerOffline(server.id);
          offlineAlertTracker.set(server.id, alertCount + 1);
        }
      } else if (newDbStatus === 'online' && (server.status === 'offline' || server.status === 'error')) {
        await alertServerOnline(server.id);
        offlineAlertTracker.delete(server.id);
      }
    }

    results.push({
      serverId: server.id,
      serverName: server.name,
      status,
      lastHeartbeat,
      isConnected,
    });
  }

  return results;
}

/**
 * Find servers that haven't sent heartbeat recently
 */
export async function findStaleServers(thresholdMs: number = HEARTBEAT_TIMEOUT_MS): Promise<typeof servers.$inferSelect[]> {
  const threshold = new Date(Date.now() - thresholdMs);

  return db.query.servers.findMany({
    where: and(
      eq(servers.status, 'online'),
      lt(servers.lastHeartbeatAt, threshold)
    ),
  });
}

/**
 * Ping a server agent to check if it's responsive
 */
export async function pingServer(serverId: string): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();

  try {
    const isConnected = agentHub.isAgentConnected(serverId);

    if (!isConnected) {
      return { success: false, error: 'Agent not connected' };
    }

    // Send a ping message to the agent
    const sent = agentHub.sendToAgent(serverId, {
      id: `ping-${Date.now()}`,
      type: 'ping',
      timestamp: new Date().toISOString(),
      payload: {},
    });

    if (!sent) {
      return { success: false, error: 'Failed to send ping message' };
    }

    const latencyMs = Date.now() - start;
    return { success: true, latencyMs };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Health check interval handle
let healthCheckInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start the health check background process
 */
export function startHealthChecker(): void {
  if (isRunning) {
    console.log('[HealthCheck] Health checker already running');
    return;
  }

  console.log('[HealthCheck] Starting health checker');
  isRunning = true;

  // Run immediately on start
  checkAllServersHealth().catch(err => {
    console.error('[HealthCheck] Initial check failed:', err);
  });

  // Schedule periodic checks
  healthCheckInterval = setInterval(async () => {
    try {
      const results = await checkAllServersHealth();
      const unhealthyCount = results.filter(r => r.status !== 'healthy').length;

      if (unhealthyCount > 0) {
        console.log(`[HealthCheck] ${unhealthyCount}/${results.length} servers unhealthy`);
      }
    } catch (error) {
      console.error('[HealthCheck] Check failed:', error);
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // Reset alert tracker every hour
  setInterval(() => {
    offlineAlertTracker.clear();
  }, 3600000);
}

/**
 * Stop the health check background process
 */
export function stopHealthChecker(): void {
  if (!isRunning) {
    return;
  }

  console.log('[HealthCheck] Stopping health checker');

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  isRunning = false;
}

/**
 * Check if health checker is running
 */
export function isHealthCheckerRunning(): boolean {
  return isRunning;
}
