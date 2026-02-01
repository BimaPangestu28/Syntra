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
import { userRoleEnum, serverStatusEnum, runtimeEnum, archEnum, serviceTypeEnum, sourceTypeEnum } from './enums';
import { users } from './auth';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  logo: text('logo'),
  ownerId: uuid('owner_id').references(() => users.id),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  plan: varchar('plan', { length: 50 }).default('free').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: userRoleEnum('role').default('developer').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id),
  invitedAt: timestamp('invited_at', { mode: 'date' }),
  acceptedAt: timestamp('accepted_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const servers = pgTable('servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  hostname: varchar('hostname', { length: 255 }),
  publicIp: varchar('public_ip', { length: 45 }),
  privateIp: varchar('private_ip', { length: 45 }),
  runtime: runtimeEnum('runtime'),
  runtimeVersion: varchar('runtime_version', { length: 50 }),
  status: serverStatusEnum('status').default('offline').notNull(),
  agentVersion: varchar('agent_version', { length: 50 }),
  agentTokenHash: varchar('agent_token_hash', { length: 64 }),
  osName: varchar('os_name', { length: 100 }),
  osVersion: varchar('os_version', { length: 100 }),
  arch: archEnum('arch'),
  cpuCores: integer('cpu_cores'),
  memoryMb: integer('memory_mb'),
  diskGb: integer('disk_gb'),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { mode: 'date' }),
  tags: jsonb('tags').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  gitRepoUrl: varchar('git_repo_url', { length: 500 }),
  gitBranch: varchar('git_branch', { length: 255 }).default('main'),
  gitProvider: varchar('git_provider', { length: 50 }), // github, gitlab, bitbucket
  gitInstallationId: varchar('git_installation_id', { length: 255 }),
  buildCommand: varchar('build_command', { length: 500 }),
  installCommand: varchar('install_command', { length: 500 }),
  outputDirectory: varchar('output_directory', { length: 255 }),
  rootDirectory: varchar('root_directory', { length: 255 }).default('/'),
  envVars: jsonb('env_vars').$type<Record<string, string>>().default({}),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').references(() => servers.id, {
    onDelete: 'set null',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  type: serviceTypeEnum('type').default('web').notNull(),
  sourceType: sourceTypeEnum('source_type').default('git').notNull(),
  dockerImage: varchar('docker_image', { length: 500 }),
  dockerfilePath: varchar('dockerfile_path', { length: 255 }).default(
    'Dockerfile'
  ),
  port: integer('port').default(3000),
  exposeEnabled: boolean('expose_enabled').default(false),
  exposePort: integer('expose_port'),
  replicas: integer('replicas').default(1),
  healthCheckPath: varchar('health_check_path', { length: 255 }).default('/'),
  healthCheckInterval: integer('health_check_interval').default(30),
  envVars: jsonb('env_vars').$type<Record<string, string>>().default({}),
  buildArgs: jsonb('build_args').$type<Record<string, string>>().default({}),
  resources: jsonb('resources').$type<{
    cpu_limit?: string;
    memory_limit?: string;
    cpu_request?: string;
    memory_request?: string;
  }>(),
  autoDeploy: boolean('auto_deploy').default(true),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});
