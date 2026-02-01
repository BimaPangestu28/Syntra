import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { organizations, projects, services } from './core';

export const secrets = pgTable('secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  keyVersion: integer('key_version').default(1).notNull(),
  description: text('description'),
  isGlobal: boolean('is_global').default(false),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  lastRotatedAt: timestamp('last_rotated_at', { mode: 'date' }),
  rotationPolicy: jsonb('rotation_policy').$type<{
    enabled: boolean;
    interval_days?: number;
    notify_before_days?: number;
  }>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const secretVersions = pgTable('secret_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  secretId: uuid('secret_id')
    .notNull()
    .references(() => secrets.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  keyVersion: integer('key_version').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const secretAccessLogs = pgTable('secret_access_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  secretId: uuid('secret_id')
    .notNull()
    .references(() => secrets.id, { onDelete: 'cascade' }),
  accessedBy: uuid('accessed_by').references(() => users.id),
  serviceId: uuid('service_id').references(() => services.id),
  accessType: varchar('access_type', { length: 50 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId: uuid('resource_id'),
  resourceName: varchar('resource_name', { length: 255 }),
  changes: jsonb('changes').$type<{
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  requestId: varchar('request_id', { length: 36 }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const rateLimitRules = pgTable('rate_limit_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  endpoint: varchar('endpoint', { length: 255 }),
  method: varchar('method', { length: 10 }),
  requestsPerWindow: integer('requests_per_window').notNull(),
  windowSeconds: integer('window_seconds').notNull(),
  isEnabled: boolean('is_enabled').default(true),
  isGlobal: boolean('is_global').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const rateLimitLogs = pgTable('rate_limit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  endpoint: varchar('endpoint', { length: 255 }).notNull(),
  method: varchar('method', { length: 10 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  wasLimited: boolean('was_limited').default(false),
  requestCount: integer('request_count'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const userNotificationPreferences = pgTable('user_notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 100 }).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
  lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
