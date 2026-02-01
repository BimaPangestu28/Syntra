import { pgEnum } from 'drizzle-orm/pg-core';

export const serverStatusEnum = pgEnum('server_status', [
  'online',
  'offline',
  'maintenance',
  'error',
]);

export const userRoleEnum = pgEnum('user_role', [
  'owner',
  'admin',
  'developer',
  'viewer',
]);

export const serviceTypeEnum = pgEnum('service_type', [
  'web',
  'api',
  'worker',
  'cron',
]);

export const sourceTypeEnum = pgEnum('source_type', [
  'git',
  'docker_image',
  'dockerfile',
]);

export const deploymentStatusEnum = pgEnum('deployment_status', [
  'pending',
  'building',
  'deploying',
  'running',
  'stopped',
  'failed',
  'cancelled',
]);

export const runtimeEnum = pgEnum('runtime', ['docker', 'kubernetes']);

export const archEnum = pgEnum('arch', ['x86_64', 'aarch64']);

export const domainStatusEnum = pgEnum('domain_status', [
  'pending_verification',
  'verified',
  'active',
  'error',
]);

export const sslStatusEnum = pgEnum('ssl_status', [
  'pending',
  'issuing',
  'active',
  'expired',
  'failed',
]);

export const alertSeverityEnum = pgEnum('alert_severity', [
  'info',
  'warning',
  'error',
  'critical',
]);

export const alertStatusEnum = pgEnum('alert_status', [
  'active',
  'acknowledged',
  'resolved',
]);

export const previewStatusEnum = pgEnum('preview_status', [
  'pending',
  'building',
  'deploying',
  'running',
  'stopped',
  'failed',
]);

export const logLevelEnum = pgEnum('log_level', [
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

export const usageTypeEnum = pgEnum('usage_type', [
  'compute_minutes',
  'build_minutes',
  'storage_gb',
  'bandwidth_gb',
  'deployments',
  'previews',
]);

export const billingPlanEnum = pgEnum('billing_plan', [
  'free',
  'hobby',
  'pro',
  'team',
  'enterprise',
]);

export const scalingMetricEnum = pgEnum('scaling_metric', [
  'cpu_percent',
  'memory_percent',
  'request_count',
  'response_time_ms',
  'custom',
]);

export const databaseTypeEnum = pgEnum('database_type', [
  'postgresql',
  'mysql',
  'redis',
  'mongodb',
]);

export const backupTypeEnum = pgEnum('backup_type', [
  'service',
  'database',
  'volume',
  'full',
]);

export const gitProviderEnum = pgEnum('git_provider', [
  'github',
  'gitlab',
  'bitbucket',
]);

export const volumeStatusEnum = pgEnum('volume_status', [
  'pending',
  'provisioning',
  'available',
  'in_use',
  'error',
  'deleting',
]);
