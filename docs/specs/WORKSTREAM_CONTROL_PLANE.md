# Workstream 2: Control Plane - Detailed Specification

**Owner:** Full-stack Engineer
**Duration:** Phase 1-4 (Week 1-26)
**Repository:** `syntra/apps/dashboard`

---

## 1. Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Next.js | 14.x (App Router) |
| Language | TypeScript | 5.x |
| Database ORM | Drizzle | Latest |
| Database | PostgreSQL | 16 |
| Cache | Redis | 7.x |
| Job Queue | BullMQ | Latest |
| Auth | NextAuth.js | 5.x (Auth.js) |
| UI Components | shadcn/ui | Latest |
| Styling | Tailwind CSS | 3.x |
| State (Server) | TanStack Query | 5.x |
| State (Client) | Zustand | 4.x |
| Charts | Recharts | 2.x |
| Tables | TanStack Table | 8.x |
| Forms | React Hook Form + Zod | Latest |
| WebSocket | ws | 8.x |
| Workflow Editor | React Flow | 11.x |
| Terminal | xterm.js | 5.x |
| Payments | Stripe | Latest |

---

## 2. Project Structure

```
apps/dashboard/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   │   ├── page.tsx              # Dashboard overview
│   │   │   ├── servers/
│   │   │   │   ├── page.tsx          # Server list
│   │   │   │   ├── [serverId]/
│   │   │   │   │   └── page.tsx      # Server detail
│   │   │   │   └── new/
│   │   │   │       └── page.tsx      # Add server wizard
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx          # Project list
│   │   │   │   ├── [projectId]/
│   │   │   │   │   ├── page.tsx      # Project overview
│   │   │   │   │   ├── services/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── [serviceId]/
│   │   │   │   │   │       ├── page.tsx        # Service overview
│   │   │   │   │   │       ├── deployments/
│   │   │   │   │   │       │   └── page.tsx
│   │   │   │   │   │       ├── logs/
│   │   │   │   │   │       │   └── page.tsx
│   │   │   │   │   │       ├── traces/
│   │   │   │   │   │       │   └── page.tsx
│   │   │   │   │   │       ├── errors/
│   │   │   │   │   │       │   ├── page.tsx
│   │   │   │   │   │       │   └── [issueId]/
│   │   │   │   │   │       │       └── page.tsx
│   │   │   │   │   │       ├── metrics/
│   │   │   │   │   │       │   └── page.tsx
│   │   │   │   │   │       └── settings/
│   │   │   │   │   │           └── page.tsx
│   │   │   │   │   ├── workflows/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── builder/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   └── settings/
│   │   │   │   │       └── page.tsx
│   │   │   │   └── new/
│   │   │   │       └── page.tsx      # Create project wizard
│   │   │   ├── observability/
│   │   │   │   ├── issues/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── traces/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── logs/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── metrics/
│   │   │   │       └── page.tsx
│   │   │   ├── ai/
│   │   │   │   └── page.tsx          # AI copilot chat
│   │   │   ├── team/
│   │   │   │   └── page.tsx
│   │   │   ├── billing/
│   │   │   │   └── page.tsx
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts
│   │   │   ├── v1/
│   │   │   │   ├── servers/
│   │   │   │   │   ├── route.ts      # GET, POST
│   │   │   │   │   └── [serverId]/
│   │   │   │   │       ├── route.ts  # GET, PATCH, DELETE
│   │   │   │   │       └── metrics/
│   │   │   │   │           └── route.ts
│   │   │   │   ├── projects/
│   │   │   │   │   ├── route.ts
│   │   │   │   │   └── [projectId]/
│   │   │   │   │       ├── route.ts
│   │   │   │   │       ├── services/
│   │   │   │   │       │   └── route.ts
│   │   │   │   │       └── issues/
│   │   │   │   │           └── route.ts
│   │   │   │   ├── services/
│   │   │   │   │   └── [serviceId]/
│   │   │   │   │       ├── route.ts
│   │   │   │   │       ├── deploy/
│   │   │   │   │       │   └── route.ts
│   │   │   │   │       ├── rollback/
│   │   │   │   │       │   └── route.ts
│   │   │   │   │       ├── logs/
│   │   │   │   │       │   └── route.ts
│   │   │   │   │       ├── env/
│   │   │   │   │       │   └── route.ts
│   │   │   │   │       └── deployments/
│   │   │   │   │           └── route.ts
│   │   │   │   ├── deployments/
│   │   │   │   │   └── [deploymentId]/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── issues/
│   │   │   │   │   └── [issueId]/
│   │   │   │   │       ├── route.ts
│   │   │   │   │       └── events/
│   │   │   │   │           └── route.ts
│   │   │   │   ├── traces/
│   │   │   │   │   └── [traceId]/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── ai/
│   │   │   │   │   ├── analyze-error/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── generate-dockerfile/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── chat/
│   │   │   │   │       └── route.ts  # SSE streaming
│   │   │   │   ├── webhooks/
│   │   │   │   │   └── github/
│   │   │   │   │       └── route.ts
│   │   │   │   └── telemetry/
│   │   │   │       └── ingest/
│   │   │   │           └── route.ts
│   │   │   └── agent/
│   │   │       └── ws/
│   │   │           └── route.ts      # WebSocket upgrade
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Landing page
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   ├── breadcrumb.tsx
│   │   │   └── mobile-nav.tsx
│   │   ├── servers/
│   │   │   ├── server-card.tsx
│   │   │   ├── server-status-badge.tsx
│   │   │   ├── server-metrics.tsx
│   │   │   └── install-command.tsx
│   │   ├── projects/
│   │   │   ├── project-card.tsx
│   │   │   ├── create-project-form.tsx
│   │   │   └── git-repo-selector.tsx
│   │   ├── services/
│   │   │   ├── service-card.tsx
│   │   │   ├── service-config-form.tsx
│   │   │   ├── env-vars-editor.tsx
│   │   │   ├── domain-manager.tsx
│   │   │   └── health-check-config.tsx
│   │   ├── deployments/
│   │   │   ├── deployment-list.tsx
│   │   │   ├── deployment-card.tsx
│   │   │   ├── deployment-status.tsx
│   │   │   ├── build-log-viewer.tsx
│   │   │   └── rollback-dialog.tsx
│   │   ├── observability/
│   │   │   ├── issues/
│   │   │   │   ├── issue-list.tsx
│   │   │   │   ├── issue-detail.tsx
│   │   │   │   ├── stack-trace-viewer.tsx
│   │   │   │   ├── breadcrumbs-timeline.tsx
│   │   │   │   └── ai-analysis-panel.tsx
│   │   │   ├── traces/
│   │   │   │   ├── trace-list.tsx
│   │   │   │   ├── trace-waterfall.tsx
│   │   │   │   └── span-detail.tsx
│   │   │   ├── logs/
│   │   │   │   ├── log-explorer.tsx
│   │   │   │   ├── log-entry.tsx
│   │   │   │   ├── log-filters.tsx
│   │   │   │   └── live-tail-toggle.tsx
│   │   │   └── metrics/
│   │   │       ├── metrics-chart.tsx
│   │   │       ├── time-range-picker.tsx
│   │   │       └── deploy-markers.tsx
│   │   ├── workflows/
│   │   │   ├── workflow-canvas.tsx
│   │   │   ├── workflow-nodes.tsx
│   │   │   ├── node-config-panel.tsx
│   │   │   └── workflow-run-viewer.tsx
│   │   ├── ai/
│   │   │   ├── chat-interface.tsx
│   │   │   ├── chat-message.tsx
│   │   │   └── suggested-questions.tsx
│   │   └── shared/
│   │       ├── loading-spinner.tsx
│   │       ├── empty-state.tsx
│   │       ├── error-boundary.tsx
│   │       ├── confirm-dialog.tsx
│   │       └── copy-button.tsx
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts              # Drizzle client
│   │   │   ├── schema.ts             # All tables
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── auth/
│   │   │   ├── config.ts             # NextAuth config
│   │   │   └── middleware.ts
│   │   ├── agent/
│   │   │   ├── hub.ts                # WebSocket hub
│   │   │   ├── protocol.ts           # Message types
│   │   │   └── commands.ts           # Command builders
│   │   ├── build/
│   │   │   ├── queue.ts              # BullMQ queue
│   │   │   ├── worker.ts             # Build worker
│   │   │   └── nixpacks.ts           # Nixpacks integration
│   │   ├── telemetry/
│   │   │   ├── ingest.ts             # Ingestion pipeline
│   │   │   ├── fingerprint.ts        # Error fingerprinting
│   │   │   └── clickhouse.ts         # ClickHouse client
│   │   ├── ai/
│   │   │   ├── client.ts             # Claude API client
│   │   │   ├── prompts.ts            # System prompts
│   │   │   └── analysis.ts           # Analysis pipeline
│   │   ├── crypto/
│   │   │   ├── encryption.ts         # AES-256-GCM
│   │   │   └── tokens.ts             # Token generation
│   │   ├── github/
│   │   │   ├── app.ts                # GitHub App client
│   │   │   └── webhooks.ts           # Webhook handlers
│   │   ├── stripe/
│   │   │   ├── client.ts
│   │   │   └── webhooks.ts
│   │   └── utils/
│   │       ├── api.ts                # API helpers
│   │       ├── errors.ts             # Error classes
│   │       └── validation.ts         # Zod schemas
│   ├── hooks/
│   │   ├── use-servers.ts
│   │   ├── use-projects.ts
│   │   ├── use-services.ts
│   │   ├── use-deployments.ts
│   │   ├── use-logs.ts
│   │   ├── use-metrics.ts
│   │   ├── use-websocket.ts
│   │   └── use-real-time.ts
│   ├── store/
│   │   ├── index.ts
│   │   ├── ui-store.ts
│   │   └── notifications-store.ts
│   └── types/
│       ├── api.ts
│       ├── database.ts
│       └── agent.ts
├── drizzle.config.ts
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Database Schema (Drizzle)

```typescript
// src/lib/db/schema.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  pgEnum,
  inet,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userPlanEnum = pgEnum('user_plan', ['free', 'pro', 'team', 'enterprise']);
