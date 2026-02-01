# Syntra - Claude Code Context

## Project Overview

Syntra is an AI-powered PaaS (Platform-as-a-Service) with BYOS (Bring Your Own Server) model. Users install a Rust agent on their servers and manage deployments via a SaaS dashboard.

**Key Differentiator**: AI co-pilot that analyzes errors, suggests fixes, generates Dockerfiles, and answers questions about deployments.

## Architecture

```
Control Plane (This Repo)     Data Plane (User's Servers)
┌─────────────────────┐       ┌─────────────────────┐
│ Next.js Dashboard   │◄─WSS─►│ Rust Agent          │
│ + API Routes        │       │ + Docker/K8s        │
│ + BullMQ Workers    │       │ + Traefik           │
│ + PostgreSQL        │       │ + OTLP Receiver     │
│ + Redis             │       └─────────────────────┘
│ + AI (Claude API)   │
└─────────────────────┘
```

## Directory Structure

```
/apps/dashboard/src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Protected dashboard pages
│   ├── api/v1/             # REST API endpoints
│   ├── login/              # Auth pages
│   └── status/[orgSlug]/   # Public status page
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── ai/                 # AI chat, error analysis
│   ├── workflows/          # React Flow workflow builder
│   ├── errors/             # Error list components
│   └── metrics/            # Charts and dashboards
├── lib/
│   ├── db/                 # Drizzle schema & queries
│   ├── auth/               # NextAuth config
│   ├── agent/              # WebSocket hub for agents
│   ├── ai/                 # Anthropic Claude integration
│   ├── workflows/          # Workflow execution engine
│   └── queue/              # BullMQ job definitions
```

## Key Files

| File | Purpose |
|------|---------|
| `lib/db/schema.ts` | Database schema (Drizzle ORM) |
| `lib/agent/hub.ts` | WebSocket hub for agent connections |
| `lib/ai/index.ts` | AI functions (error analysis, chat, dockerfile) |
| `lib/workflows/index.ts` | Workflow trigger & execution |
| `lib/queue/index.ts` | BullMQ job queues |
| `middleware.ts` | Auth middleware |

## Commands

```bash
# Development
pnpm --filter @syntra/dashboard dev

# Build
pnpm --filter @syntra/dashboard build

# Database
pnpm --filter @syntra/dashboard db:push      # Push schema
pnpm --filter @syntra/dashboard db:studio    # Drizzle Studio

# Lint
pnpm --filter @syntra/dashboard lint
```

## Environment Variables

Required in `apps/dashboard/.env.local`:
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
NEXTAUTH_SECRET=...
GITHUB_ID=...
GITHUB_SECRET=...
ANTHROPIC_API_KEY=...
```

## API Patterns

All API routes follow this pattern:
```typescript
// Success
{ success: true, data: {...} }

// Error
{ success: false, error: { code: 'ERROR_CODE', message: '...', request_id: '...' } }
```

## Current Status (Feb 2026)

### Implemented
- Core PaaS: Servers, Projects, Services, Deployments
- Agent communication via WebSocket
- AI features: Error analysis, Chat, Dockerfile generator
- Visual workflow builder with React Flow
- Public status page
- Error tracking with AI analysis

### Not Yet Implemented
- SDK (JS, Python, Rust, Go)
- ClickHouse for telemetry storage
- CLI tool
- Distributed tracing / APM
- Billing (Stripe)
- Blue-green / Canary deployments

## Coding Standards

- Use Drizzle ORM for all database operations
- Use Zod for API validation
- Keep API route files under 500 lines (refactor if larger)
- Use `crypto.randomUUID()` for request IDs
- Always check organization membership for authorization
- AI calls go through `lib/ai/index.ts`

## PRD Reference

Full product requirements: `/docs/PRD.md`
Development plan: `/docs/DEVELOPMENT_PLAN.md`
