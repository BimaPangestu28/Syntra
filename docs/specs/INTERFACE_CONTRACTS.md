# Interface Contracts Specification

**Version:** 1.0
**Status:** Draft - Harus difinalisasi sebelum development dimulai

---

## 1. WebSocket Protocol (Agent <-> Control Plane)

### 1.1 Connection Establishment

```
Agent                                    Control Plane
  │                                            │
  │──── WSS CONNECT ──────────────────────────▶│
  │     wss://api.syntra.dev/agent/ws          │
  │     Headers:                               │
  │       Authorization: Bearer <agent_token>  │
  │       X-Agent-Version: 0.1.0               │
  │                                            │
  │◀─── 101 Switching Protocols ──────────────│
  │                                            │
  │──── agent_hello ──────────────────────────▶│
  │                                            │
  │◀─── hello_ack ────────────────────────────│
  │                                            │
  │◀───────── heartbeat loop ─────────────────│
  │                                            │
```

### 1.2 Message Format

Semua message menggunakan JSON dengan struktur:

```typescript
interface WebSocketMessage {
  id: string;           // UUID untuk request tracking
  type: MessageType;    // Tipe message
  timestamp: string;    // ISO 8601 timestamp
  payload: unknown;     // Payload sesuai type
}

type MessageType =
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
```

### 1.3 Agent -> Control Plane Messages

#### agent_hello

Dikirim segera setelah WebSocket connection established.

```typescript
interface AgentHelloPayload {
  agent_id: string;           // Format: agt_<nanoid>
  server_id: string;          // Format: srv_<nanoid>
  version: string;            // Semantic version: "0.1.0"
  runtime: 'docker' | 'kubernetes';
  runtime_version: string;    // Docker version atau K8s version
  os: {
    name: string;             // "ubuntu", "debian", "centos"
    version: string;          // "22.04", "12", "9"
    kernel: string;           // "5.15.0-generic"
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
  capabilities: string[];     // ["docker", "traefik", "otlp"]
}
```

#### heartbeat

Dikirim setiap 30 detik.

```typescript
interface HeartbeatPayload {
  agent_id: string;
  timestamp: string;
  uptime_seconds: number;
  resources: {
    cpu_usage_percent: number;      // 0-100
    memory_used_mb: number;
    memory_available_mb: number;
    disk_used_gb: number;
    disk_available_gb: number;
    network_rx_bytes: number;       // Since last heartbeat
    network_tx_bytes: number;
  };
  containers: {
    running: number;
    stopped: number;
    total: number;
  };
  services: ServiceStatus[];
}

interface ServiceStatus {
  service_id: string;
  container_id: string;
  status: 'running' | 'stopped' | 'restarting' | 'error';
  health: 'healthy' | 'unhealthy' | 'unknown';
  cpu_percent: number;
  memory_mb: number;
  restart_count: number;
  started_at: string;
}
```

#### command_response

Response untuk command dari Control Plane.

```typescript
interface CommandResponsePayload {
  request_id: string;         // ID dari command yang di-respond
  success: boolean;
  error?: {
    code: string;             // Error code: "CONTAINER_NOT_FOUND", "PULL_FAILED", etc.
    message: string;
    details?: unknown;
  };
  data?: unknown;             // Response data sesuai command type
}
```

#### deploy_status

Update status deployment secara real-time.

```typescript
interface DeployStatusPayload {
  deployment_id: string;
  service_id: string;
  status: DeploymentStatus;
  phase: DeploymentPhase;
  progress_percent: number;   // 0-100
  message: string;
  started_at: string;
  finished_at?: string;
  logs?: string[];            // Recent log lines
  container_id?: string;      // Set when container created
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

type DeploymentStatus =
  | 'pending'
  | 'pulling'
  | 'creating'
  | 'starting'
  | 'health_checking'
  | 'running'
  | 'failed'
  | 'rolled_back';

type DeploymentPhase =
  | 'pull_image'
  | 'stop_old'
  | 'create_container'
  | 'start_container'
  | 'configure_network'
  | 'health_check'
  | 'cleanup';
```

