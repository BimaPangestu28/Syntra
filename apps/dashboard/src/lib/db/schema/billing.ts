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
import { usageTypeEnum, billingPlanEnum } from './enums';
import { organizations, services, servers } from './core';
import { deployments } from './deployments';

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
  deploymentId: uuid('deployment_id').references(() => deployments.id, { onDelete: 'set null' }),
  usageType: usageTypeEnum('usage_type').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price'),
  totalPrice: integer('total_price'),
  periodStart: timestamp('period_start', { mode: 'date' }).notNull(),
  periodEnd: timestamp('period_end', { mode: 'date' }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const billingPlans = pgTable('billing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  description: text('description'),
  plan: billingPlanEnum('plan').notNull(),
  priceMonthly: integer('price_monthly').notNull(),
  priceYearly: integer('price_yearly'),
  limits: jsonb('limits').$type<{
    compute_minutes?: number;
    build_minutes?: number;
    storage_gb?: number;
    bandwidth_gb?: number;
    deployments?: number;
    previews?: number;
    team_members?: number;
    servers?: number;
  }>().notNull(),
  features: jsonb('features').$type<string[]>().default([]),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => billingPlans.id),
  status: varchar('status', { length: 50 }).notNull(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  currentPeriodStart: timestamp('current_period_start', { mode: 'date' }),
  currentPeriodEnd: timestamp('current_period_end', { mode: 'date' }),
  cancelledAt: timestamp('cancelled_at', { mode: 'date' }),
  trialEndsAt: timestamp('trial_ends_at', { mode: 'date' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }),
  status: varchar('status', { length: 50 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('usd').notNull(),
  subtotal: integer('subtotal').notNull(),
  tax: integer('tax').default(0),
  total: integer('total').notNull(),
  amountPaid: integer('amount_paid').default(0),
  amountDue: integer('amount_due').notNull(),
  periodStart: timestamp('period_start', { mode: 'date' }),
  periodEnd: timestamp('period_end', { mode: 'date' }),
  dueDate: timestamp('due_date', { mode: 'date' }),
  paidAt: timestamp('paid_at', { mode: 'date' }),
  invoicePdfUrl: text('invoice_pdf_url'),
  lineItems: jsonb('line_items').$type<Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const costRecords = pgTable('cost_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
  databaseId: uuid('database_id'), // Forward reference, can't use references() here
  category: varchar('category', { length: 100 }).notNull(),
  description: text('description'),
  amount: integer('amount').notNull(),
  currency: varchar('currency', { length: 3 }).default('usd').notNull(),
  periodStart: timestamp('period_start', { mode: 'date' }).notNull(),
  periodEnd: timestamp('period_end', { mode: 'date' }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
