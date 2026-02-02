import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { config } from './config';

// Inline schema subset — only what the build worker needs.
// This keeps the service fully independent from the dashboard package.

export const deploymentStatusEnum = pgEnum('deployment_status', [
  'pending',
  'building',
  'deploying',
  'running',
  'stopped',
  'failed',
  'cancelled',
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

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  gitRepoUrl: varchar('git_repo_url', { length: 500 }),
  gitBranch: varchar('git_branch', { length: 255 }).default('main'),
  envVars: jsonb('env_vars').$type<Record<string, string>>().default({}),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull(),
  serverId: uuid('server_id'),
  name: varchar('name', { length: 255 }).notNull(),
  type: serviceTypeEnum('type').default('web').notNull(),
  sourceType: sourceTypeEnum('source_type').default('git').notNull(),
  dockerImage: varchar('docker_image', { length: 500 }),
  dockerfilePath: varchar('dockerfile_path', { length: 255 }).default('Dockerfile'),
  port: integer('port').default(3000),
  replicas: integer('replicas').default(1),
  envVars: jsonb('env_vars').$type<Record<string, string>>().default({}),
  buildArgs: jsonb('build_args').$type<Record<string, string>>().default({}),
  autoDeploy: boolean('auto_deploy').default(true),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull(),
  serverId: uuid('server_id'),
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
  triggeredBy: uuid('triggered_by'),
  triggerType: varchar('trigger_type', { length: 50 }),
  rollbackFromId: uuid('rollback_from_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// Relations for query builder
export const servicesRelations = relations(services, ({ one }) => ({
  project: one(projects, {
    fields: [services.projectId],
    references: [projects.id],
  }),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  service: one(services, {
    fields: [deployments.serviceId],
    references: [services.id],
  }),
}));

// Database client
const queryClient = postgres(config.database.url);
export const db = drizzle(queryClient, {
  schema: { projects, services, deployments, servicesRelations, deploymentsRelations },
});

export async function closeDb(): Promise<void> {
  await queryClient.end();
}
