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
import { databaseTypeEnum, backupTypeEnum, gitProviderEnum, volumeStatusEnum } from './enums';
import { users } from './auth';
import { organizations, projects, services, servers } from './core';

export const managedDatabases = pgTable('managed_databases', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: databaseTypeEnum('type').notNull(),
  version: varchar('version', { length: 50 }),
  host: varchar('host', { length: 255 }),
  port: integer('port'),
  username: varchar('username', { length: 255 }),
  passwordEncrypted: text('password_encrypted'),
  databaseName: varchar('database_name', { length: 255 }),
  connectionString: text('connection_string_encrypted'),
  status: varchar('status', { length: 50 }).default('provisioning').notNull(),
  storageSizeMb: integer('storage_size_mb').default(1024),
  maxConnections: integer('max_connections').default(100),
  containerId: varchar('container_id', { length: 64 }),
  backupEnabled: boolean('backup_enabled').default(true),
  backupSchedule: varchar('backup_schedule', { length: 100 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const backups = pgTable('backups', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
  databaseId: uuid('database_id').references(() => managedDatabases.id, { onDelete: 'set null' }),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: backupTypeEnum('type').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  sizeMb: integer('size_mb'),
  storagePath: text('storage_path'),
  storageProvider: varchar('storage_provider', { length: 50 }),
  checksumSha256: varchar('checksum_sha256', { length: 64 }),
  retentionDays: integer('retention_days').default(30),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  startedAt: timestamp('started_at', { mode: 'date' }),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const backupSchedules = pgTable('backup_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
  databaseId: uuid('database_id').references(() => managedDatabases.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  cronExpression: varchar('cron_expression', { length: 100 }).notNull(),
  type: backupTypeEnum('type').notNull(),
  isEnabled: boolean('is_enabled').default(true),
  retentionDays: integer('retention_days').default(30),
  lastRunAt: timestamp('last_run_at', { mode: 'date' }),
  nextRunAt: timestamp('next_run_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const serviceTemplates = pgTable('service_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  iconUrl: text('icon_url'),
  dockerImage: varchar('docker_image', { length: 500 }),
  dockerfileTemplate: text('dockerfile_template'),
  defaultPort: integer('default_port'),
  defaultEnvVars: jsonb('default_env_vars').$type<Record<string, string>>(),
  defaultResources: jsonb('default_resources').$type<{
    cpu?: string;
    memory?: string;
  }>(),
  healthCheckPath: varchar('health_check_path', { length: 255 }),
  documentationUrl: text('documentation_url'),
  tags: jsonb('tags').$type<string[]>().default([]),
  isOfficial: boolean('is_official').default(false),
  isPublic: boolean('is_public').default(true),
  usageCount: integer('usage_count').default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const serviceDependencies = pgTable('service_dependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  dependsOnServiceId: uuid('depends_on_service_id')
    .references(() => services.id, { onDelete: 'cascade' }),
  dependsOnDatabaseId: uuid('depends_on_database_id')
    .references(() => managedDatabases.id, { onDelete: 'cascade' }),
  isRequired: boolean('is_required').default(true),
  healthCheckRequired: boolean('health_check_required').default(true),
  startupOrder: integer('startup_order').default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const regions = pgTable('regions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  provider: varchar('provider', { length: 50 }),
  latitude: varchar('latitude', { length: 20 }),
  longitude: varchar('longitude', { length: 20 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const serviceRegions = pgTable('service_regions', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  regionId: uuid('region_id')
    .notNull()
    .references(() => regions.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
  isPrimary: boolean('is_primary').default(false),
  replicas: integer('replicas').default(1),
  status: varchar('status', { length: 50 }).default('pending'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const gitConnections = pgTable('git_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  provider: gitProviderEnum('provider').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  accessToken: text('access_token_encrypted'),
  refreshToken: text('refresh_token_encrypted'),
  tokenExpiresAt: timestamp('token_expires_at', { mode: 'date' }),
  providerUserId: varchar('provider_user_id', { length: 255 }),
  providerUsername: varchar('provider_username', { length: 255 }),
  webhookSecret: varchar('webhook_secret', { length: 64 }),
  isActive: boolean('is_active').default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const volumes = pgTable('volumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  sizeGb: integer('size_gb').notNull(),
  storageClass: varchar('storage_class', { length: 100 }).default('standard'),
  status: volumeStatusEnum('status').default('pending').notNull(),
  hostPath: varchar('host_path', { length: 500 }),
  driver: varchar('driver', { length: 100 }).default('local'),
  driverOptions: jsonb('driver_options').$type<Record<string, string>>(),
  labels: jsonb('labels').$type<Record<string, string>>().default({}),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const serviceVolumes = pgTable('service_volumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  volumeId: uuid('volume_id')
    .notNull()
    .references(() => volumes.id, { onDelete: 'cascade' }),
  mountPath: varchar('mount_path', { length: 500 }).notNull(),
  subPath: varchar('sub_path', { length: 500 }),
  readOnly: boolean('read_only').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