export const orgRoleEnum = pgEnum('org_role', ['owner', 'admin', 'developer', 'viewer']);
export const serverStatusEnum = pgEnum('server_status', ['online', 'offline', 'updating', 'error']);
export const serverRuntimeEnum = pgEnum('server_runtime', ['docker', 'kubernetes']);
export const serviceTypeEnum = pgEnum('service_type', ['app', 'database', 'worker', 'cron']);
export const sourceTypeEnum = pgEnum('source_type', ['dockerfile', 'nixpacks', 'image', 'docker_compose']);
export const deploymentStatusEnum = pgEnum('deployment_status', [
  'queued', 'building', 'pushing', 'deploying', 'running', 'failed', 'rolled_back', 'cancelled'
]);
export const triggerTypeEnum = pgEnum('trigger_type', ['manual', 'git_push', 'workflow', 'rollback', 'api', 'schedule']);
export const issueStatusEnum = pgEnum('issue_status', ['unresolved', 'resolved', 'ignored', 'regressed']);
export const issueSeverityEnum = pgEnum('issue_severity', ['critical', 'high', 'medium', 'low']);

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  plan: userPlanEnum('plan').default('free'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Organizations
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  plan: userPlanEnum('plan').default('free'),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Organization Members
export const orgMembers = pgTable('org_members', {
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: orgRoleEnum('role').notNull().default('developer'),
  invitedBy: uuid('invited_by').references(() => users.id),
  invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
}, (table) => ({
  pk: { columns: [table.orgId, table.userId] },
}));

// Servers
export const servers = pgTable('servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  hostname: varchar('hostname', { length: 255 }),
  publicIp: inet('public_ip'),
  privateIp: inet('private_ip'),
  runtime: serverRuntimeEnum('runtime').default('docker'),
  runtimeVersion: varchar('runtime_version', { length: 50 }),
  status: serverStatusEnum('status').default('offline'),
  agentVersion: varchar('agent_version', { length: 20 }),
  agentTokenHash: varchar('agent_token_hash', { length: 64 }).notNull(),
  osName: varchar('os_name', { length: 50 }),
  osVersion: varchar('os_version', { length: 50 }),
  arch: varchar('arch', { length: 20 }),
  cpuCores: integer('cpu_cores'),
  memoryMb: integer('memory_mb'),
  diskGb: integer('disk_gb'),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  tags: text('tags').array().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_servers_org').on(table.orgId),
  statusIdx: index('idx_servers_status').on(table.status),
}));