#### telemetry_batch

Batch telemetry data (compressed dengan zstd).

```typescript
interface TelemetryBatchPayload {
  batch_id: string;
  agent_id: string;
  compression: 'zstd' | 'none';
  // Jika compression = 'zstd', data di-encode base64 setelah compress
  data: string | TelemetryData;
}

interface TelemetryData {
  errors: ErrorEvent[];
  traces: TraceSpan[];
  logs: LogEntry[];
  metrics: MetricPoint[];
  health_checks: HealthCheckResult[];
}

interface ErrorEvent {
  id: string;
  service_id: string;
  deployment_id: string;
  timestamp: string;
  type: string;               // Exception type: "TypeError", "ValueError"
  message: string;
  stack_trace: StackFrame[];
  breadcrumbs: Breadcrumb[];
  context: {
    environment: string;
    release: string;
    user?: { id: string; email?: string; };
    tags: Record<string, string>;
    extra: Record<string, unknown>;
  };
  fingerprint: string[];      // For grouping
}

interface StackFrame {
  filename: string;
  function: string;
  lineno: number;
  colno?: number;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  in_app: boolean;
}

interface Breadcrumb {
  timestamp: string;
  type: 'http' | 'navigation' | 'ui' | 'console' | 'error' | 'query';
  category: string;
  message?: string;
  data?: Record<string, unknown>;
  level: 'debug' | 'info' | 'warning' | 'error';
}

interface TraceSpan {
  trace_id: string;           // 32 hex chars
  span_id: string;            // 16 hex chars
  parent_span_id?: string;
  service_id: string;
  deployment_id: string;
  operation_name: string;
  span_kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer';
  start_time_ns: number;      // Unix nanoseconds
  duration_ns: number;
  status: {
    code: 'unset' | 'ok' | 'error';
    message?: string;
  };
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
}

interface SpanEvent {
  name: string;
  timestamp_ns: number;
  attributes: Record<string, string | number | boolean>;
}

interface LogEntry {
  timestamp: string;
  service_id: string;
  deployment_id: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  attributes: Record<string, unknown>;
  trace_id?: string;
  span_id?: string;
  source: 'stdout' | 'stderr' | 'sdk';
}

interface MetricPoint {
  timestamp: string;
  service_id: string;
  name: string;
  type: 'gauge' | 'counter' | 'histogram';
  value: number;
  labels: Record<string, string>;
  // For histogram
  histogram_buckets?: { le: number; count: number; }[];
}

interface HealthCheckResult {
  service_id: string;
  timestamp: string;
  is_healthy: boolean;
  status_code?: number;
  response_time_ms: number;
  error?: string;
}
```

#### alert

Alert untuk kondisi kritis.

```typescript
interface AlertPayload {
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
```

### 1.4 Control Plane -> Agent Messages

#### hello_ack

Response untuk agent_hello.

```typescript
interface HelloAckPayload {
  server_id: string;
  accepted: boolean;
  server_name: string;
  org_id: string;
  config: {
    heartbeat_interval_seconds: number;   // Default: 30
    telemetry_batch_interval_seconds: number;  // Default: 5
    telemetry_buffer_max_mb: number;      // Default: 50
    log_level: 'debug' | 'info' | 'warn' | 'error';
  };
  pending_deployments: PendingDeployment[];  // Deployments queued while agent offline
}
```

#### deploy

Command untuk deploy service.

