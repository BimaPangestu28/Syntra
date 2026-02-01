import Redis from 'ioredis';
import {
  TelemetryBatch,
  ServerMetrics,
  ContainerMetrics,
  LogEntry,
  TelemetryEvent,
  METRIC_KEYS,
  RETENTION,
} from './types';

// Redis connection
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}

/**
 * Ingest a telemetry batch from an agent
 */
export async function ingestTelemetryBatch(batch: TelemetryBatch): Promise<void> {
  const redis = getRedis();

  const pipeline = redis.pipeline();

  // Process server metrics
  if (batch.metrics?.server) {
    await ingestServerMetrics(pipeline, batch.server_id, batch.metrics.server);
  }

  // Process container metrics
  if (batch.metrics?.containers) {
    for (const containerMetrics of batch.metrics.containers) {
      await ingestContainerMetrics(pipeline, batch.server_id, containerMetrics);
    }
  }

  // Process logs
  if (batch.logs && batch.logs.length > 0) {
    await ingestLogs(pipeline, batch.server_id, batch.logs);
  }

  // Process events
  if (batch.events && batch.events.length > 0) {
    await ingestEvents(pipeline, batch.events);
  }

  // Execute all Redis commands
  await pipeline.exec();

  console.log(`[Telemetry] Ingested batch ${batch.batch_id} from server ${batch.server_id}`);
}

/**
 * Ingest server metrics
 */
async function ingestServerMetrics(
  pipeline: ReturnType<Redis['pipeline']>,
  serverId: string,
  metrics: ServerMetrics
): Promise<void> {
  const key = METRIC_KEYS.serverCurrent(serverId);
  const timestamp = Date.now();

  // Store current metrics
  pipeline.hset(key, {
    cpu_percent: metrics.cpu_percent,
    memory_used_mb: metrics.memory_used_mb,
    memory_total_mb: metrics.memory_total_mb,
    memory_percent: metrics.memory_percent,
    disk_used_gb: metrics.disk_used_gb,
    disk_total_gb: metrics.disk_total_gb,
    disk_percent: metrics.disk_percent,
    load_avg_1m: metrics.load_avg_1m,
    container_count: metrics.container_count,
    uptime_seconds: metrics.uptime_seconds,
    updated_at: timestamp,
  });
  pipeline.expire(key, RETENTION.currentMetrics);

  // Store time series data points
  const tsFields = ['cpu_percent', 'memory_percent', 'disk_percent', 'load_avg_1m'];
  for (const field of tsFields) {
    const tsKey = METRIC_KEYS.serverTimeSeries(serverId, field);
    const value = metrics[field as keyof ServerMetrics];
    if (typeof value === 'number') {
      // Store as sorted set with timestamp as score
      pipeline.zadd(tsKey, timestamp, `${timestamp}:${value}`);
      // Trim old data
      pipeline.zremrangebyscore(tsKey, 0, timestamp - RETENTION.timeSeriesPoints * 1000);
      pipeline.expire(tsKey, RETENTION.timeSeriesPoints);
    }
  }
}

/**
 * Ingest container metrics
 */
async function ingestContainerMetrics(
  pipeline: ReturnType<Redis['pipeline']>,
  serverId: string,
  metrics: ContainerMetrics
): Promise<void> {
  const key = METRIC_KEYS.containerCurrent(metrics.container_id);
  const timestamp = Date.now();

  // Store current metrics
  pipeline.hset(key, {
    server_id: serverId,
    container_name: metrics.container_name,
    service_id: metrics.service_id || '',
    cpu_percent: metrics.cpu_percent,
    memory_used_mb: metrics.memory_used_mb,
    memory_limit_mb: metrics.memory_limit_mb,
    memory_percent: metrics.memory_percent,
    network_rx_bytes: metrics.network_rx_bytes,
    network_tx_bytes: metrics.network_tx_bytes,
    status: metrics.status,
    updated_at: timestamp,
  });
  pipeline.expire(key, RETENTION.currentMetrics);

  // Store time series for CPU and memory
  const tsFields = ['cpu_percent', 'memory_percent'];
  for (const field of tsFields) {
    const tsKey = METRIC_KEYS.containerTimeSeries(metrics.container_id, field);
    const value = metrics[field as keyof ContainerMetrics];
    if (typeof value === 'number') {
      pipeline.zadd(tsKey, timestamp, `${timestamp}:${value}`);
      pipeline.zremrangebyscore(tsKey, 0, timestamp - RETENTION.timeSeriesPoints * 1000);
      pipeline.expire(tsKey, RETENTION.timeSeriesPoints);
    }
  }
}