// Projects
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  gitRepoUrl: text('git_repo_url'),
  gitBranch: varchar('git_branch', { length: 255 }).default('main'),
  gitProvider: varchar('git_provider', { length: 50 }),
  gitInstallationId: varchar('git_installation_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_projects_org').on(table.orgId),
  orgSlugUnique: uniqueIndex('idx_projects_org_slug').on(table.orgId, table.slug),
}));

// Services
export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: serviceTypeEnum('type').default('app'),
  sourceType: sourceTypeEnum('source_type').notNull(),
  dockerfilePath: varchar('dockerfile_path', { length: 500 }).default('./Dockerfile'),
  buildContext: varchar('build_context', { length: 500 }).default('.'),
  imageName: varchar('image_name', { length: 500 }),
  imageTag: varchar('image_tag', { length: 255 }),
  port: integer('port'),
  replicas: integer('replicas').default(1),
  cpuLimit: varchar('cpu_limit', { length: 20 }),
  memoryLimit: varchar('memory_limit', { length: 20 }),
  envVarsEncrypted: text('env_vars_encrypted'), // Base64 encoded AES-256-GCM
  domains: jsonb('domains').default([]),
  healthCheckPath: varchar('health_check_path', { length: 255 }),
  healthCheckInterval: integer('health_check_interval').default(30),
  healthCheckTimeout: integer('health_check_timeout').default(5),
  healthCheckRetries: integer('health_check_retries').default(3),
  autoDeploy: boolean('auto_deploy').default(true),
  currentDeploymentId: uuid('current_deployment_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: index('idx_services_project').on(table.projectId),
  serverIdx: index('idx_services_server').on(table.serverId),
}));