```typescript
interface DeployPayload {
  request_id: string;
  deployment_id: string;
  service_id: string;
  service_name: string;
  project_name: string;
  image: {
    registry: string;         // "registry.syntra.dev"
    repository: string;       // "org-slug/project-slug/service-name"
    tag: string;              // Commit SHA atau "latest"
    digest?: string;          // Optional SHA256 digest for verification
  };
  registry_auth: {
    username: string;
    password: string;         // Short-lived token
  };
  config: {
    port: number;
    replicas: number;
    cpu_limit?: string;       // "0.5", "1", "2"
    memory_limit?: string;    // "256m", "512m", "1g"
    env_vars: Record<string, string>;  // Already decrypted
    labels: Record<string, string>;
    volumes?: VolumeMount[];
    health_check?: HealthCheckConfig;
  };
  networking: {
    domains: string[];
    internal_hostname: string;  // "service-name.project.internal"
    expose_port: boolean;
  };
  strategy: 'rolling' | 'instant' | 'blue_green';
  rollback_on_failure: boolean;
  timeout_seconds: number;
}

interface VolumeMount {
  name: string;
  host_path?: string;
  container_path: string;
  read_only: boolean;
}

interface HealthCheckConfig {
  type: 'http' | 'tcp' | 'exec';
  path?: string;              // For HTTP
  port?: number;
  command?: string[];         // For exec
  interval_seconds: number;
  timeout_seconds: number;
  retries: number;
  start_period_seconds: number;
}
```

#### stop

Stop running service.

```typescript
interface StopPayload {
  request_id: string;
  service_id: string;
  timeout_seconds: number;    // Graceful shutdown timeout
  remove_container: boolean;
}
```

#### scale

Scale service replicas.

```typescript
interface ScalePayload {
  request_id: string;
  service_id: string;
  replicas: number;
  strategy: 'immediate' | 'rolling';
}
```

#### restart

Restart service.

```typescript
interface RestartPayload {
  request_id: string;
  service_id: string;
  timeout_seconds: number;
}
```

#### exec

Execute command in container.

```typescript
interface ExecPayload {
  request_id: string;
  service_id: string;
  command: string[];
  working_dir?: string;
  env?: Record<string, string>;
  timeout_seconds: number;
  interactive: boolean;       // For terminal sessions
}

// Response data
interface ExecResponseData {
  exit_code: number;
  stdout: string;
  stderr: string;
}
```

#### logs_subscribe / logs_unsubscribe

Subscribe to log stream.

```typescript
interface LogsSubscribePayload {
  request_id: string;
  service_id: string;
  follow: boolean;
  tail: number;               // Number of lines from end
  since?: string;             // ISO timestamp
  until?: string;
}
```

---

## 2. REST API Contracts

### 2.1 Authentication

```typescript
// Headers
Authorization: Bearer <api_token>
// atau
Cookie: next-auth.session-token=<session>

// API Token format: syn_<type>_<random>
// Types: usr (user), agt (agent), prj (project-scoped)
```

### 2.2 Response Format

```typescript
// Success response
interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    cursor?: string;
  };
}

// Error response
interface ApiError {
  success: false;
  error: {
    code: string;           // "NOT_FOUND", "VALIDATION_ERROR", etc.
    message: string;
    details?: unknown;
    request_id: string;
  };
}

// HTTP Status Codes
// 200 - Success
// 201 - Created
// 204 - No Content (delete)
// 400 - Bad Request (validation)
// 401 - Unauthorized
// 403 - Forbidden (no permission)
// 404 - Not Found
// 409 - Conflict (duplicate)
// 422 - Unprocessable Entity
// 429 - Rate Limited
// 500 - Internal Server Error
```

### 2.3 Core Endpoints

#### Servers

```yaml
# List servers
GET /api/v1/servers
Query:
  - page: number (default: 1)
  - per_page: number (default: 20, max: 100)
  - status: online | offline | all
Response: Server[]

# Get server details
GET /api/v1/servers/:serverId
Response: Server

# Register new server (get install command)
POST /api/v1/servers
Body:
  name: string
  tags?: string[]
Response:
  server_id: string
  install_command: string
  token: string (one-time)

# Update server
PATCH /api/v1/servers/:serverId
Body:
  name?: string
  tags?: string[]
Response: Server

# Delete server
DELETE /api/v1/servers/:serverId
Response: 204

# Get server metrics
GET /api/v1/servers/:serverId/metrics
Query:
  - from: ISO timestamp
  - to: ISO timestamp
  - interval: 1m | 5m | 1h | 1d
Response: MetricSeries[]
```

#### Projects

