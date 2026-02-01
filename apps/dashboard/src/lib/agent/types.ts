import { WebSocket } from 'ws';

// Types for agent communication
export interface AgentHelloPayload {
  agent_id: string;
  server_id: string;
  version: string;
  runtime: 'docker' | 'kubernetes';
  runtime_version: string;
  os: {
    name: string;
    version: string;
    kernel: string;
  };
  arch: 'x86_64' | 'aarch64';
  resources: {
    cpu_cores: number;
    cpu_model: string;
    memory_total_mb: number;
    disk_total_gb: number;
  };
  network: {
    hostname: string;
    public_ip: string | null;
    private_ip: string;
  };
  capabilities: string[];
}

export interface HeartbeatPayload {
  agent_id: string;
  timestamp: string;
  uptime_seconds: number;
  resources: {
    cpu_usage_percent: number;
    memory_used_mb: number;
    memory_available_mb: number;
    disk_used_gb: number;
    disk_available_gb: number;
    network_rx_bytes: number;
    network_tx_bytes: number;
  };
  containers: {
    running: number;
    stopped: number;
    total: number;
  };
  services: ServiceStatus[];
}

export interface ServiceStatus {
  service_id: string;
  container_id: string;
  status: 'running' | 'stopped' | 'restarting' | 'error';
  health: 'healthy' | 'unhealthy' | 'unknown';
  cpu_percent: number;
  memory_mb: number;
  restart_count: number;
  started_at: string;
}

// Rust agent heartbeat format
export interface RustHeartbeatPayload {
  agent_id: string;
  timestamp: string;
  uptime_secs: number;
  container_count: number;
  cpu_usage: number;
  memory_usage: number;
}

export interface WebSocketMessage {
  id: string;
  type: string;
  timestamp: string;
  payload: unknown;
}

export interface ConnectedAgent {
  ws: WebSocket;
  serverId: string;
  orgId: string;
  agentId: string;
  lastHeartbeat: Date;
  serverName: string;
}

export interface ServerTokenInfo {
  serverId: string;
  orgId: string;
  serverName: string;
}

// Deploy command types
export interface DeployCommand {
  service_id: string;
  deployment_id: string;
  image: string;
  tag: string;
  port: number;
  replicas: number;
  env_vars: Record<string, string>;
  resources: {
    cpu_limit?: string;
    memory_limit?: string;
    cpu_request?: string;
    memory_request?: string;
  };
  health_check: {
    path: string;
    interval: number;
    timeout: number;
    retries: number;
  };
  domains: string[];
  project_name: string;
  service_name: string;
}

export interface StopCommand {
  service_id: string;
  container_id?: string;
}

export interface ScaleCommand {
  service_id: string;
  replicas: number;
}

export interface ExecCommand {
  service_id: string;
  command: string[];
  timeout?: number;
}

export interface LogsCommand {
  service_id: string;
  lines?: number;
  follow?: boolean;
  since?: string;
}

export interface RestartCommand {
  service_id: string;
}

export interface RollbackCommand {
  service_id: string;
  target_deployment_id: string;
  image: string;
  tag: string;
}

// Response types
export interface DeployStatusPayload {
  deployment_id: string;
  service_id: string;
  status: 'pulling' | 'starting' | 'running' | 'failed' | 'stopped';
  container_id?: string;
  error?: string;
  progress?: string;
}

export interface ExecResultPayload {
  request_id: string;
  service_id: string;
  exit_code: number;
  stdout: string;
  stderr: string;
}

export interface LogsPayload {
  request_id: string;
  service_id: string;
  logs: Array<{
    timestamp: string;
    stream: 'stdout' | 'stderr';
    message: string;
  }>;
  done: boolean;
}

export interface TelemetryBatchPayload {
  server_id: string;
  batch_id: string;
  traces?: unknown[];
  logs?: unknown[];
  metrics?: unknown[];
  errors?: unknown[];
}
