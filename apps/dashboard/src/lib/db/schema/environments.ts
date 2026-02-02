import { pgTable, uuid, varchar, boolean, timestamp, integer, jsonb, text } from 'drizzle-orm/pg-core';
import { projects } from './core';
import { deployments } from './deployments';

/**
 * Environments represent deployment targets (dev, staging, production).
 * Each project can have multiple environments.
 */
export const environments = pgTable('environments', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(), // e.g., 'development', 'staging', 'production'
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  isProduction: boolean('is_production').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  // Promotion settings
  requiresApproval: boolean('requires_approval').default(false).notNull(),
  approvers: jsonb('approvers').$type<string[]>().default([]),
  autoPromoteFrom: uuid('auto_promote_from'), // env ID to auto-promote from
  // Environment-specific config
  envVars: jsonb('env_vars').$type<Record<string, string>>().default({}),
  // Active deployment tracking
  activeDeploymentId: uuid('active_deployment_id'),
  // Status
  isLocked: boolean('is_locked').default(false).notNull(),
  lockedBy: uuid('locked_by'),
  lockedAt: timestamp('locked_at', { mode: 'date' }),
  lockedReason: varchar('locked_reason', { length: 500 }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

/**
 * Promotion records track when deployments are promoted between environments.
 */
export const promotions = pgTable('promotions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  fromEnvironmentId: uuid('from_environment_id').references(() => environments.id, { onDelete: 'cascade' }).notNull(),
  toEnvironmentId: uuid('to_environment_id').references(() => environments.id, { onDelete: 'cascade' }).notNull(),
  deploymentId: uuid('deployment_id').references(() => deployments.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, approved, rejected, deployed, failed
  requestedBy: uuid('requested_by').notNull(),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { mode: 'date' }),
  rejectedBy: uuid('rejected_by'),
  rejectedAt: timestamp('rejected_at', { mode: 'date' }),
  rejectedReason: text('rejected_reason'),
  deployedAt: timestamp('deployed_at', { mode: 'date' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