```yaml
# List projects
GET /api/v1/projects
Response: Project[]

# Create project
POST /api/v1/projects
Body:
  name: string
  description?: string
  git_repo_url?: string
  git_branch?: string
Response: Project

# Get project
GET /api/v1/projects/:projectId
Response: Project (with services)

# Update project
PATCH /api/v1/projects/:projectId
Body: Partial<Project>
Response: Project

# Delete project
DELETE /api/v1/projects/:projectId
Response: 204
```

#### Services

```yaml
# List services in project
GET /api/v1/projects/:projectId/services
Response: Service[]

# Create service
POST /api/v1/projects/:projectId/services
Body:
  name: string
  server_id: string
  source_type: dockerfile | nixpacks | image | docker_compose
  source_config: SourceConfig
  port: number
  replicas?: number
  env_vars?: Record<string, string>
  domains?: string[]
  health_check?: HealthCheckConfig
Response: Service

# Get service
GET /api/v1/services/:serviceId
Response: Service (with recent deployments)

# Update service
PATCH /api/v1/services/:serviceId
Body: Partial<Service>
Response: Service

# Delete service
DELETE /api/v1/services/:serviceId
Response: 204

# Trigger deployment
POST /api/v1/services/:serviceId/deploy
Body:
  git_ref?: string (commit SHA atau branch)
  image_tag?: string (jika source_type = image)
Response: Deployment

# Rollback
POST /api/v1/services/:serviceId/rollback
Body:
  deployment_id: string
Response: Deployment

# Restart
POST /api/v1/services/:serviceId/restart
Response: { success: true }

# Scale
POST /api/v1/services/:serviceId/scale
Body:
  replicas: number
Response: Service

# Get logs
GET /api/v1/services/:serviceId/logs
Query:
  - from: ISO timestamp
  - to: ISO timestamp
  - level: debug | info | warn | error
  - search: string
  - limit: number (default: 100)
  - cursor: string
Response: LogEntry[]
```

#### Deployments

```yaml
# List deployments
GET /api/v1/services/:serviceId/deployments
Query:
  - status: queued | building | deploying | running | failed
  - limit: number
Response: Deployment[]

# Get deployment detail
GET /api/v1/deployments/:deploymentId
Response: Deployment (with build logs)

# Cancel deployment
POST /api/v1/deployments/:deploymentId/cancel
Response: Deployment
```

#### Environment Variables

```yaml
# List env vars
GET /api/v1/services/:serviceId/env
Response: { key: string; value: string; is_secret: boolean }[]

# Set env vars
PUT /api/v1/services/:serviceId/env
Body:
  variables: { key: string; value: string; is_secret?: boolean }[]
Response: { success: true }

# Delete env var
DELETE /api/v1/services/:serviceId/env/:key
Response: 204
```

#### Observability

```yaml
# List error groups (issues)
GET /api/v1/projects/:projectId/issues
Query:
  - status: unresolved | resolved | ignored
  - service_id: string
  - from: ISO timestamp
  - to: ISO timestamp
Response: ErrorGroup[]

# Get issue detail
GET /api/v1/issues/:issueId
Response: ErrorGroup (with AI analysis)

# Update issue
PATCH /api/v1/issues/:issueId
Body:
  status?: unresolved | resolved | ignored
  assigned_to?: string (user_id)
Response: ErrorGroup

# Get issue events
GET /api/v1/issues/:issueId/events
Query:
  - limit: number
  - cursor: string
Response: ErrorEvent[]

# Query traces
GET /api/v1/services/:serviceId/traces
Query:
  - from: ISO timestamp
  - to: ISO timestamp
  - min_duration_ms: number
  - status: ok | error
  - operation: string
  - limit: number
Response: TraceSummary[]

# Get full trace
GET /api/v1/traces/:traceId
Response: Trace (with all spans)

# Query metrics
GET /api/v1/services/:serviceId/metrics
Query:
  - from: ISO timestamp
  - to: ISO timestamp
  - metrics: string[] (comma-separated)
  - interval: 1m | 5m | 1h
Response: MetricSeries[]
```