// Deployments
export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  status: deploymentStatusEnum('status').default('queued'),
  gitCommitSha: varchar('git_commit_sha', { length: 40 }),
  gitCommitMessage: text('git_commit_message'),
  gitBranch: varchar('git_branch', { length: 255 }),
  imageDigest: varchar('image_digest', { length: 100 }),
  buildDurationMs: integer('build_duration_ms'),
  deployDurationMs: integer('deploy_duration_ms'),
  buildLogs: text('build_logs'),
  triggeredBy: uuid('triggered_by').references(() => users.id),
  triggerType: triggerTypeEnum('trigger_type').default('manual'),
  errorMessage: text('error_message'),
  rollbackFromId: uuid('rollback_from_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (table) => ({
  serviceIdx: index('idx_deployments_service').on(table.serviceId),
  statusIdx: index('idx_deployments_status').on(table.status),
  createdIdx: index('idx_deployments_created').on(table.createdAt),
}));

// Error Groups
export const errorGroups = pgTable('error_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
  title: text('title').notNull(),
  exceptionType: varchar('exception_type', { length: 255 }),
  status: issueStatusEnum('status').default('unresolved'),
  severity: issueSeverityEnum('severity').default('medium'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  eventCount: bigint('event_count', { mode: 'number' }).default(1),
  userCount: integer('user_count').default(0),
  assignedTo: uuid('assigned_to').references(() => users.id),
  aiAnalysis: jsonb('ai_analysis'),
  aiAnalyzedAt: timestamp('ai_analyzed_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  serviceIdx: index('idx_error_groups_service').on(table.serviceId),
  statusIdx: index('idx_error_groups_status').on(table.status),
  lastSeenIdx: index('idx_error_groups_last_seen').on(table.lastSeenAt),
  serviceFingerprintUnique: uniqueIndex('idx_error_groups_service_fingerprint').on(table.serviceId, table.fingerprint),
}));

// Error Events
export const errorEvents = pgTable('error_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  errorGroupId: uuid('error_group_id').notNull().references(() => errorGroups.id, { onDelete: 'cascade' }),
  deploymentId: uuid('deployment_id').references(() => deployments.id),
  stackTrace: jsonb('stack_trace').notNull(),
  breadcrumbs: jsonb('breadcrumbs'),
  context: jsonb('context'),
  environment: varchar('environment', { length: 50 }),
  release: varchar('release', { length: 100 }),
  userIdHash: varchar('user_id_hash', { length: 64 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  groupIdx: index('idx_error_events_group').on(table.errorGroupId),
  timestampIdx: index('idx_error_events_timestamp').on(table.timestamp),
}));

// Health Checks
export const healthChecks = pgTable('health_checks', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms').notNull(),
  isHealthy: boolean('is_healthy').notNull(),
  errorMessage: text('error_message'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  serviceCheckedIdx: index('idx_health_checks_service').on(table.serviceId, table.checkedAt),
}));

// API Tokens
export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  tokenPrefix: varchar('token_prefix', { length: 20 }).notNull(),
  scopes: text('scopes').array().default([]),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  hashIdx: index('idx_api_tokens_hash').on(table.tokenHash),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  organizations: many(organizations),
  orgMemberships: many(orgMembers),
  apiTokens: many(apiTokens),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, {
    fields: [organizations.ownerId],
    references: [users.id],
  }),
  members: many(orgMembers),
  servers: many(servers),
  projects: many(projects),
}));

