// Agent <-> Control Plane Protocol Types

// ===========================================
// Base Message Types
// ===========================================

export interface WebSocketMessage {
  id: string;
  type: MessageType;
  timestamp: string;
  payload: unknown;
}

export type MessageType =
  // Agent -> Control Plane
  | 'agent_hello'
  | 'heartbeat'
  | 'command_response'
  | 'deploy_status'
  | 'telemetry_batch'
  | 'alert'
  | 'log_stream'
  // Control Plane -> Agent
  | 'hello_ack'
  | 'deploy'
  | 'stop'
  | 'scale'
  | 'restart'
  | 'exec'
  | 'logs_subscribe'
  | 'logs_unsubscribe'
  | 'update_agent'
  | 'configure_health_check'
  | 'ping'
  | 'pong';

// ===========================================
// Agent -> Control Plane Messages
// ===========================================

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

export interface CommandResponsePayload {
  request_id: string;
  success: boolean;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  data?: unknown;
}

export interface DeployStatusPayload {
  deployment_id: string;
  service_id: string;
  status: DeploymentStatus;
  phase: DeploymentPhase;
  progress_percent: number;
  message: string;
  started_at: string;
  finished_at?: string;
  logs?: string[];
  container_id?: string;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

export type DeploymentStatus =
  | 'pending'
  | 'pulling'
  | 'creating'
  | 'starting'
  | 'health_checking'
  | 'running'
  | 'failed'
  | 'rolled_back';

export type DeploymentPhase =
  | 'pull_image'
  | 'stop_old'
  | 'create_container'
  | 'start_container'
  | 'configure_network'
  | 'health_check'
  | 'cleanup';

export interface AlertPayload {
  alert_id: string;
  service_id?: string;
  server_id: string;
  type: 'health_check_failed' | 'resource_critical' | 'container_crash' | 'deployment_failed';
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ===========================================
// Control Plane -> Agent Messages
// ===========================================

export interface HelloAckPayload {
  server_id: string;
  accepted: boolean;
  server_name: string;
  org_id: string;
  config: {
    heartbeat_interval_seconds: number;
    telemetry_batch_interval_seconds: number;
    telemetry_buffer_max_mb: number;
    log_level: 'debug' | 'info' | 'warn' | 'error';
  };
  pending_deployments: PendingDeployment[];
}

export interface PendingDeployment {
  deployment_id: string;
  service_id: string;
  queued_at: string;
}

export interface DeployCommandPayload {
  request_id: string;
  deployment_id: string;
  service_id: string;
  service_name: string;
  project_name: string;
  image: {
    registry: string;
    repository: string;
    tag: string;
    digest?: string;
  };
  registry_auth: {
    username: string;
    password: string;
  };
  config: {
    port: number;
    replicas: number;
    cpu_limit?: string;
    memory_limit?: string;
    env_vars: Record<string, string>;
    labels: Record<string, string>;
    volumes?: VolumeMount[];
    health_check?: HealthCheckConfig;
  };
  networking: {
    domains: string[];
    internal_hostname: string;
    expose_port: boolean;
  };
  strategy: 'rolling' | 'instant' | 'blue_green';
  rollback_on_failure: boolean;
  timeout_seconds: number;
}

export interface VolumeMount {
  name: string;
  host_path?: string;
  container_path: string;
  read_only: boolean;
}

export interface HealthCheckConfig {
  type: 'http' | 'tcp' | 'exec';
  path?: string;
  port?: number;
  command?: string[];
  interval_seconds: number;
  timeout_seconds: number;
  retries: number;
  start_period_seconds: number;
}

export interface StopCommandPayload {
  request_id: string;
  service_id: string;
  timeout_seconds: number;
  remove_container: boolean;
}

export interface ScaleCommandPayload {
  request_id: string;
  service_id: string;
  replicas: number;
  strategy: 'immediate' | 'rolling';
}

export interface RestartCommandPayload {
  request_id: string;
  service_id: string;
  timeout_seconds: number;
}

export interface ExecCommandPayload {
  request_id: string;
  service_id: string;
  command: string[];
  working_dir?: string;
  env?: Record<string, string>;
  timeout_seconds: number;
  interactive: boolean;
}

export interface LogsSubscribePayload {
  request_id: string;
  service_id: string;
  follow: boolean;
  tail: number;
  since?: string;
  until?: string;
}

// ===========================================
// Typed Message Helpers
// ===========================================

export type AgentMessage =
  | { type: 'agent_hello'; payload: AgentHelloPayload }
  | { type: 'heartbeat'; payload: HeartbeatPayload }
  | { type: 'command_response'; payload: CommandResponsePayload }
  | { type: 'deploy_status'; payload: DeployStatusPayload }
  | { type: 'alert'; payload: AlertPayload };

export type ControlPlaneMessage =
  | { type: 'hello_ack'; payload: HelloAckPayload }
  | { type: 'deploy'; payload: DeployCommandPayload }
  | { type: 'stop'; payload: StopCommandPayload }
  | { type: 'scale'; payload: ScaleCommandPayload }
  | { type: 'restart'; payload: RestartCommandPayload }
  | { type: 'exec'; payload: ExecCommandPayload }
  | { type: 'logs_subscribe'; payload: LogsSubscribePayload }
  | { type: 'ping'; payload: Record<string, never> }
  | { type: 'pong'; payload: Record<string, never> };