#### AI

```yaml
# Trigger AI error analysis
POST /api/v1/ai/analyze-error
Body:
  issue_id: string
  force_refresh?: boolean
Response: AIAnalysis

# Generate Dockerfile
POST /api/v1/ai/generate-dockerfile
Body:
  repo_url: string
  branch?: string
  framework_hint?: string
Response: { dockerfile: string; explanation: string }

# AI Chat (Server-Sent Events)
POST /api/v1/ai/chat
Body:
  message: string
  context: {
    service_id?: string
    project_id?: string
    issue_id?: string
  }
Response: SSE stream
  event: token | done | error
  data: { content: string } | { message_id: string } | { error: string }

# Get AI recommendations
GET /api/v1/ai/recommendations/:serviceId
Response: AIRecommendation[]
```

---

## 3. Database Schema

### 3.1 PostgreSQL Schema

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE user_plan AS ENUM ('free', 'pro', 'team', 'enterprise');
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'developer', 'viewer');
CREATE TYPE server_status AS ENUM ('online', 'offline', 'updating', 'error');
CREATE TYPE server_runtime AS ENUM ('docker', 'kubernetes');
CREATE TYPE service_type AS ENUM ('app', 'database', 'worker', 'cron');
CREATE TYPE source_type AS ENUM ('dockerfile', 'nixpacks', 'image', 'docker_compose');
CREATE TYPE deployment_status AS ENUM ('queued', 'building', 'pushing', 'deploying', 'running', 'failed', 'rolled_back', 'cancelled');
CREATE TYPE trigger_type AS ENUM ('manual', 'git_push', 'workflow', 'rollback', 'api', 'schedule');
CREATE TYPE issue_status AS ENUM ('unresolved', 'resolved', 'ignored', 'regressed');
CREATE TYPE issue_severity AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE alert_type AS ENUM ('error_rate', 'latency', 'downtime', 'anomaly', 'custom');
CREATE TYPE alert_status AS ENUM ('firing', 'resolved', 'acknowledged');

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    plan user_plan DEFAULT 'free',
    stripe_customer_id VARCHAR(255),
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan user_plan DEFAULT 'free',
    stripe_subscription_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization Members
CREATE TABLE org_members (
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role org_role NOT NULL DEFAULT 'developer',
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    PRIMARY KEY (org_id, user_id)
);

-- Servers
CREATE TABLE servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    hostname VARCHAR(255),
    public_ip INET,
    private_ip INET,
    runtime server_runtime DEFAULT 'docker',
    runtime_version VARCHAR(50),
    status server_status DEFAULT 'offline',
    agent_version VARCHAR(20),
    agent_token_hash VARCHAR(64) NOT NULL, -- SHA-256 hash
    os_name VARCHAR(50),
    os_version VARCHAR(50),
    arch VARCHAR(20),
    cpu_cores INTEGER,
    memory_mb INTEGER,
    disk_gb INTEGER,
    last_heartbeat_at TIMESTAMPTZ,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_servers_org ON servers(org_id);
CREATE INDEX idx_servers_status ON servers(status);

-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    git_repo_url TEXT,
    git_branch VARCHAR(255) DEFAULT 'main',
    git_provider VARCHAR(50), -- github, gitlab, bitbucket
    git_installation_id VARCHAR(100), -- GitHub App installation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, slug)
);

CREATE INDEX idx_projects_org ON projects(org_id);

-- Services
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type service_type DEFAULT 'app',
    source_type source_type NOT NULL,
    dockerfile_path VARCHAR(500) DEFAULT './Dockerfile',
    build_context VARCHAR(500) DEFAULT '.',
    image_name VARCHAR(500),
    image_tag VARCHAR(255),
    port INTEGER,
    replicas INTEGER DEFAULT 1,
    cpu_limit VARCHAR(20),
    memory_limit VARCHAR(20),
    env_vars_encrypted BYTEA, -- AES-256-GCM encrypted JSON
    domains JSONB DEFAULT '[]',
    health_check_path VARCHAR(255),
    health_check_interval INTEGER DEFAULT 30,
    health_check_timeout INTEGER DEFAULT 5,
    health_check_retries INTEGER DEFAULT 3,
    auto_deploy BOOLEAN DEFAULT true,
    current_deployment_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_services_project ON services(project_id);