export const serversRelations = relations(servers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [servers.orgId],
    references: [organizations.id],
  }),
  services: many(services),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id],
  }),
  services: many(services),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  project: one(projects, {
    fields: [services.projectId],
    references: [projects.id],
  }),
  server: one(servers, {
    fields: [services.serverId],
    references: [servers.id],
  }),
  deployments: many(deployments),
  errorGroups: many(errorGroups),
  healthChecks: many(healthChecks),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  service: one(services, {
    fields: [deployments.serviceId],
    references: [services.id],
  }),
  triggeredByUser: one(users, {
    fields: [deployments.triggeredBy],
    references: [users.id],
  }),
}));

export const errorGroupsRelations = relations(errorGroups, ({ one, many }) => ({
  service: one(services, {
    fields: [errorGroups.serviceId],
    references: [services.id],
  }),
  assignee: one(users, {
    fields: [errorGroups.assignedTo],
    references: [users.id],
  }),
  events: many(errorEvents),
}));
```

---

## 4. Core API Implementation

### 4.1 Auth Configuration

```typescript
// src/lib/auth/config.ts
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
    async signIn({ user, account, profile }) {
      // Create default organization for new users
      return true;
    },
  },
  pages: {
    signIn: '/login',
  },
});

// Middleware helper
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
```

### 4.2 WebSocket Hub for Agent Communication

```typescript
// src/lib/agent/hub.ts
import { WebSocketServer, WebSocket } from 'ws';
import { db } from '@/lib/db';
import { servers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAgentToken } from '@/lib/crypto/tokens';
import type {
  AgentMessage,
  ControlPlaneMessage,
  AgentHelloPayload,
  HeartbeatPayload,
} from '@/types/agent';

interface ConnectedAgent {
  ws: WebSocket;
  serverId: string;
  orgId: string;
  agentId: string;
  lastHeartbeat: Date;
}

class AgentHub {
  private agents: Map<string, ConnectedAgent> = new Map();
  private wss: WebSocketServer | null = null;

