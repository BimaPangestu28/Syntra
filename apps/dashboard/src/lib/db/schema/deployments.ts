import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { deploymentStatusEnum, domainStatusEnum, sslStatusEnum, previewStatusEnum } from './enums';
import { users } from './auth';
import { services, servers } from './core';

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').references(() => servers.id),
  status: deploymentStatusEnum('status').default('pending').notNull(),
  gitCommitSha: varchar('git_commit_sha', { length: 40 }),
  gitCommitMessage: text('git_commit_message'),
  gitCommitAuthor: varchar('git_commit_author', { length: 255 }),
  gitBranch: varchar('git_branch', { length: 255 }),
  dockerImageTag: varchar('docker_image_tag', { length: 255 }),
  containerId: varchar('container_id', { length: 64 }),
  buildLogs: text('build_logs'),
  deployLogs: text('deploy_logs'),
  errorMessage: text('error_message'),
  buildStartedAt: timestamp('build_started_at', { mode: 'date' }),
  buildFinishedAt: timestamp('build_finished_at', { mode: 'date' }),
  deployStartedAt: timestamp('deploy_started_at', { mode: 'date' }),
  deployFinishedAt: timestamp('deploy_finished_at', { mode: 'date' }),
  triggeredBy: uuid('triggered_by').references(() => users.id),
  triggerType: varchar('trigger_type', { length: 50 }),
  rollbackFromId: uuid('rollback_from_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_deployments_service_id').on(table.serviceId),
  index('idx_deployments_status').on(table.status),
  index('idx_deployments_service_created').on(table.serviceId, table.createdAt),
]);

export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  isPrimary: boolean('is_primary').default(false),
  status: domainStatusEnum('status').default('pending_verification').notNull(),
  verificationToken: varchar('verification_token', { length: 64 }),
  verificationMethod: varchar('verification_method', { length: 50 }).default('dns_txt'),
  verifiedAt: timestamp('verified_at', { mode: 'date' }),
  sslEnabled: boolean('ssl_enabled').default(true),
  sslStatus: sslStatusEnum('ssl_status').default('pending'),
  sslCertificate: text('ssl_certificate'),
  sslPrivateKey: text('ssl_private_key'),
  sslChain: text('ssl_chain'),
  sslExpiresAt: timestamp('ssl_expires_at', { mode: 'date' }),
  sslIssuedAt: timestamp('ssl_issued_at', { mode: 'date' }),
  sslAutoRenew: boolean('ssl_auto_renew').default(true),
  lastCheckedAt: timestamp('last_checked_at', { mode: 'date' }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_domains_service_id').on(table.serviceId),
]);

export const previewDeployments = pgTable('preview_deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').references(() => servers.id),
  prNumber: integer('pr_number').notNull(),
  prTitle: varchar('pr_title', { length: 500 }),
  prAuthor: varchar('pr_author', { length: 255 }),
  prBranch: varchar('pr_branch', { length: 255 }).notNull(),
  baseBranch: varchar('base_branch', { length: 255 }).notNull(),
  gitCommitSha: varchar('git_commit_sha', { length: 40 }),
  status: previewStatusEnum('status').default('pending').notNull(),
  previewUrl: varchar('preview_url', { length: 500 }),
  previewSubdomain: varchar('preview_subdomain', { length: 255 }),
  containerId: varchar('container_id', { length: 64 }),
  dockerImageTag: varchar('docker_image_tag', { length: 255 }),
  port: integer('port'),
  buildLogs: text('build_logs'),
  deployLogs: text('deploy_logs'),
  errorMessage: text('error_message'),
  buildStartedAt: timestamp('build_started_at', { mode: 'date' }),
  buildFinishedAt: timestamp('build_finished_at', { mode: 'date' }),
  deployStartedAt: timestamp('deploy_started_at', { mode: 'date' }),
  deployFinishedAt: timestamp('deploy_finished_at', { mode: 'date' }),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const proxyConfigs = pgTable('proxy_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  isEnabled: boolean('is_enabled').default(true),
  priority: integer('priority').default(0),
  pathPattern: varchar('path_pattern', { length: 500 }).default('/'),
  pathMatchType: varchar('path_match_type', { length: 20 }).default('prefix'),
  upstreamPort: integer('upstream_port'),
  upstreamPath: varchar('upstream_path', { length: 500 }),
  stripPathPrefix: boolean('strip_path_prefix').default(false),
  requestHeaders: jsonb('request_headers').$type<Array<{
    action: 'set' | 'add' | 'remove';
    name: string;
    value?: string;
  }>>().default([]),
  responseHeaders: jsonb('response_headers').$type<Array<{
    action: 'set' | 'add' | 'remove';
    name: string;
    value?: string;
  }>>().default([]),
  connectTimeout: integer('connect_timeout').default(60),
  readTimeout: integer('read_timeout').default(60),
  sendTimeout: integer('send_timeout').default(60),
  rateLimitEnabled: boolean('rate_limit_enabled').default(false),
  rateLimitRequests: integer('rate_limit_requests').default(100),
  rateLimitWindow: integer('rate_limit_window').default(60),
  corsEnabled: boolean('cors_enabled').default(false),
  corsAllowOrigins: jsonb('cors_allow_origins').$type<string[]>().default(['*']),
  corsAllowMethods: jsonb('cors_allow_methods').$type<string[]>().default(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
  corsAllowHeaders: jsonb('cors_allow_headers').$type<string[]>().default(['*']),
  corsExposeHeaders: jsonb('cors_expose_headers').$type<string[]>().default([]),
  corsMaxAge: integer('cors_max_age').default(86400),
  corsAllowCredentials: boolean('cors_allow_credentials').default(false),
  basicAuthEnabled: boolean('basic_auth_enabled').default(false),
  basicAuthUsername: varchar('basic_auth_username', { length: 255 }),
  basicAuthPasswordHash: varchar('basic_auth_password_hash', { length: 255 }),
  ipWhitelist: jsonb('ip_whitelist').$type<string[]>(),
  ipBlacklist: jsonb('ip_blacklist').$type<string[]>(),
  websocketEnabled: boolean('websocket_enabled').default(false),
  maxBodySize: varchar('max_body_size', { length: 20 }).default('10m'),
  bufferingEnabled: boolean('buffering_enabled').default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});