/**
 * Ingest logs
 */
async function ingestLogs(
  pipeline: ReturnType<Redis['pipeline']>,
  serverId: string,
  logs: LogEntry[]
): Promise<void> {
  const streamKey = METRIC_KEYS.logsStream(serverId);

  for (const log of logs) {
    pipeline.xadd(
      streamKey,
      'MAXLEN',
      '~',
      '10000', // Keep last 10000 entries
      '*',
      'timestamp', log.timestamp,
      'level', log.level,
      'message', log.message,
      'source', log.source,
      'container_id', log.container_id || '',
      'service_id', log.service_id || '',
      'fields', JSON.stringify(log.fields || {}),
    );
  }

  pipeline.expire(streamKey, RETENTION.logs);
}

/**
 * Ingest events
 */
async function ingestEvents(
  pipeline: ReturnType<Redis['pipeline']>,
  events: TelemetryEvent[]
): Promise<void> {
  for (const event of events) {
    const streamKey = METRIC_KEYS.eventsStream(event.server_id);

    pipeline.xadd(
      streamKey,
      'MAXLEN',
      '~',
      '1000', // Keep last 1000 events per server
      '*',
      'timestamp', event.timestamp,
      'type', event.type,
      'severity', event.severity,
      'message', event.message,
      'container_id', event.container_id || '',
      'service_id', event.service_id || '',
      'deployment_id', event.deployment_id || '',
      'metadata', JSON.stringify(event.metadata || {}),
    );

    pipeline.expire(streamKey, RETENTION.events);

    // For critical/error events, log them
    if (event.severity === 'critical' || event.severity === 'error') {
      console.log(`[Telemetry] Critical event: ${event.type} - ${event.message}`);
    }
  }
}

/**
 * Get current server metrics
 */
export async function getServerMetrics(serverId: string): Promise<Record<string, string> | null> {
  const redis = getRedis();
  const key = METRIC_KEYS.serverCurrent(serverId);
  const data = await redis.hgetall(key);
  return Object.keys(data).length > 0 ? data : null;
}

/**
 * Get current container metrics
 */
export async function getContainerMetrics(containerId: string): Promise<Record<string, string> | null> {
  const redis = getRedis();
  const key = METRIC_KEYS.containerCurrent(containerId);
  const data = await redis.hgetall(key);
  return Object.keys(data).length > 0 ? data : null;
}

/**
 * Get time series data for a metric
 */
export async function getMetricTimeSeries(
  resourceType: 'server' | 'container',
  resourceId: string,
  metric: string,
  startTime: number,
  endTime: number
): Promise<Array<{ timestamp: number; value: number }>> {
  const redis = getRedis();
  const key = resourceType === 'server'
    ? METRIC_KEYS.serverTimeSeries(resourceId, metric)
    : METRIC_KEYS.containerTimeSeries(resourceId, metric);

  const data = await redis.zrangebyscore(key, startTime, endTime);

  return data.map(entry => {
    const [ts, val] = entry.split(':');
    return { timestamp: parseInt(ts), value: parseFloat(val) };
  });
}

/**
 * Get recent logs for a server
 */
export async function getServerLogs(
  serverId: string,
  count: number = 100,
  lastId?: string
): Promise<Array<{ id: string; fields: Record<string, string> }>> {
  const redis = getRedis();
  const streamKey = METRIC_KEYS.logsStream(serverId);

  const startId = lastId || '-';
  const results = await redis.xrange(streamKey, startId, '+', 'COUNT', count);

  return results.map(([id, fields]) => ({
    id,
    fields: Object.fromEntries(
      fields.reduce<[string, string][]>((acc, val, idx) => {
        if (idx % 2 === 0) acc.push([val, fields[idx + 1]]);
        return acc;
      }, [])
    ),
  }));
}

/**
 * Get recent events for a server
 */
export async function getServerEvents(
  serverId: string,
  count: number = 50,
  lastId?: string
): Promise<Array<{ id: string; fields: Record<string, string> }>> {
  const redis = getRedis();
  const streamKey = METRIC_KEYS.eventsStream(serverId);

  const startId = lastId || '-';
  const results = await redis.xrange(streamKey, startId, '+', 'COUNT', count);

  return results.map(([id, fields]) => ({
    id,
    fields: Object.fromEntries(
      fields.reduce<[string, string][]>((acc, val, idx) => {
        if (idx % 2 === 0) acc.push([val, fields[idx + 1]]);
        return acc;
      }, [])
    ),
  }));
}

/**
 * Cleanup function
 */
export async function closeTelemetry(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