  initialize(server: any) {
    this.wss = new WebSocketServer({ server, path: '/agent/ws' });

    this.wss.on('connection', async (ws, req) => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          ws.close(4001, 'Missing token');
          return;
        }

        const serverInfo = await verifyAgentToken(token);
        if (!serverInfo) {
          ws.close(4001, 'Invalid token');
          return;
        }

        // Wait for agent_hello
        ws.once('message', async (data) => {
          try {
            const message: AgentMessage = JSON.parse(data.toString());

            if (message.type !== 'agent_hello') {
              ws.close(4002, 'Expected agent_hello');
              return;
            }

            const payload = message.payload as AgentHelloPayload;

            // Register agent
            const agent: ConnectedAgent = {
              ws,
              serverId: serverInfo.serverId,
              orgId: serverInfo.orgId,
              agentId: payload.agent_id,
              lastHeartbeat: new Date(),
            };

            this.agents.set(serverInfo.serverId, agent);

            // Update server info in database
            await db.update(servers)
              .set({
                status: 'online',
                agentVersion: payload.version,
                runtime: payload.runtime,
                runtimeVersion: payload.runtime_version,
                hostname: payload.network.hostname,
                publicIp: payload.network.public_ip,
                privateIp: payload.network.private_ip,
                osName: payload.os.name,
                osVersion: payload.os.version,
                arch: payload.arch,
                cpuCores: payload.resources.cpu_cores,
                memoryMb: payload.resources.memory_total_mb,
                diskGb: payload.resources.disk_total_gb,
                lastHeartbeatAt: new Date(),
              })
              .where(eq(servers.id, serverInfo.serverId));

            // Send hello_ack
            const ack: ControlPlaneMessage = {
              id: crypto.randomUUID(),
              type: 'hello_ack',
              timestamp: new Date().toISOString(),
              payload: {
                server_id: serverInfo.serverId,
                accepted: true,
                server_name: serverInfo.serverName,
                org_id: serverInfo.orgId,
                config: {
                  heartbeat_interval_seconds: 30,
                  telemetry_batch_interval_seconds: 5,
                  telemetry_buffer_max_mb: 50,
                  log_level: 'info',
                },
                pending_deployments: [], // TODO: Load pending deployments
              },
            };

            ws.send(JSON.stringify(ack));

            // Setup message handler
            this.setupMessageHandler(agent);

            console.log(`Agent connected: ${serverInfo.serverId}`);
          } catch (err) {
            console.error('Error handling agent_hello:', err);
            ws.close(4003, 'Invalid hello message');
          }
        });

        ws.on('close', () => {
          this.handleDisconnect(serverInfo.serverId);
        });

        ws.on('error', (err) => {
          console.error(`WebSocket error for ${serverInfo.serverId}:`, err);
          this.handleDisconnect(serverInfo.serverId);
        });
      } catch (err) {
        console.error('Connection error:', err);
        ws.close(4000, 'Connection error');
      }
    });
  }

  private extractToken(req: any): string | null {
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    return null;
  }

  private setupMessageHandler(agent: ConnectedAgent) {
    agent.ws.on('message', async (data) => {
      try {
        const message: AgentMessage = JSON.parse(data.toString());
        await this.handleAgentMessage(agent, message);
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });
  }

  private async handleAgentMessage(agent: ConnectedAgent, message: AgentMessage) {
    switch (message.type) {
      case 'heartbeat':
        await this.handleHeartbeat(agent, message.payload as HeartbeatPayload);
        break;

      case 'deploy_status':
        await this.handleDeployStatus(agent, message);
        break;

      case 'telemetry_batch':
        await this.handleTelemetryBatch(agent, message);
        break;

      case 'command_response':
        await this.handleCommandResponse(agent, message);
        break;

      case 'alert':
        await this.handleAlert(agent, message);
        break;

      case 'log_stream':
        await this.handleLogStream(agent, message);
        break;
    }
  }

  private async handleHeartbeat(agent: ConnectedAgent, payload: HeartbeatPayload) {
    agent.lastHeartbeat = new Date();

    await db.update(servers)
      .set({
        status: 'online',
        lastHeartbeatAt: new Date(),
      })
      .where(eq(servers.id, agent.serverId));

    // Store metrics in Redis for real-time display
    // await redis.hset(`server:${agent.serverId}:metrics`, payload.resources);

    // Send pong
    this.sendToAgent(agent.serverId, {
      id: crypto.randomUUID(),
      type: 'pong',
      timestamp: new Date().toISOString(),
      payload: {},
    });
  }

  private async handleDeployStatus(agent: ConnectedAgent, message: AgentMessage) {
    // Update deployment status in database
    // Broadcast to dashboard subscribers via SSE/WebSocket
  }

  private async handleTelemetryBatch(agent: ConnectedAgent, message: AgentMessage) {
    // Forward to telemetry ingestion pipeline
    // This would be a separate service in production
  }

  private async handleCommandResponse(agent: ConnectedAgent, message: AgentMessage) {
    // Resolve pending command promise
  }

  private async handleAlert(agent: ConnectedAgent, message: AgentMessage) {
    // Process alert, send notifications
  }

  private async handleLogStream(agent: ConnectedAgent, message: AgentMessage) {
    // Forward logs to subscribed dashboard clients
  }

  private async handleDisconnect(serverId: string) {
    this.agents.delete(serverId);

    await db.update(servers)
      .set({ status: 'offline' })
      .where(eq(servers.id, serverId));

    console.log(`Agent disconnected: ${serverId}`);
  }

  // Public methods for sending commands to agents

  sendToAgent(serverId: string, message: ControlPlaneMessage): boolean {
    const agent = this.agents.get(serverId);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    agent.ws.send(JSON.stringify(message));
    return true;
  }

  async sendDeploy(serverId: string, deploySpec: any): Promise<string> {
    const requestId = crypto.randomUUID();

    const message: ControlPlaneMessage = {
      id: requestId,
      type: 'deploy',
      timestamp: new Date().toISOString(),
      payload: deploySpec,
    };

    const sent = this.sendToAgent(serverId, message);
    if (!sent) {
      throw new Error('Agent not connected');
    }

    return requestId;
  }

  async sendStop(serverId: string, serviceId: string): Promise<string> {
    const requestId = crypto.randomUUID();

    const message: ControlPlaneMessage = {
      id: requestId,
      type: 'stop',
      timestamp: new Date().toISOString(),
      payload: {
        request_id: requestId,
        service_id: serviceId,
        timeout_seconds: 30,
        remove_container: true,
      },
    };

    this.sendToAgent(serverId, message);
    return requestId;
  }

  isAgentConnected(serverId: string): boolean {
    const agent = this.agents.get(serverId);
    return !!agent && agent.ws.readyState === WebSocket.OPEN;
  }

  getConnectedAgents(): string[] {
    return Array.from(this.agents.keys());
  }
}

