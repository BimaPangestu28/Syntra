import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { services } from './core';
import { deployments } from './deployments';

/**
 * Deployment strategies define how traffic is routed during deployments.
 */
export const deploymentStrategies = pgTable('deployment_strategies', {
  id: uuid('id').defaultRandom().primaryKey(),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
  strategy: varchar('strategy', { length: 20 }).default('rolling').notNull(), // rolling, blue_green, canary
  // Blue-green settings
  blueDeploymentId: uuid('blue_deployment_id'),
  greenDeploymentId: uuid('green_deployment_id'),
  activeColor: varchar('active_color', { length: 10 }).default('blue'), // blue or green
  // Canary settings
  canaryDeploymentId: uuid('canary_deployment_id'),
  canaryWeight: integer('canary_weight').default(0), // 0-100 percentage
  canarySteps: jsonb('canary_steps').$type<number[]>().default([10, 25, 50, 75, 100]),
  canaryCurrentStep: integer('canary_current_step').default(0),
  canaryAutoPromote: boolean('canary_auto_promote').default(false),
  canaryAutoPromoteDelay: integer('canary_auto_promote_delay').default(300), // seconds
  // Health checks for promotion
  canaryErrorThreshold: integer('canary_error_threshold').default(5), // max error % to auto-promote
  canaryLatencyThreshold: integer('canary_latency_threshold').default(500), // max p99 latency ms
  // Status
  isActive: boolean('is_active').default(false).notNull(),
  lastSwitchedAt: timestamp('last_switched_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
