// Telemetry data types

export interface MetricPoint {
  timestamp: string;
  value: number;
  labels?: Record<string, string>;
}

export interface ContainerMetrics {
  container_id: string;
  container_name: string;
  service_id?: string;
  timestamp: string;
  cpu_percent: number;
  memory_used_mb: number;
  memory_limit_mb: number;
  memory_percent: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  block_read_bytes: number;
  block_write_bytes: number;
  pids: number;
  status: string;
}

export interface ServerMetrics {
  server_id: string;
  timestamp: string;
  cpu_percent: number;
  cpu_cores: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disk_percent: number;
  network_rx_bytes_per_sec: number;
  network_tx_bytes_per_sec: number;
  load_avg_1m: number;
  load_avg_5m: number;
  load_avg_15m: number;
  uptime_seconds: number;
  container_count: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  source: 'agent' | 'container' | 'system';
  server_id: string;
  container_id?: string;
  service_id?: string;
  fields?: Record<string, unknown>;
}

export interface TelemetryBatch {
  batch_id: string;
  server_id: string;
  agent_id: string;
  timestamp: string;
  metrics?: {
    server?: ServerMetrics;
    containers?: ContainerMetrics[];
  };
  logs?: LogEntry[];
  events?: TelemetryEvent[];
}

export interface TelemetryEvent {
  timestamp: string;
  type: 'container_started' | 'container_stopped' | 'container_died' | 'container_oom' |
        'deployment_started' | 'deployment_completed' | 'deployment_failed' |
        'health_check_failed' | 'health_check_passed' | 'alert';
  server_id: string;
  container_id?: string;
  service_id?: string;
  deployment_id?: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata?: Record<string, unknown>;
}

export interface MetricAggregation {
  metric_name: string;
  resource_type: 'server' | 'container' | 'service';
  resource_id: string;
  period: '1m' | '5m' | '15m' | '1h' | '6h' | '24h';
  start_time: string;
  end_time: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
  p50: number;
  p95: number;
  p99: number;
}

// Redis key patterns for metrics storage
export const METRIC_KEYS = {
  serverCurrent: (serverId: string) => `metrics:server:${serverId}:current`,
  serverTimeSeries: (serverId: string, metric: string) => `metrics:server:${serverId}:ts:${metric}`,
  containerCurrent: (containerId: string) => `metrics:container:${containerId}:current`,
  containerTimeSeries: (containerId: string, metric: string) => `metrics:container:${containerId}:ts:${metric}`,
  logsStream: (serverId: string) => `logs:server:${serverId}:stream`,
  eventsStream: (serverId: string) => `events:server:${serverId}:stream`,
};

// Retention periods
export const RETENTION = {
  currentMetrics: 300, // 5 minutes
  timeSeriesPoints: 3600 * 24, // 24 hours in Redis
  logs: 3600 * 6, // 6 hours in Redis
  events: 3600 * 24 * 7, // 7 days in Redis
};