export const agentHub = new AgentHub();
```

### 4.3 API Route Example

```typescript
// src/app/api/v1/services/[serviceId]/deploy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, deployments, servers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/config';
import { requireOrgAccess } from '@/lib/auth/middleware';
import { agentHub } from '@/lib/agent/hub';
import { buildQueue } from '@/lib/build/queue';
import { z } from 'zod';

const deploySchema = z.object({
  git_ref: z.string().optional(),
  image_tag: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { git_ref, image_tag } = deploySchema.parse(body);

    // Get service with project and server
    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: {
          with: {
            organization: true,
          },
        },
        server: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } },
        { status: 404 }
      );
    }

    // Check organization access
    await requireOrgAccess(user.id, service.project.orgId, ['owner', 'admin', 'developer']);

    // Check if server is online
    if (!agentHub.isAgentConnected(service.serverId)) {
      return NextResponse.json(
        { success: false, error: { code: 'AGENT_OFFLINE', message: 'Server agent is offline' } },
        { status: 503 }
      );
    }

    // Create deployment record
    const [deployment] = await db.insert(deployments)
      .values({
        serviceId: service.id,
        status: 'queued',
        gitBranch: git_ref || service.project.gitBranch,
        triggeredBy: user.id,
        triggerType: 'manual',
      })
      .returning();

    // Queue build job
    await buildQueue.add('build', {
      deploymentId: deployment.id,
      serviceId: service.id,
      projectId: service.projectId,
      serverId: service.serverId,
      gitRepoUrl: service.project.gitRepoUrl,
      gitBranch: git_ref || service.project.gitBranch,
      sourceType: service.sourceType,
      dockerfilePath: service.dockerfilePath,
      buildContext: service.buildContext,
    }, {
      jobId: deployment.id,
      removeOnComplete: true,
      removeOnFail: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: deployment.id,
        status: deployment.status,
        created_at: deployment.createdAt,
      },
    }, { status: 201 });

  } catch (error) {
    console.error('Deploy error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: error.errors } },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
```

---

## 5. Key UI Components

### 5.1 Server Status Badge

```tsx
// src/components/servers/server-status-badge.tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ServerStatus = 'online' | 'offline' | 'updating' | 'error';

interface ServerStatusBadgeProps {
  status: ServerStatus;
  className?: string;
}

const statusConfig: Record<ServerStatus, { label: string; className: string }> = {
  online: {
    label: 'Online',
    className: 'bg-green-500/10 text-green-500 hover:bg-green-500/20',
  },
  offline: {
    label: 'Offline',
    className: 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20',
  },
  updating: {
    label: 'Updating',
    className: 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20',
  },
  error: {
    label: 'Error',
    className: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
  },
};

export function ServerStatusBadge({ status, className }: ServerStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge className={cn('font-medium', config.className, className)}>
      <span className={cn(
        'mr-1.5 h-2 w-2 rounded-full',
        status === 'online' && 'bg-green-500 animate-pulse',
        status === 'offline' && 'bg-gray-500',
        status === 'updating' && 'bg-yellow-500 animate-pulse',
        status === 'error' && 'bg-red-500',
      )} />
      {config.label}
    </Badge>
  );
}
```

### 5.2 Build Log Viewer

```tsx
// src/components/deployments/build-log-viewer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface BuildLogViewerProps {
  deploymentId: string;
  initialLogs?: string;
  status: string;
}

