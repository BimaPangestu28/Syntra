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
import { scalingMetricEnum } from './enums';
import { users } from './auth';
import { organizations, services, servers } from './core';

export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  trigger: jsonb('trigger').$type<{
    type: 'error' | 'metric' | 'schedule' | 'manual';
    conditions?: Record<string, unknown>;
    schedule?: string;
  }>().notNull(),
  actions: jsonb('actions').$type<Array<{
    type: 'notify' | 'scale' | 'restart' | 'rollback' | 'run_command' | 'ai_analyze';
    config: Record<string, unknown>;
  }>>().notNull(),
  isActive: boolean('is_active').default(true),
  lastTriggeredAt: timestamp('last_triggered_at', { mode: 'date' }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const autoScalingRules = pgTable('auto_scaling_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  isEnabled: boolean('is_enabled').default(true),
  metric: scalingMetricEnum('metric').notNull(),
  customMetricName: varchar('custom_metric_name', { length: 255 }),
  scaleUpThreshold: integer('scale_up_threshold').notNull(),
  scaleUpBy: integer('scale_up_by').default(1).notNull(),
  scaleUpCooldown: integer('scale_up_cooldown').default(300).notNull(),
  scaleDownThreshold: integer('scale_down_threshold').notNull(),
  scaleDownBy: integer('scale_down_by').default(1).notNull(),
  scaleDownCooldown: integer('scale_down_cooldown').default(300).notNull(),
  minReplicas: integer('min_replicas').default(1).notNull(),
  maxReplicas: integer('max_replicas').default(10).notNull(),
  evaluationPeriod: integer('evaluation_period').default(60).notNull(),
  evaluationDataPoints: integer('evaluation_data_points').default(3).notNull(),
  lastScaleAction: timestamp('last_scale_action', { mode: 'date' }),
  lastScaleDirection: varchar('last_scale_direction', { length: 10 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const scalingEvents = pgTable('scaling_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').references(() => autoScalingRules.id, { onDelete: 'set null' }),
  direction: varchar('direction', { length: 10 }).notNull(),
  fromReplicas: integer('from_replicas').notNull(),
  toReplicas: integer('to_replicas').notNull(),
  triggerMetric: varchar('trigger_metric', { length: 255 }),
  triggerValue: integer('trigger_value'),
  reason: text('reason'),
  status: varchar('status', { length: 50 }).default('completed').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const cronJobs = pgTable('cron_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').references(() => servers.id),
  name: varchar('name', { length: 255 }).notNull(),
  command: text('command').notNull(),
  cronExpression: varchar('cron_expression', { length: 100 }).notNull(),
  timezone: varchar('timezone', { length: 100 }).default('UTC'),
  isEnabled: boolean('is_enabled').default(true),
  timeout: integer('timeout').default(3600),
  retryCount: integer('retry_count').default(0),
  lastRunAt: timestamp('last_run_at', { mode: 'date' }),
  lastRunStatus: varchar('last_run_status', { length: 50 }),
  lastRunDuration: integer('last_run_duration'),
  nextRunAt: timestamp('next_run_at', { mode: 'date' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const cronJobRuns = pgTable('cron_job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  cronJobId: uuid('cron_job_id')
    .notNull()
    .references(() => cronJobs.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull(),
  output: text('output'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { mode: 'date' }),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  duration: integer('duration'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
