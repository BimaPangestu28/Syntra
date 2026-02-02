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
import { alertSeverityEnum, alertStatusEnum, logLevelEnum } from './enums';
import { users } from './auth';
import { organizations, services, servers } from './core';
import { deployments } from './deployments';

export const errorGroups = pgTable('error_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
  type: varchar('type', { length: 255 }).notNull(),
  message: text('message').notNull(),
  status: varchar('status', { length: 50 }).default('unresolved').notNull(),
  firstSeenAt: timestamp('first_seen_at', { mode: 'date' }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { mode: 'date' }).defaultNow().notNull(),
  eventCount: integer('event_count').default(1).notNull(),
  userCount: integer('user_count').default(0),
  assignedTo: uuid('assigned_to').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { mode: 'date' }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_error_groups_service_id').on(table.serviceId),
  index('idx_error_groups_fingerprint').on(table.fingerprint),
  index('idx_error_groups_status').on(table.status),
]);

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
  deploymentId: uuid('deployment_id').references(() => deployments.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 100 }).notNull(),
  severity: alertSeverityEnum('severity').default('warning').notNull(),
  status: alertStatusEnum('status').default('active').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  acknowledgedAt: timestamp('acknowledged_at', { mode: 'date' }),
  acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { mode: 'date' }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_alerts_org_id').on(table.orgId),
  index('idx_alerts_status').on(table.status),
]);

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
  metric: varchar('metric', { length: 100 }).notNull(),
  operator: varchar('operator', { length: 10 }).notNull(),
  threshold: integer('threshold').notNull(),
  windowMinutes: integer('window_minutes').default(5).notNull(),
  severity: alertSeverityEnum('severity').default('warning').notNull(),
  channelIds: jsonb('channel_ids').$type<string[]>().default([]),
  cooldownMinutes: integer('cooldown_minutes').default(30).notNull(),
  lastTriggeredAt: timestamp('last_triggered_at', { mode: 'date' }),
  isEnabled: boolean('is_enabled').default(true).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const notificationChannels = pgTable('notification_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  config: jsonb('config').$type<{
    webhookUrl?: string;
    email?: string;
    slackChannel?: string;
    pagerdutyKey?: string;
  }>().notNull(),
  isEnabled: boolean('is_enabled').default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const containerLogs = pgTable('container_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
  deploymentId: uuid('deployment_id').references(() => deployments.id, { onDelete: 'set null' }),
  containerId: varchar('container_id', { length: 64 }),
  containerName: varchar('container_name', { length: 255 }),
  timestamp: timestamp('timestamp', { mode: 'date' }).notNull(),
  level: logLevelEnum('level').default('info'),
  message: text('message').notNull(),
  source: varchar('source', { length: 50 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_container_logs_org_id').on(table.orgId),
  index('idx_container_logs_service_time').on(table.serviceId, table.timestamp),
  index('idx_container_logs_level').on(table.level),
]);

export const uptimeMonitors = pgTable('uptime_monitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  url: text('url').notNull(),
  method: varchar('method', { length: 10 }).default('GET'),
  headers: jsonb('headers').$type<Record<string, string>>(),
  body: text('body'),
  expectedStatusCode: integer('expected_status_code').default(200),
  expectedResponseContains: text('expected_response_contains'),
  intervalSeconds: integer('interval_seconds').default(60),
  timeoutSeconds: integer('timeout_seconds').default(30),
  isEnabled: boolean('is_enabled').default(true),
  lastCheckAt: timestamp('last_check_at', { mode: 'date' }),
  lastStatus: varchar('last_status', { length: 20 }),
  lastResponseTime: integer('last_response_time'),
  consecutiveFailures: integer('consecutive_failures').default(0),
  alertAfterFailures: integer('alert_after_failures').default(3),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const uptimeChecks = pgTable('uptime_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  monitorId: uuid('monitor_id')
    .notNull()
    .references(() => uptimeMonitors.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(),
  statusCode: integer('status_code'),
  responseTime: integer('response_time'),
  errorMessage: text('error_message'),
  checkedFrom: varchar('checked_from', { length: 100 }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const activityFeed = pgTable('activity_feed', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message'),
  resourceType: varchar('resource_type', { length: 50 }),
  resourceId: uuid('resource_id'),
  resourceName: varchar('resource_name', { length: 255 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_activity_feed_org_id').on(table.orgId),
  index('idx_activity_feed_type').on(table.type),
]);