export function BuildLogViewer({ deploymentId, initialLogs, status }: BuildLogViewerProps) {
  const [logs, setLogs] = useState(initialLogs || '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (status !== 'building' && status !== 'deploying') return;

    const eventSource = new EventSource(`/api/v1/deployments/${deploymentId}/logs/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLogs((prev) => prev + data.line + '\n');
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [deploymentId, status]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isAtBottom = element.scrollHeight - element.scrollTop === element.clientHeight;
    setAutoScroll(isAtBottom);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-sm font-medium">Build Logs</CardTitle>
        <Badge variant={status === 'running' ? 'default' : 'secondary'}>
          {status}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-[400px] rounded-b-lg bg-zinc-950 p-4"
        >
          <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
            {logs || 'Waiting for logs...'}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
```

### 5.3 AI Analysis Panel

```tsx
// src/components/observability/issues/ai-analysis-panel.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Lightbulb, AlertTriangle, Code, Users } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface AIAnalysis {
  root_cause: string;
  why_now: string;
  suggested_fix: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affected_scope: string;
  analyzed_at: string;
}

interface AIAnalysisPanelProps {
  issueId: string;
  analysis?: AIAnalysis | null;
}

export function AIAnalysisPanel({ issueId, analysis: initialAnalysis }: AIAnalysisPanelProps) {
  const queryClient = useQueryClient();

  const { data: analysis, isLoading } = useQuery({
    queryKey: ['ai-analysis', issueId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/issues/${issueId}`);
      const data = await res.json();
      return data.data.ai_analysis as AIAnalysis | null;
    },
    initialData: initialAnalysis,
  });

  const { mutate: reanalyze, isPending: isReanalyzing } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/ai/analyze-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_id: issueId, force_refresh: true }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-analysis', issueId] });
    },
  });

  const severityColors = {
    critical: 'bg-red-500/10 text-red-500',
    high: 'bg-orange-500/10 text-orange-500',
    medium: 'bg-yellow-500/10 text-yellow-500',
    low: 'bg-blue-500/10 text-blue-500',
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-4">
              No AI analysis available yet
            </p>
            <Button onClick={() => reanalyze()} disabled={isReanalyzing}>
              {isReanalyzing && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Analyze with AI
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          AI Analysis
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(analysis.analyzed_at), { addSuffix: true })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => reanalyze()}
            disabled={isReanalyzing}
          >
            <RefreshCw className={cn('h-4 w-4', isReanalyzing && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Severity */}
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Severity:</span>
          <Badge className={severityColors[analysis.severity]}>
            {analysis.severity.toUpperCase()}
          </Badge>
        </div>

        {/* Root Cause */}
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Root Cause</h4>
          <p className="text-sm text-muted-foreground">{analysis.root_cause}</p>
        </div>

        {/* Why Now */}
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Why Now?</h4>
          <p className="text-sm text-muted-foreground">{analysis.why_now}</p>
        </div>

        {/* Suggested Fix */}
        <div className="space-y-1">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Code className="h-4 w-4" />
            Suggested Fix
          </h4>
          <pre className="text-xs bg-zinc-950 rounded-md p-3 overflow-x-auto">
            <code>{analysis.suggested_fix}</code>
          </pre>
        </div>

        {/* Affected Scope */}
        <div className="space-y-1">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Affected Scope
          </h4>
          <p className="text-sm text-muted-foreground">{analysis.affected_scope}</p>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 6. Deliverables Checklist

### Phase 1 (Week 1-8)

- [ ] Project setup (Next.js 14, Tailwind, shadcn/ui)
- [ ] Database schema (Drizzle + PostgreSQL)
- [ ] Auth (NextAuth.js with GitHub/Google)
- [ ] User/Organization model
- [ ] Server registration API + install command generation
- [ ] Server list/detail pages
- [ ] WebSocket hub for agent connections
- [ ] Agent authentication + hello/heartbeat
- [ ] Real-time server status
- [ ] Project CRUD
- [ ] Service configuration
- [ ] GitHub webhook integration
- [ ] Build queue (BullMQ)
- [ ] Build worker + Docker build
- [ ] Deploy command to agent
- [ ] Deployment status page + build logs
- [ ] Environment variables (encrypted)
- [ ] Domain management
- [ ] Rollback functionality
- [ ] Dashboard overview

### Phase 2 (Week 9-14)

- [ ] Telemetry ingestion endpoint
- [ ] Error grouping/fingerprinting
- [ ] Error events storage
- [ ] Issues list page
- [ ] Issue detail page
- [ ] Stack trace viewer
- [ ] AI error analysis integration
- [ ] AI analysis panel component

### Phase 3 (Week 15-20)

- [ ] ClickHouse integration
- [ ] Trace storage + API
- [ ] Trace waterfall UI
- [ ] Log storage + API
- [ ] Log explorer UI
- [ ] Metrics storage + API
- [ ] Metrics charts
- [ ] Health check storage
- [ ] Alerting system
- [ ] Deploy notifications

### Phase 4 (Week 21-26)

- [ ] Multi-user RBAC
- [ ] Team management
- [ ] Environment promotion
- [ ] Workflow builder (React Flow)
- [ ] AI co-pilot chat
- [ ] Billing (Stripe)
