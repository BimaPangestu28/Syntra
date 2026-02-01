// REST API Contract Types

// ===========================================
// API Response Types
// ===========================================

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    cursor?: string;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id: string;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ===========================================
// Entity Types
// ===========================================

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  plan: UserPlan;
  created_at: string;
  updated_at: string;
}

export type UserPlan = 'free' | 'pro' | 'team' | 'enterprise';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: UserPlan;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  user?: User;
  invited_at: string;
  accepted_at: string | null;
}

export type OrgRole = 'owner' | 'admin' | 'developer' | 'viewer';

export interface Server {
  id: string;
  org_id: string;
  name: string;
  hostname: string | null;
  public_ip: string | null;
  private_ip: string | null;
  runtime: ServerRuntime;
  runtime_version: string | null;
  status: ServerStatus;
  agent_version: string | null;
  os_name: string | null;
  os_version: string | null;
  arch: string | null;
  cpu_cores: number | null;
  memory_mb: number | null;
  disk_gb: number | null;
  last_heartbeat_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type ServerRuntime = 'docker' | 'kubernetes';
export type ServerStatus = 'online' | 'offline' | 'updating' | 'error';

export interface Project {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  git_repo_url: string | null;
  git_branch: string;
  git_provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  project_id: string;
  server_id: string;
  name: string;
  type: ServiceType;
  source_type: SourceType;
  dockerfile_path: string;
  build_context: string;
  image_name: string | null;
  image_tag: string | null;
  port: number | null;
  replicas: number;
  cpu_limit: string | null;
  memory_limit: string | null;
  domains: string[];
  health_check_path: string | null;
  health_check_interval: number;
  auto_deploy: boolean;
  current_deployment_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ServiceType = 'app' | 'database' | 'worker' | 'cron';
export type SourceType = 'dockerfile' | 'nixpacks' | 'image' | 'docker_compose';

export interface Deployment {
  id: string;
  service_id: string;
  status: DeploymentApiStatus;
  git_commit_sha: string | null;
  git_commit_message: string | null;
  git_branch: string | null;
  image_digest: string | null;
  build_duration_ms: number | null;
  deploy_duration_ms: number | null;
  build_logs: string | null;
  triggered_by: string | null;
  trigger_type: TriggerType;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export type DeploymentApiStatus =
  | 'queued'
  | 'building'
  | 'pushing'
  | 'deploying'
  | 'running'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';

export type TriggerType = 'manual' | 'git_push' | 'workflow' | 'rollback' | 'api' | 'schedule';

export interface ErrorGroup {
  id: string;
  service_id: string;
  fingerprint: string;
  title: string;
  exception_type: string | null;
  status: IssueStatus;
  severity: IssueSeverity;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  user_count: number;
  assigned_to: string | null;
  ai_analysis: AIAnalysis | null;
  ai_analyzed_at: string | null;
  created_at: string;
}

export type IssueStatus = 'unresolved' | 'resolved' | 'ignored' | 'regressed';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AIAnalysis {
  root_cause: string;
  why_now: string;
  suggested_fix: string;
  severity: IssueSeverity;
  affected_scope: string;
  confidence: number;
}

export interface ErrorEvent {
  id: string;
  error_group_id: string;
  deployment_id: string | null;
  stack_trace: StackFrame[];
  breadcrumbs: Breadcrumb[];
  context: Record<string, unknown>;
  environment: string | null;
  release: string | null;
  timestamp: string;
}

export interface StackFrame {
  filename: string;
  function: string;
  lineno: number;
  colno?: number;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  in_app: boolean;
}

export interface Breadcrumb {
  timestamp: string;
  type: 'http' | 'navigation' | 'ui' | 'console' | 'error' | 'query';
  category: string;
  message?: string;
  data?: Record<string, unknown>;
  level: 'debug' | 'info' | 'warning' | 'error';
}

// ===========================================
// API Request/Response Types
// ===========================================

// Servers
export interface CreateServerRequest {
  name: string;
  tags?: string[];
}

export interface CreateServerResponse {
  server_id: string;
  install_command: string;
  token: string;
}

export interface UpdateServerRequest {
  name?: string;
  tags?: string[];
}

// Projects
export interface CreateProjectRequest {
  name: string;
  description?: string;
  git_repo_url?: string;
  git_branch?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  git_repo_url?: string;
  git_branch?: string;
}

// Services
export interface CreateServiceRequest {
  name: string;
  server_id: string;
  source_type: SourceType;
  dockerfile_path?: string;
  build_context?: string;
  image_name?: string;
  image_tag?: string;
  port?: number;
  replicas?: number;
  cpu_limit?: string;
  memory_limit?: string;
  env_vars?: Record<string, string>;
  domains?: string[];
  health_check_path?: string;
  health_check_interval?: number;
  auto_deploy?: boolean;
}

export interface UpdateServiceRequest {
  name?: string;
  port?: number;
  replicas?: number;
  cpu_limit?: string;
  memory_limit?: string;
  domains?: string[];
  health_check_path?: string;
  health_check_interval?: number;
  auto_deploy?: boolean;
}

// Deployments
export interface TriggerDeployRequest {
  git_ref?: string;
  image_tag?: string;
}

export interface RollbackRequest {
  deployment_id: string;
}

// Environment Variables
export interface SetEnvVarsRequest {
  variables: Array<{
    key: string;
    value: string;
    is_secret?: boolean;
  }>;
}

// AI
export interface AnalyzeErrorRequest {
  issue_id: string;
  force_refresh?: boolean;
}

export interface GenerateDockerfileRequest {
  repo_url: string;
  branch?: string;
  framework_hint?: string;
}

export interface GenerateDockerfileResponse {
  dockerfile: string;
  explanation: string;
}

export interface AIChatRequest {
  message: string;
  context: {
    service_id?: string;
    project_id?: string;
    issue_id?: string;
  };
}
