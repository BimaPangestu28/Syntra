# Syntra

**AI-powered Platform-as-a-Service (PaaS)** with BYOS (Bring Your Own Server) model.

Deploy, monitor, and debug applications with an AI co-pilot that understands your entire stack.

## Features

### Core PaaS
- **Server Management** - One-liner agent installation, real-time monitoring
- **Project & Service Management** - Git-based deployments, environment variables
- **Deployment System** - Build queue, Docker support, rollback capability
- **Networking** - Traefik reverse proxy, SSL, custom domains

### AI Ops (Differentiator)
- **AI Error Analysis** - Root cause detection, fix suggestions
- **AI Chat Co-pilot** - Natural language queries about your services
- **AI Dockerfile Generator** - Auto-generate optimized Dockerfiles
- **AI Recommendations** - Performance and cost optimization

### Observability
- **Error Tracking** - Capture and group errors with AI analysis
- **Public Status Page** - Auto-generated status pages per organization
- **Uptime Monitoring** - Health checks with alerting
- **Workflow Automation** - Visual DAG builder with React Flow

## Tech Stack

| Component | Technology |
|-----------|------------|
| Dashboard | Next.js 14 (App Router) |
| Database | PostgreSQL + Drizzle ORM |
| Queue | BullMQ + Redis |
| Auth | NextAuth.js |
| AI | Anthropic Claude API |
| Agent | Rust (separate repo) |
| Styling | Tailwind CSS + shadcn/ui |

## Project Structure

```
syntra/
├── apps/
│   └── dashboard/          # Next.js dashboard & API
├── agents/
│   └── syntra-agent/       # Rust agent (BYOS)
├── infra/
│   └── docker/             # Docker configs
└── docs/
    ├── PRD.md              # Product Requirements
    └── DEVELOPMENT_PLAN.md # Development roadmap
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp apps/dashboard/.env.example apps/dashboard/.env.local

# Run database migrations
pnpm --filter @syntra/dashboard db:push

# Start development server
pnpm --filter @syntra/dashboard dev
```

## Current Milestone (v0.1.0-alpha)

### Completed
- [x] Server, Project, Service CRUD APIs
- [x] Deployment system with build queue
- [x] Agent WebSocket hub
- [x] AI error analysis API & UI
- [x] AI chat co-pilot with streaming
- [x] AI Dockerfile generator
- [x] Visual workflow builder (React Flow)
- [x] Public status page

### In Progress
- [ ] SDK (JavaScript, Python)
- [ ] ClickHouse integration for telemetry
- [ ] CLI tool (`syn`)

### Planned
- [ ] Distributed tracing / APM
- [ ] Log aggregation UI
- [ ] Smart cost dashboard
- [ ] Billing (Stripe)

## License

Proprietary - Catalystlabs