CREATE INDEX idx_services_server ON services(server_id);

-- Deployments
CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    status deployment_status DEFAULT 'queued',
    git_commit_sha VARCHAR(40),
    git_commit_message TEXT,
    git_branch VARCHAR(255),
    image_digest VARCHAR(100),
    build_duration_ms INTEGER,
    deploy_duration_ms INTEGER,
    build_logs TEXT,
    triggered_by UUID REFERENCES users(id),
    trigger_type trigger_type DEFAULT 'manual',
    error_message TEXT,
    rollback_from_id UUID REFERENCES deployments(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX idx_deployments_service ON deployments(service_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_created ON deployments(created_at DESC);

-- Error Groups (Issues)
CREATE TABLE error_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    fingerprint VARCHAR(64) NOT NULL, -- SHA-256 of normalized error
    title TEXT NOT NULL,
    exception_type VARCHAR(255),
    status issue_status DEFAULT 'unresolved',
    severity issue_severity DEFAULT 'medium',
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    event_count BIGINT DEFAULT 1,
    user_count INTEGER DEFAULT 0,
    assigned_to UUID REFERENCES users(id),
    ai_analysis JSONB,
    ai_analyzed_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(service_id, fingerprint)
);

CREATE INDEX idx_error_groups_service ON error_groups(service_id);
CREATE INDEX idx_error_groups_status ON error_groups(status);
CREATE INDEX idx_error_groups_last_seen ON error_groups(last_seen_at DESC);

-- Error Events
CREATE TABLE error_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_group_id UUID NOT NULL REFERENCES error_groups(id) ON DELETE CASCADE,
    deployment_id UUID REFERENCES deployments(id),
    stack_trace JSONB NOT NULL,
    breadcrumbs JSONB,
    context JSONB,
    environment VARCHAR(50),
    release VARCHAR(100),
    user_id_hash VARCHAR(64), -- Hashed user ID for counting
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_error_events_group ON error_events(error_group_id);
CREATE INDEX idx_error_events_timestamp ON error_events(timestamp DESC);

-- Health Checks
CREATE TABLE health_checks (
    id BIGSERIAL PRIMARY KEY,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    status_code INTEGER,
    response_time_ms INTEGER NOT NULL,
    is_healthy BOOLEAN NOT NULL,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_checks_service ON health_checks(service_id, checked_at DESC);

-- Alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type alert_type NOT NULL,
    condition JSONB NOT NULL,
    channels JSONB NOT NULL, -- [{type: "slack", webhook_url: "..."}, ...]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alert Incidents
CREATE TABLE alert_incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    status alert_status DEFAULT 'firing',
    message TEXT NOT NULL,
    details JSONB,
    ai_summary TEXT,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_alert_incidents_alert ON alert_incidents(alert_id);
CREATE INDEX idx_alert_incidents_status ON alert_incidents(status);

-- API Tokens
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL, -- SHA-256 hash
    token_prefix VARCHAR(20) NOT NULL, -- First 8 chars for identification
    scopes TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash);

-- Audit Log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org ON audit_logs(org_id, created_at DESC);

-- Workflows
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    definition JSONB NOT NULL, -- DAG structure
    trigger_type trigger_type DEFAULT 'manual',
    cron_expression VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow Runs
CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'running',
    triggered_by UUID REFERENCES users(id),
    trigger_type trigger_type,
    step_results JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON servers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 3.2 ClickHouse Schema

```sql
-- Traces table
CREATE TABLE traces (
    trace_id String,
    span_id String,
    parent_span_id String,
    service_id UUID,
    deployment_id UUID,
    operation_name String,
    span_kind Enum8('internal' = 0, 'server' = 1, 'client' = 2, 'producer' = 3, 'consumer' = 4),
    start_time DateTime64(9, 'UTC'),
    duration_ns UInt64,
    status_code Enum8('unset' = 0, 'ok' = 1, 'error' = 2),
    status_message String,
    attributes Map(String, String),
    events String, -- JSON array of events

    -- Materialized columns for common queries
    http_method String MATERIALIZED attributes['http.method'],
    http_status_code UInt16 MATERIALIZED toUInt16OrZero(attributes['http.status_code']),
    http_route String MATERIALIZED attributes['http.route']
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_id, start_time, trace_id, span_id)
TTL start_time + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Logs table
CREATE TABLE logs (
    timestamp DateTime64(9, 'UTC'),
    service_id UUID,
    deployment_id UUID,
    level Enum8('trace' = 0, 'debug' = 1, 'info' = 2, 'warn' = 3, 'error' = 4, 'fatal' = 5),
    message String,
    attributes Map(String, String),
    trace_id Nullable(String),
    span_id Nullable(String),
    source Enum8('stdout' = 0, 'stderr' = 1, 'sdk' = 2)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, timestamp)
TTL timestamp + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Metrics table (raw)
CREATE TABLE metrics_raw (
    timestamp DateTime,
    service_id UUID,
    server_id UUID,
    metric_name String,
    metric_type Enum8('gauge' = 0, 'counter' = 1, 'histogram' = 2),
    value Float64,
    labels Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, metric_name, timestamp)
TTL timestamp + INTERVAL 7 DAY
SETTINGS index_granularity = 8192;

-- Metrics aggregated (1 minute)
CREATE TABLE metrics_1m (
    timestamp DateTime,
    service_id UUID,
    server_id UUID,
    metric_name String,
    metric_type Enum8('gauge' = 0, 'counter' = 1, 'histogram' = 2),
    min_value Float64,
    max_value Float64,
    avg_value Float64,
    sum_value Float64,
    count UInt64,
    labels Map(String, String)
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, metric_name, timestamp, labels)
TTL timestamp + INTERVAL 30 DAY;

-- Materialized view for aggregation
CREATE MATERIALIZED VIEW metrics_1m_mv TO metrics_1m AS
SELECT
    toStartOfMinute(timestamp) AS timestamp,
    service_id,
    server_id,
    metric_name,
    metric_type,
    min(value) AS min_value,
    max(value) AS max_value,
    avg(value) AS avg_value,
    sum(value) AS sum_value,
    count() AS count,
    labels
FROM metrics_raw
GROUP BY
    toStartOfMinute(timestamp),
    service_id,
    server_id,
    metric_name,
    metric_type,
    labels;
```

---

## 4. Versioning & Compatibility

### 4.1 API Versioning

```
/api/v1/...  - Stable API (current)
/api/v2/...  - Future breaking changes

Header: X-API-Version: 2024-01-31 (date-based for minor changes)
```

### 4.2 WebSocket Protocol Versioning

```typescript
// In agent_hello
{
  "protocol_version": "1.0",  // Major.Minor
  "min_supported": "1.0"
}

// Control plane responds with accepted version
// or error if incompatible
```

### 4.3 Agent <-> Control Plane Compatibility

| Agent Version | Min CP Version | Max CP Version |
|---------------|----------------|----------------|
| 0.1.x         | 0.1.0          | 0.2.x          |
| 0.2.x         | 0.1.0          | 0.3.x          |

---

## 5. Contract Testing

### 5.1 Tools

- **Pact** - Contract testing untuk API
- **JSON Schema** - Validasi message format
- **OpenAPI** - API specification

### 5.2 Test Strategy

```yaml
# Setiap workstream WAJIB:
1. Memiliki contract tests untuk interface mereka
2. Tests harus pass sebelum merge ke main
3. Breaking changes harus melalui RFC process

# Contract test locations:
/contracts/
  /websocket/
    agent-hello.schema.json
    heartbeat.schema.json
    deploy.schema.json
    ...
  /api/
    openapi.yaml
  /telemetry/
    otlp-extensions.schema.json
```
