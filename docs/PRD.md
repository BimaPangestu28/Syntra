# Syntra — Product Requirements Document (PRD)

**Version:** 2.0
**Date:** January 31, 2026
**Author:** Bima Pangestu — Catalystlabs
**Status:** Draft
**Classification:** Confidential

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision & Positioning](#3-product-vision--positioning)
4. [Target Audience](#4-target-audience)
5. [Business Model](#5-business-model)
6. [System Architecture](#6-system-architecture)
7. [Core Features — PaaS Platform](#7-core-features--paas-platform)
8. [Core Features — AI Ops Observability](#8-core-features--ai-ops-observability)
9. [SDK & Instrumentation](#9-sdk--instrumentation)
10. [Agent Specification](#10-agent-specification)
11. [Dashboard & User Interface](#11-dashboard--user-interface)
12. [Workflow Engine](#12-workflow-engine)
13. [Security & Compliance](#13-security--compliance)
14. [API Specification](#14-api-specification)
15. [Competitive Analysis](#15-competitive-analysis)
16. [Development Roadmap](#16-development-roadmap)
17. [Success Metrics & KPIs](#17-success-metrics--kpis)
18. [Risk Analysis](#18-risk-analysis)
19. [Technical Dependencies](#19-technical-dependencies)
20. [Onboarding & First-Time User Experience](#20-onboarding--first-time-user-experience)
21. [Go-to-Market Strategy](#21-go-to-market-strategy)
22. [Agent Failure Modes & Recovery](#22-agent-failure-modes--recovery)
23. [Migration & Data Portability](#23-migration--data-portability)
24. [Multi-Tenancy & Isolation Architecture](#24-multi-tenancy--isolation-architecture)
25. [Scalability Thresholds & Planning](#25-scalability-thresholds--planning)
26. [Testing & Quality Assurance Strategy](#26-testing--quality-assurance-strategy)
27. [Documentation & Developer Education](#27-documentation--developer-education)
28. [Open Source Strategy & Licensing](#28-open-source-strategy--licensing)
29. [Legal, Compliance & SLA Framework](#29-legal-compliance--sla-framework)
30. [Appendix](#30-appendix)

---

## 1. Executive Summary

### 1.1 Product Overview

Syntra is an **AI-powered Platform-as-a-Service (PaaS)** with a BYOS (Bring Your Own Server) model that combines application deployment, CI/CD workflows, and full-stack observability into a single platform. Users install a lightweight Rust agent (~8MB) on their own servers and manage everything from a centralized SaaS dashboard.

The platform uniquely integrates an **AI Ops co-pilot** that analyzes error logs, traces, metrics, and deployment history to provide actionable insights — explaining root causes, suggesting fixes, detecting anomalies, and optimizing resources. This replaces the need for separate tools like Sentry, Datadog, Grafana, and BetterStack.

### 1.2 Key Differentiators

- **AI DevOps Co-pilot** — LLM-powered error analysis, fix suggestions, anomaly detection, and natural language deployment. No self-hosted PaaS competitor offers AI features.
- **5-in-1 AI Ops Observability** — Error tracking, APM/traces, log aggregation, metrics, and uptime monitoring built into the PaaS. Eliminates need for 4+ separate tools.
- **Dual Runtime (Docker + Kubernetes)** — Single agent auto-detects and supports both runtimes. Users start with Docker, upgrade to Kubernetes without reconfiguration.
- **Visual Workflow Builder** — Drag-and-drop DAG pipeline editor for CI/CD. Not linear — supports parallel steps, conditional branches, manual approval gates.
- **Rust-Powered Agent** — Single binary ~8MB, ~15MB RAM. Significantly lighter than Node.js-based competitors (Coolify, Dokploy use ~1GB+ RAM for their control planes).
- **BYOS Cost Model** — Users pay for their own VPS ($5-20/mo) plus Syntra subscription ($9-19/server). 70-90% cheaper than Railway/Render at scale.

### 1.3 Target Outcome

Within 12 months of launch: 500+ registered users, 1,000+ connected servers, $15,000+ MRR, establishing Syntra as the first AI-native self-hosted PaaS.

---

## 2. Problem Statement

### 2.1 Primary Problems

**Problem 1: PaaS platforms are expensive at scale.**
Railway, Render, and Vercel charge $20-100+/month per service. A typical startup running 5 services pays $100-500/month for what could run on a $20 VPS. Developers are overpaying for convenience.

**Problem 2: Self-hosting is complex and fragmented.**
Developers who want to save money must manually configure Docker, Traefik, SSL, CI/CD, monitoring, and logging. Each requires separate tools (Coolify for deploy, Sentry for errors, Grafana for metrics, BetterStack for uptime). Average setup time: 2-5 days per server. Each tool has separate billing, separate dashboard, separate learning curve.

**Problem 3: No self-hosted PaaS has AI capabilities.**
Coolify and Dokploy provide basic deployment features but zero intelligence. When a deployment fails, developers must manually read logs, search Stack Overflow, and debug. There is no automated root cause analysis, no fix suggestions, no anomaly detection. This wastes 30-120 minutes per incident.

**Problem 4: Growing from Docker to Kubernetes requires platform migration.**
Small projects start with Docker on a single VPS. When they need scaling, they must migrate to a completely different platform (K8s-native tools like Portainer, Rancher). There is no gradual upgrade path.

### 2.2 User Pain Points (Validated)

| Pain Point | Evidence | Severity |
|------------|----------|----------|
| Railway/Vercel cost at scale | Reddit threads, HN discussions, blog posts comparing costs | High |
| Coolify/Dokploy lack AI features | No competitor has any AI integration | High |
| Fragmented observability stack | Users run 3-5 separate monitoring tools | High |
| No Docker-to-K8s migration path | GitHub issues requesting K8s support in Coolify/Dokploy | Medium |
| Complex CI/CD pipeline configuration | YAML-based pipelines are error-prone | Medium |
| Slow incident response without context | Average MTTR without AI assistance: 45-90 minutes | High |

---

## 3. Product Vision & Positioning

### 3.1 Vision Statement

> "Make deploying, monitoring, and debugging applications as simple as `git push` — powered by AI that understands your entire stack."

### 3.2 Positioning Statement

> Syntra is the **AI-powered PaaS that runs on YOUR servers** — delivering the Railway experience at self-hosting prices, with an AI co-pilot that understands your deployments, analyzes errors, and optimizes performance automatically.

### 3.3 One-Liner Pitches

- "Deploy like Railway. Pay like self-hosting. Debug like having a senior DevOps on call 24/7."
- "The only PaaS with an AI co-pilot that actually understands your deployments."
- "Sentry + Datadog + Grafana + Railway — all-in-one, AI-powered, on your own servers."

### 3.4 Elevator Pitch (30 seconds)

Syntra is a PaaS with an AI co-pilot that runs on your own servers. Install our tiny agent (8MB), connect it to our dashboard, and deploy apps as easily as Railway — but you only pay for your VPS.

What makes us different: AI that understands your deployments — it auto-analyzes error logs, generates Dockerfiles, detects anomalies, suggests fixes, and even lets you deploy via natural language. Plus a visual workflow builder for CI/CD pipelines without writing YAML.

Start free, scale to Kubernetes whenever you are ready, no vendor lock-in.

---

## 4. Target Audience

### 4.1 Primary Personas

**Persona 1: Indie Developer / Solo Maker**
- Profile: Building side projects or SaaS products solo. Runs 1-3 servers.
- Current tools: Railway free tier, Dokploy, or manual Docker + SSH.
- Pain: Railway gets expensive past free tier. Manual DevOps wastes time.
- Hook: Free tier + BYOS = $5/mo VPS instead of $50/mo Railway.
- Willingness to pay: $9/month for Pro.

**Persona 2: Small Team (2-10 developers)**
- Profile: Startup or agency running multiple projects. 2-5 servers.
- Current tools: Mix of Coolify/Dokploy + Sentry + UptimeRobot.
- Pain: Fragmented tools, no team features, no CI/CD workflows.
- Hook: One platform, RBAC, visual workflows, built-in observability.
- Willingness to pay: $19/server/month for Team plan.

**Persona 3: Growing Startup (10-50 developers)**
- Profile: Outgrowing Railway/Heroku. Need staging/production environments.
- Current tools: Railway Pro or AWS + lots of DevOps effort.
- Pain: Railway too expensive. AWS too complex. No middle ground.
- Hook: Start Docker, grow to Kubernetes. Environment promotion. AI DevOps assistant.
- Willingness to pay: $19-49/server/month for Team/Enterprise.

**Persona 4: Agency / Freelancer**
- Profile: Managing 5-20 client projects on different servers.
- Current tools: Manual Docker deploy per client. No central management.
- Pain: Repetitive setup. No unified dashboard. Client handoff is messy.
- Hook: One dashboard for all clients. Per-project isolation. Template marketplace.
- Willingness to pay: $9/server/month × 5-20 servers.

### 4.2 Secondary Personas

**Persona 5: DevOps Engineer**
- Looking for lightweight alternative to full Kubernetes management platforms.
- Hook: Rust agent performance, Terraform provider, API-first design.

**Persona 6: AI/ML Developer**
- Deploying AI applications (FastAPI + model serving).
- Hook: AI understands AI apps — auto-detect GPU requirements, optimize inference containers.

### 4.3 Market Size Estimation

- Global PaaS market (2025): ~$180 billion, growing 20% YoY.
- Self-hosted PaaS niche: Coolify has ~45K GitHub stars, Dokploy ~30K stars.
- Estimated addressable market (BYOS PaaS with AI): ~50,000-100,000 potential users.
- Revenue potential at 5% capture: 2,500-5,000 users × $15 avg/month = $37,500-75,000 MRR.

---

## 5. Business Model

### 5.1 Revenue Model: SaaS Subscription (Per-Server)

Users pay for their own VPS infrastructure separately. Syntra charges a monthly subscription per connected server for access to the platform, AI features, and observability.

### 5.2 Pricing Tiers

| Feature | Free | Pro ($9/server/mo) | Team ($19/server/mo) | Enterprise (Custom) |
|---------|------|---------------------|----------------------|---------------------|
| Servers | 1 | Unlimited | Unlimited | Unlimited |
| Projects | 3 | Unlimited | Unlimited | Unlimited |
| Runtime | Docker only | Docker + K8s | Docker + K8s | Docker + K8s |
| Registry storage | 500MB | 5GB | 20GB | Unlimited |
| **Observability** | | | | |
| Error tracking | 1K events/day | 50K events/day | 500K events/day | Unlimited |
| Traces / APM | 5K spans/day | 500K spans/day | 5M spans/day | Unlimited |
| Log retention | 1 day | 7 days | 30 days | 90 days |
| Metrics retention | 1 day | 7 days | 30 days | 90 days |
| Health checks | 5 min interval | 1 min interval | 30 sec interval | 10 sec interval |
| **AI Features** | | | | |
| AI error analysis | 5/day | Unlimited | Unlimited | Unlimited |
| AI anomaly detection | — | Basic | Advanced | Custom models |
| AI fix suggestions | — | Yes | Yes | Yes |
| AI Dockerfile gen | 3/day | Unlimited | Unlimited | Unlimited |
| AI resource advisor | — | Weekly digest | Real-time | Real-time + custom |
| Natural language deploy | — | — | Yes | Yes |
| **Workflows** | | | | |
| Visual workflow builder | — | Yes | Yes | Yes |
| Environment promotion | — | — | Yes | Yes |
| Approval gates | — | — | Yes | Yes |
| Canary / blue-green | — | — | — | Yes |
| **Team** | | | | |
| Users | 1 | 1 | Unlimited | Unlimited |
| RBAC | — | — | Yes | Yes |
| SSO / SAML | — | — | — | Yes |
| Audit log | — | Basic | Full | Full + export |
| **Support** | | | | |
| Support channel | Community | Email | Priority email | Dedicated + SLA |
| Public status page | — | — | Yes | Yes |
| Custom domains | 1 | Unlimited | Unlimited | Unlimited |
| Deploy notifications | — | Slack, Telegram | All channels | All + custom |
| Backup & restore | — | Manual | Scheduled | Scheduled + PITR |

### 5.3 Revenue Projections

| Timeline | Users | Avg Servers | Avg Revenue/User | MRR | ARR |
|----------|-------|-------------|------------------|-----|-----|
| Month 3 | 50 | 1.5 | $9 | $675 | $8,100 |
| Month 6 | 200 | 2.0 | $11 | $4,400 | $52,800 |
| Month 12 | 500 | 2.5 | $13 | $16,250 | $195,000 |
| Month 18 | 1,200 | 3.0 | $14 | $50,400 | $604,800 |
| Month 24 | 3,000 | 3.0 | $15 | $135,000 | $1,620,000 |

### 5.4 Cost Structure

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| Control plane hosting | $50-200 | Hetzner/DO for API, dashboard, DB |
| Build servers | $50-100 | Docker build workers (scalable) |
| Docker registry (Harbor) | $20-50 | S3-backed storage |
| Database (PostgreSQL) | $20-50 | Managed or self-hosted |
| Redis | $10-20 | Caching, queues |
| ClickHouse | $30-100 | Telemetry storage (scales with usage) |
| LLM API (Claude/GPT) | $100-500 | ~$0.01-0.05 per AI analysis |
| CloudFlare | $0-20 | DNS, CDN, DDoS protection |
| Monitoring (internal) | $0-20 | Self-hosted Prometheus/Grafana |
| **Total** | **$280-1,060** | |

Gross margin at 500 users: Revenue $16,250 - Costs ~$1,000 = **93.8% gross margin.**

---

## 6. System Architecture

### 6.1 Architecture Overview

Syntra follows a **Control Plane / Data Plane split architecture**:

- **Control Plane (SaaS)** — Hosted by Syntra. Dashboard, API, build system, registry, billing, AI engine, telemetry ingestion. Users access via browser.
- **Data Plane (User's servers)** — Lightweight Rust agent installed on user's VPS. Manages containers/pods, collects telemetry, executes deployments. Connects outbound to control plane via WebSocket.

```
┌─────────────────────────────────────────────────────────────────┐
│                      CONTROL PLANE (SaaS)                       │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Next.js  │  │  Build   │  │ Docker   │  │  AI Engine    │  │
│  │Dashboard │  │  Queue   │  │ Registry │  │  (LLM API)    │  │
│  │ + API    │  │ (BullMQ) │  │ (Harbor) │  │               │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │              │                │          │
│  ┌────┴──────────────┴──────────────┴────────────────┴───────┐  │
│  │                    PostgreSQL + Redis                      │  │
│  │                    ClickHouse (Telemetry)                  │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │              WebSocket Hub (Agent Connections)             │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │ WSS (outbound from agent)
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────┴───────┐  ┌───────────┴───────┐  ┌──────────┴────────┐
│  DATA PLANE   │  │   DATA PLANE      │  │   DATA PLANE      │
│  (Server A)   │  │   (Server B)      │  │   (Server C)      │
│               │  │                   │  │                   │
│ ┌───────────┐ │  │ ┌───────────────┐ │  │ ┌───────────────┐ │
│ │Rust Agent │ │  │ │  Rust Agent   │ │  │ │  Rust Agent   │ │
│ │ + Docker  │ │  │ │  + K8s (K3s)  │ │  │ │  + Docker     │ │
│ │ + OTLP Rx │ │  │ │  + OTLP Rx    │ │  │ │  + OTLP Rx    │ │
│ │ + Traefik │ │  │ │  + Traefik    │ │  │ │  + Traefik    │ │
│ └───────────┘ │  │ └───────────────┘ │  │ └───────────────┘ │
│               │  │                   │  │                   │
│ [App1] [App2] │  │ [App3] [DB1]     │  │ [App4] [App5]    │
└───────────────┘  └───────────────────┘  └───────────────────┘
```

### 6.2 Control Plane Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Web Dashboard | Next.js 14 (App Router) | UI for projects, deployments, monitoring, billing |
| API Routes | Next.js API + tRPC | REST/WebSocket API for agent communication & dashboard |
| Agent Hub | WebSocket server (ws) | Persistent connections to all agents. Command routing. |
| Build Queue | BullMQ + Redis | Queue and process build jobs (Docker image builds) |
| Build Workers | Docker-in-Docker | Execute Dockerfile/Nixpacks builds. Horizontal scaling. |
| Docker Registry | Harbor / Distribution | Private registry for built images. S3-backed storage. |
| Workflow Engine | Custom DAG executor | Execute deployment pipelines (build → test → deploy) |
| Auth | NextAuth.js | GitHub/Google OAuth. API tokens. Agent certificates. |
| Database | PostgreSQL (Drizzle ORM) | Users, servers, projects, services, deployments, issues |
| Cache/Queue | Redis | Session cache, build queue, real-time pub/sub |
| Telemetry Ingest | Axum (Rust) or Next.js API | Receive OTLP data from agents. Rate limiting. |
| Telemetry Storage | ClickHouse | Time-series storage for traces, logs, metrics |
| AI Engine | Claude/GPT API | Error analysis, anomaly detection, fix suggestions |
| AI Cache | Redis + PostgreSQL | Cache AI analysis per error fingerprint. 7-day TTL. |
| Alert Engine | Custom + Redis pub/sub | Rule-based + AI-driven alerting. Multi-channel delivery. |
| Billing | Stripe | Subscription management, invoicing, usage tracking |
| CDN/DNS | CloudFlare | Global CDN, DDoS protection, DNS management |

### 6.3 Data Plane Components (Rust Agent)

| Component | Crate / Tech | Purpose |
|-----------|-------------|---------|
| CLI Entry | clap | Agent binary CLI: install, start, configure, status |
| WebSocket Client | tokio-tungstenite | Persistent connection to control plane. Auto-reconnect. |
| Runtime Adapter (Docker) | bollard | Docker API: deploy, stop, scale, logs, exec, metrics |
| Runtime Adapter (K8s) | kube-rs | K8s API: Deployment, Service, Ingress CRUD |
| OTLP Receiver | tonic (gRPC) + axum (HTTP) | Receive telemetry from app SDKs on localhost:4317/4318 |
| Log Collector | Docker log driver hooks | Capture stdout/stderr from containers/pods |
| Metrics Scraper | Custom + prometheus-parse | Scrape /metrics endpoints. System metrics via /proc. |
| Health Checker | reqwest | HTTP/TCP health probes per service. Record latency. |
| Buffer / Batcher | Ring buffer + zstd | Buffer telemetry locally. Batch + compress before send. |
| Sampling Engine | Adaptive rate limiter | Sample traces (10-100%). Keep 100% errors. |
| Traefik Config | Template engine | Generate/update Traefik dynamic config for routing + SSL |
| Auto-Update | Self-replace binary | Check for updates, download, replace, restart |
| Certificate | rustls | mTLS with control plane. Unique cert per agent. |

### 6.4 Database Schema (Core Entities)

```
users
├── id (uuid, PK)
├── email, name, avatar_url
├── plan (enum: free, pro, team, enterprise)
├── stripe_customer_id
└── created_at, updated_at

organizations
├── id (uuid, PK)
├── name, slug
├── owner_id (FK → users)
└── created_at

org_members
├── org_id (FK → organizations)
├── user_id (FK → users)
├── role (enum: owner, admin, developer, viewer)
└── invited_at, accepted_at

servers
├── id (uuid, PK)
├── org_id (FK → organizations)
├── name, hostname, ip_address
├── runtime (enum: docker, kubernetes)
├── agent_version, agent_status (enum: online, offline, updating)
├── os, arch, cpu_cores, memory_mb, disk_gb
├── last_heartbeat_at
├── agent_token_hash
└── created_at

projects
├── id (uuid, PK)
├── org_id (FK → organizations)
├── name, slug, description
├── git_repo_url, git_branch, git_provider
└── created_at

services
├── id (uuid, PK)
├── project_id (FK → projects)
├── server_id (FK → servers)
├── name, type (enum: app, database, worker, cron)
├── source_type (enum: dockerfile, nixpacks, image, docker_compose)
├── dockerfile_path, build_context
├── image_name, image_tag
├── port, replicas
├── cpu_limit, memory_limit
├── env_vars (jsonb, encrypted)
├── domains (jsonb)
├── health_check_path, health_check_interval
├── auto_deploy (boolean)
└── created_at, updated_at

deployments
├── id (uuid, PK)
├── service_id (FK → services)
├── status (enum: queued, building, pushing, deploying, running, failed, rolled_back)
├── git_commit_sha, git_commit_message
├── image_digest
├── build_duration_ms, deploy_duration_ms
├── build_logs (text)
├── triggered_by (FK → users, nullable)
├── trigger_type (enum: manual, git_push, workflow, rollback, api)
├── error_message
└── created_at, finished_at

workflows
├── id (uuid, PK)
├── project_id (FK → projects)
├── name, description
├── definition (jsonb) — DAG structure
├── trigger (enum: manual, git_push, schedule, api)
├── cron_expression
└── created_at, updated_at

workflow_runs
├── id (uuid, PK)
├── workflow_id (FK → workflows)
├── status (enum: running, completed, failed, cancelled, waiting_approval)
├── started_at, finished_at
├── triggered_by (FK → users)
└── step_results (jsonb)

--- OBSERVABILITY TABLES ---

error_groups (issues)
├── id (uuid, PK)
├── service_id (FK → services)
├── fingerprint (varchar, unique per service)
├── title, type (exception type)
├── status (enum: unresolved, resolved, ignored, regressed)
├── severity (enum: critical, high, medium, low)
├── first_seen_at, last_seen_at
├── event_count, user_count
├── assigned_to (FK → users, nullable)
├── ai_analysis (jsonb) — cached AI explanation + fix
├── ai_analyzed_at
└── created_at

error_events
├── id (uuid, PK)
├── error_group_id (FK → error_groups)
├── deployment_id (FK → deployments, nullable)
├── stack_trace (text)
├── breadcrumbs (jsonb)
├── context (jsonb) — browser, os, user, tags, extra
├── environment
├── release
└── timestamp

health_checks
├── id (bigserial, PK)
├── service_id (FK → services)
├── status_code, response_time_ms
├── is_healthy (boolean)
└── checked_at

alerts
├── id (uuid, PK)
├── org_id (FK → organizations)
├── service_id (FK → services, nullable)
├── type (enum: error_rate, latency, downtime, anomaly, custom)
├── condition (jsonb) — threshold rules
├── channels (jsonb) — slack, telegram, email, webhook configs
├── is_active (boolean)
└── created_at

alert_incidents
├── id (uuid, PK)
├── alert_id (FK → alerts)
├── status (enum: firing, resolved)
├── message, details (jsonb)
├── ai_summary (text)
├── fired_at, resolved_at
└── acknowledged_by (FK → users, nullable)

--- CLICKHOUSE TABLES (time-series, separate database) ---

traces (ClickHouse)
├── trace_id, span_id, parent_span_id
├── service_id, deployment_id
├── operation_name, span_kind
├── start_time, duration_ns
├── status_code, status_message
├── attributes (Map(String, String))
└── resource_attributes (Map(String, String))

logs (ClickHouse)
├── timestamp
├── service_id, deployment_id
├── level (enum: trace, debug, info, warn, error, fatal)
├── message, body
├── attributes (Map(String, String))
├── trace_id, span_id (for correlation)
└── source (enum: stdout, stderr, sdk)

metrics (ClickHouse / TimescaleDB)
├── timestamp
├── service_id, server_id
├── metric_name (e.g., http_request_duration, cpu_usage)
├── metric_type (enum: gauge, counter, histogram)
├── value (Float64)
├── labels (Map(String, String))
└── -- Downsampled: 1s → 1min → 1hr for older data
```

### 6.5 Deployment Data Flow

```
1. Developer: git push to GitHub
         │
2. GitHub Webhook → Control Plane API
         │
3. Build Queue (BullMQ) → Build Worker picks up job
         │
4. Build Worker: docker build → image tagged with commit SHA
         │
5. Push image → Private Registry (Harbor)
         │
6. Workflow Engine: execute pipeline steps (test → deploy)
         │
7. Control Plane → Agent (via WebSocket): Deploy command
   { type: "deploy", image: "registry.syntra.dev/proj/svc:abc123",
     replicas: 2, env: {...}, health_check: "/health" }
         │
8. Agent: Pull image from registry
         │
9. Agent (Docker): docker stop old → docker run new + Traefik labels
   Agent (K8s): kubectl apply Deployment + Service + IngressRoute
         │
10. Agent: Health check loop until healthy or timeout
          │
11. Agent → Control Plane: Status update (success/failure)
          │
12. Dashboard: Shows ✅ Deployed (or ❌ Failed + AI Analysis trigger)
```

### 6.6 Telemetry Data Flow

```
1. User's App: SDK captures error / trace / log / metric
         │
2. SDK → localhost:4317 (gRPC OTLP) or localhost:4318 (HTTP OTLP)
         │ (stays on same server, no external network)
         │
3. Agent OTLP Receiver: Receive, validate, enrich with metadata
   Add: service_id, server_id, deployment_id, environment
         │
4. Agent Buffer: Ring buffer (max 50MB), batch every 5s or 1000 events
         │
5. Agent → Control Plane: Compressed (zstd) batch via WebSocket
         │
6. Ingestion Gateway: Auth, rate limit, decompress, route to processors
         │
7. Event Processor:
   ├── Errors: Fingerprint → group → deduplicate → store in PostgreSQL
   ├── Traces: Parse spans → store in ClickHouse
   ├── Logs: Parse structured → index → store in ClickHouse
   └── Metrics: Aggregate → store in ClickHouse/TimescaleDB
         │
8. AI Analyzer (async, triggered by):
   ├── New error group → explain root cause + suggest fix
   ├── Error rate spike → correlate with deploys + identify regression
   ├── Anomaly detected → explain deviation + recommend action
   └── Weekly digest → performance advisor report
         │
9. Alert Engine: Evaluate rules → fire alerts to configured channels
         │
10. Dashboard: Real-time updates via WebSocket → Issues, Traces, Logs, Metrics views
```

---

## 7. Core Features — PaaS Platform

### 7.1 Server Management

**FR-7.1.1: One-Liner Agent Installation**
- Dashboard generates unique install command with embedded token.
- Command: `curl -fsSL https://get.syntra.dev | sh -s -- --token=syn_tkn_xxx --endpoint=wss://api.syntra.dev`
- Script auto-installs Docker (if not present), downloads agent binary, registers systemd service, installs Traefik, connects to control plane.
- Agent auto-detects runtime: checks for `kubectl` → Kubernetes mode, otherwise Docker mode.
- Target: server online in dashboard within 120 seconds of running install script.

**FR-7.1.2: Server Dashboard**
- Real-time status: online/offline, CPU/RAM/disk usage, uptime.
- Connected services list with health status.
- Runtime type display (Docker/Kubernetes).
- Agent version with one-click update.
- Terminal access (web shell) for debugging.

**FR-7.1.3: Multi-Server Management**
- Add unlimited servers (per plan limits).
- Group servers by tags/labels.
- Assign services to specific servers.
- Cross-server overview dashboard.

### 7.2 Project & Service Management

**FR-7.2.1: Project Creation**
- Create project with name, description.
- Connect Git repository (GitHub, GitLab, Bitbucket).
- Auto-detect framework (Next.js, FastAPI, Django, Go, Rust, Rails, Laravel, etc.).
- Suggest optimal build strategy (Dockerfile, Nixpacks, Buildpack).

**FR-7.2.2: Service Configuration**
- Source types: Dockerfile, Nixpacks, Docker image, Docker Compose.
- Resource limits: CPU, memory, replicas.
- Port mapping and domain configuration.
- Environment variables (encrypted at rest, AES-256).
- Health check configuration (path, interval, timeout, retries).
- Auto-deploy toggle (on git push).

**FR-7.2.3: Service Inter-Linking**
- Reference other services in environment variables: `${{postgres.DATABASE_URL}}`, `${{redis.REDIS_URL}}`.
- Auto-resolve internal DNS: `service-name.project.internal`.
- Project-level shared variables: `${{project.SHARED_SECRET}}`.
- Automatic connection string generation for databases.

**FR-7.2.4: Database Services**
- One-click provisioning: PostgreSQL, MySQL, MongoDB, Redis, MariaDB.
- Auto-generated credentials.
- Connection string auto-injection to dependent services.
- Backup configuration (manual, scheduled).

### 7.3 Deployment

**FR-7.3.1: Git-Based Deployment**
- GitHub webhook integration (auto-deploy on push).
- Branch-based environments (main → production, develop → staging).
- Pull request preview environments (auto-create, auto-destroy).
- GitLab and Bitbucket webhook support.

**FR-7.3.2: Build System**
- Docker build workers (horizontal scaling).
- Nixpacks auto-detection (like Railway).
- Build caching (Docker layer cache, npm/pip cache).
- Multi-stage build support.
- Build time limit (15 min default, configurable).
- Build log streaming in real-time.

**FR-7.3.3: Deployment Strategies**
- Rolling update (default): replace containers one by one.
- Instant: stop old, start new (for development).
- Blue-green: run both versions, switch traffic atomically (Team+).
- Canary: route X% traffic to new version, gradually increase (Enterprise).

**FR-7.3.4: Rollback**
- One-click rollback to any previous deployment.
- Keep last 10 images per service.
- Auto-rollback on health check failure (configurable).
- Rollback preserves environment variables of target deployment.

**FR-7.3.5: Preview Environments**
- Automatic deployment per pull request.
- Unique URL: `pr-42.preview.myapp.com`.
- Shared database or isolated database (configurable).
- Auto-destroy on PR merge/close.
- Comment on PR with preview URL.

### 7.4 Networking & Routing

**FR-7.4.1: Traefik Reverse Proxy (Agent-managed)**
- Auto-configured per service deployment.
- Dynamic routing rules based on domain/path.
- Automatic Let's Encrypt SSL certificates.
- Wildcard SSL support.
- HTTP → HTTPS redirect.
- WebSocket proxy support.

**FR-7.4.2: Custom Domains**
- Add custom domains to any service.
- DNS verification (CNAME or A record).
- SSL auto-provisioning.
- Wildcard domain support.

### 7.5 CLI Tool (`syn`)

**FR-7.5.1: Commands**
- `syn login` — Authenticate with API token.
- `syn deploy` — Trigger deployment from local directory.
- `syn logs <service>` — Tail logs in real-time.
- `syn status` — Show service/server status.
- `syn env set/get/list` — Manage environment variables.
- `syn exec <service> <command>` — Execute command in running container.
- `syn rollback <service>` — Rollback to previous deployment.
- `syn tunnel <port>` — Expose localhost to public URL (like ngrok).

**FR-7.5.2: Implementation**
- Written in Rust for performance.
- Shell autocomplete (bash, zsh, fish).
- Colored output, interactive prompts.
- Config file: `~/.syntra/config.toml`.

---

## 8. Core Features — AI Ops Observability

This is the primary differentiator. Syntra ships a **5-in-1 observability stack** integrated directly into the PaaS, powered by AI analysis.

### 8.1 Error Tracking

**FR-8.1.1: Error Capture**
- SDK auto-captures: uncaught exceptions, unhandled promise rejections, panic hooks (Rust).
- Manual capture: `Syntra.captureException(error, context)`.
- Stack trace with source map support (JavaScript).
- Breadcrumbs: last 100 events before error (HTTP requests, user actions, console logs).
- Context: user info, tags, extra data, environment, release/deployment ID.

**FR-8.1.2: Error Grouping (Issues)**
- Smart fingerprinting: group by exception type + normalized message + top stack frames.
- Deduplication: same error = increment count, not new event.
- Issue states: unresolved, resolved, ignored, regressed.
- Regression detection: resolved issue re-occurs → auto-reopen with notification.
- Track per issue: first seen, last seen, event count, affected users, affected deployments.

**FR-8.1.3: Issue Detail View**
- Stack trace with syntax-highlighted code context.
- Breadcrumb timeline.
- Affected deployments (correlate error with specific deploy).
- Event history (browse individual occurrences).
- Tags and frequency distribution.
- Assignment to team members.
- Comments/notes.

**FR-8.1.4: AI Error Analysis (USP)**
- Trigger: automatically on new error group creation.
- AI receives: stack trace, source code context (if available), breadcrumbs, recent deploy diff, environment info, similar past errors and their fixes.
- AI produces:
  - **Root cause explanation** in plain language.
  - **Why now** — what changed (correlate with recent deploys).
  - **Suggested fix** — code snippet if applicable.
  - **Severity assessment** — impact analysis.
  - **Affected scope** — which users/routes/deployments.
- Cached per error fingerprint. Re-analyze on new deploy.
- Cost: ~$0.01-0.05 per analysis (Claude Haiku for speed, Sonnet for depth).

Example AI output:
```
Root Cause: The /api/dashboard endpoint returns { data: null } when the auth
token expires, but the frontend destructures response.data.user without
null checking.

Why Now: Deploy v2.14 (commit abc123, 2 hours ago) changed auth middleware
to return null body instead of throwing 401 on expired tokens.

Suggested Fix:
  const user = response.data?.user ?? redirectToLogin();

Affected: 342 users in last hour, all accessing /dashboard route.
Severity: HIGH — core user flow impacted.
```

### 8.2 APM / Performance Monitoring

**FR-8.2.1: Distributed Tracing**
- OpenTelemetry-based trace collection.
- Auto-instrumentation: HTTP requests, database queries, external API calls, queue processing.
- Distributed tracing across services (propagate trace context via headers).
- Trace waterfall visualization (Jaeger-like).
- Span details: operation, duration, status, attributes, linked logs/errors.

**FR-8.2.2: Performance Metrics**
- Request rate (requests/second per service).
- Latency percentiles: p50, p75, p90, p95, p99.
- Error rate (% of requests returning 4xx/5xx).
- Throughput and saturation.
- Apdex score.

**FR-8.2.3: Slow Transaction Detection**
- Auto-detect slow endpoints (p95 > threshold).
- Breakdown: time spent in application code vs. database vs. external calls.
- N+1 query detection.
- Database query analysis.

**FR-8.2.4: AI Performance Advisor (USP)**
- Weekly automated performance report per service.
- Identifies top optimization opportunities ranked by impact.
- Provides specific fix suggestions with estimated improvement.
- Example: "Add index on products.name — reduces /api/search from 1.2s to 15ms (-99%)."
- On-demand: ask AI to analyze specific endpoint performance.

### 8.3 Log Aggregation

**FR-8.3.1: Log Collection**
- Auto-collect: stdout/stderr from all containers/pods (via agent).
- SDK logs: structured log integration (auto-correlate with traces).
- Parse structured logs (JSON) — extract fields for filtering.
- Unstructured logs: full-text search.

**FR-8.3.2: Log Explorer UI**
- Full-text search with field-based filters (level, service, deployment, keyword).
- Time-range picker.
- Live tail mode (real-time streaming).
- Click log entry → jump to related trace/error.
- Syntax highlighting for JSON logs.
- Download/export logs.

**FR-8.3.3: Log Retention**
- Retention per plan: 1 day (Free), 7 days (Pro), 30 days (Team), 90 days (Enterprise).
- Compressed storage in ClickHouse.
- Auto-cleanup of expired logs.

### 8.4 Infrastructure Metrics

**FR-8.4.1: System Metrics**
- CPU usage (per core, total) — collected from /proc/stat.
- Memory usage (used, cached, available) — collected from /proc/meminfo.
- Disk I/O (read/write bytes, IOPS) — collected from /proc/diskstats.
- Network I/O (rx/tx bytes, packets) — collected from /proc/net/dev.
- Container-level metrics via Docker stats API or cAdvisor.

**FR-8.4.2: Application Metrics**
- Prometheus /metrics endpoint scraping (configurable per service).
- Custom metrics via SDK.
- Auto-derived: request rate, error rate, latency from traces.

**FR-8.4.3: Metrics Dashboard**
- Time-series charts with configurable time range.
- Per-service, per-server breakdown.
- Deploy markers overlaid on timelines (visualize impact of deploys).
- Custom dashboard layout (drag and resize charts).

**FR-8.4.4: AI Anomaly Detection (USP)**
- Baseline learning: 7-day rolling baseline per metric, per service.
- Anomaly detection: statistical deviation from baseline (Z-score + trend analysis).
- No manual threshold configuration needed (but overridable).
- AI explanation: when anomaly detected, AI explains likely cause by correlating with recent deploys, error rates, and other metrics.
- Auto-resolve: anomaly that returns to baseline → auto-close.

### 8.5 Uptime & Health Monitoring

**FR-8.5.1: Health Checks**
- HTTP health checks: GET request to configured path, verify status code.
- TCP health checks: port connectivity.
- Configurable: interval (30s-5min), timeout (5-30s), retries (1-5).
- Status: healthy, degraded (intermittent failures), down.

**FR-8.5.2: Uptime Tracking**
- Calculate uptime percentage per service (rolling 30/90 days).
- Response time tracking (latency of health check).
- Downtime incident tracking with timeline.

**FR-8.5.3: Public Status Page (USP)**
- Auto-generated status page: `status.myapp.com` or `myapp.syntra.dev/status`.
- Current status per service (operational, degraded, major outage).
- Uptime percentage display (30-day, 90-day).
- Incident history with timeline.
- Embeddable status badge (SVG).
- No configuration needed — derives from health check data.

### 8.6 Alerting

**FR-8.6.1: Alert Rules**
- Threshold-based: error rate > X%, latency p95 > Xms, service down for > X minutes.
- AI anomaly-based: automatically detect unusual patterns without manual rules.
- Composite: combine multiple conditions (error rate > 5% AND latency > 2s).
- Per-service or per-project scope.

**FR-8.6.2: Alert Channels**
- Slack (webhook + rich formatting).
- Telegram (bot API).
- Discord (webhook).
- Email (SMTP).
- Generic webhook (POST with JSON payload).
- PagerDuty (integration key).

**FR-8.6.3: Alert Lifecycle**
- Firing → Acknowledged → Resolved.
- Auto-resolve when condition returns to normal.
- Snooze/mute for maintenance windows.
- Escalation: if not acknowledged in X minutes, escalate to next channel.

**FR-8.6.4: AI Incident Summary (USP)**
- When alert fires, AI generates incident summary: what happened, when, likely cause, impact, recommended action.
- Auto-posted to alert channel alongside the alert.
- Saves 15-30 minutes of manual investigation per incident.

### 8.7 Smart Cost Dashboard (USP)

**FR-8.7.1: Per-Service Cost Tracking**
- Collect resource usage (CPU-hours, RAM-hours, storage, bandwidth) per service.
- Map to VPS provider pricing (Hetzner, DigitalOcean, AWS rate cards).
- Display: "This service costs approximately $X.XX/month to run."
- Historical cost trend chart.

**FR-8.7.2: Cost Comparison**
- Show: "This workload would cost $X/month on Railway, $Y/month on Render. On your VPS: $Z/month."
- Savings calculator with real numbers.

**FR-8.7.3: AI Resource Recommender**
- After 48 hours of data: analyze usage patterns.
- Recommend rightsizing: "Service allocates 512MB RAM but p95 usage is 180MB. Safe to reduce to 256MB."
- Estimated savings per recommendation.
- One-click apply recommendation.

### 8.8 AI Co-pilot Chat (USP)

**FR-8.8.1: Natural Language Query**
- Chat interface in dashboard sidebar: "Ask AI about this service."
- User asks: "Why did error rate spike at 3pm?" → AI correlates metrics + deploys + errors → explains.
- User asks: "What's causing slow response times for Indonesian users?" → AI analyzes traces by region → identifies latency sources.
- Full telemetry context available to AI (errors, traces, logs, metrics, deploy history).
- Streaming response (like ChatGPT interface).

**FR-8.8.2: Natural Language Deploy (Team+)**
- "Deploy my-api to production with 2 replicas and 512MB RAM."
- AI parses intent → maps to API calls → shows confirmation → executes.
- Available via: dashboard chat, Slack bot, Telegram bot.
- Safety: always show confirmation before executing destructive actions.

**FR-8.8.3: AI Dockerfile Generator**
- Connect Git repository → AI analyzes codebase.
- Auto-detect: package.json, requirements.txt, Cargo.toml, go.mod, Gemfile, etc.
- Generate optimized Dockerfile with: multi-stage builds, layer caching, security best practices (non-root user, minimal base image).
- Support all major frameworks: Next.js, FastAPI, Django, Rails, Laravel, Go, Rust, etc.
- User can review and edit before applying.

---

## 9. SDK & Instrumentation

### 9.1 SDK Overview

Syntra provides lightweight SDKs for popular languages. The SDK auto-instruments common operations and sends telemetry to the agent's OTLP receiver on localhost.

### 9.2 Supported Languages

| Language | Package | Framework Support |
|----------|---------|-------------------|
| JavaScript/TypeScript | `@syntra/sdk` | Next.js, Express, Fastify, NestJS, Hono |
| Python | `syntra-sdk` | FastAPI, Django, Flask, Celery |
| Rust | `syntra-sdk` (crate) | Actix-web, Axum, Rocket |
| Go | `github.com/syntra-dev/sdk-go` | Chi, Gin, Echo, net/http |

### 9.3 SDK Design Principles

1. **2-line setup** — `import` + `init()`. Everything else is automatic.
2. **Auto-instrumentation** — HTTP requests, database queries, framework hooks require zero manual code.
3. **OpenTelemetry native** — Export via OTLP protocol. Compatible with existing OTel instrumentation.
4. **Tiny footprint** — JS: ~5KB gzipped. Python: ~50KB. Rust: zero-cost abstractions.
5. **Deploy-aware** — Auto-attach `deploy_id`, `git_commit`, `environment`. Correlate errors with deployments.
6. **Breadcrumbs** — Auto-capture: HTTP requests, console.log, user actions. Provide context for error debugging.
7. **Graceful degradation** — SDK never crashes the host app. If agent is unreachable, buffer locally and retry.
8. **Privacy-first** — No PII collected by default. User opt-in for user context.

### 9.4 SDK Configuration

```javascript
Syntra.init({
  dsn: 'syn://proj_abc123@ingest.syntra.dev', // Project-specific DSN

  // Environment
  environment: process.env.NODE_ENV,   // 'production', 'staging', 'development'
  release: process.env.DEPLOY_ID,      // Auto-injected by agent at deploy time

  // Sampling
  tracesSampleRate: 0.2,       // 20% of requests traced (configurable)
  profilesSampleRate: 0.1,     // 10% of traces profiled
  errorsSampleRate: 1.0,       // 100% of errors captured (recommended)

  // Auto-instrumentation toggles
  integrations: {
    http: true,          // Outgoing HTTP calls
    database: true,      // Prisma, Drizzle, SQLAlchemy, etc.
    framework: true,     // Next.js, FastAPI, etc.
    console: true,       // console.log/warn/error as breadcrumbs
  },

  // Privacy
  sendDefaultPii: false,       // Don't auto-collect PII
  beforeSend: (event) => {     // Hook to scrub sensitive data
    delete event.user?.email;
    return event;
  },
});
```

### 9.5 SDK API Surface

| Method | Purpose |
|--------|---------|
| `init(config)` | Initialize SDK with DSN and configuration |
| `captureException(error, context?)` | Manually capture an error with optional context |
| `captureMessage(message, level?)` | Capture a log message (info, warning, error) |
| `startSpan(name, options?)` | Start a custom performance span |
| `setUser(user)` | Set user context (id, email, plan) for error correlation |
| `addBreadcrumb(breadcrumb)` | Add manual breadcrumb for debugging context |
| `setTag(key, value)` | Set persistent tag on all events |
| `setExtra(key, value)` | Set extra data on all events |
| `flush(timeout?)` | Force flush pending events (call before process exit) |

### 9.6 OpenTelemetry Compatibility

- SDK exports via standard OTLP protocol (gRPC on port 4317, HTTP on port 4318).
- Users with existing OpenTelemetry instrumentation can point their OTLP exporter to the agent without installing the Syntra SDK.
- Agent accepts standard OTLP payloads and enriches with Syntra metadata (service_id, deploy_id).
- This means any language with an OTel SDK works with Syntra out of the box.

---

## 10. Agent Specification

### 10.1 Agent Overview

The agent is a single Rust binary that runs on the user's server as a systemd service. It handles deployments, telemetry collection, health checks, and reverse proxy configuration.

### 10.2 Binary Specification

| Property | Value |
|----------|-------|
| Language | Rust (2024 edition) |
| Async runtime | Tokio |
| Binary size | ~8MB (stripped, statically linked with musl) |
| Memory usage | ~15MB idle, ~30MB under load |
| CPU usage | <1% idle, <5% during deployment |
| Platforms | linux/amd64, linux/arm64 |
| Dependencies | None (statically linked) |
| Process manager | systemd (auto-installed) |

### 10.3 Runtime Adapter Pattern

```rust
#[async_trait]
pub trait RuntimeAdapter: Send + Sync {
    async fn deploy(&self, spec: DeploySpec) -> Result<DeployResult>;
    async fn stop(&self, service_id: &str) -> Result<()>;
    async fn scale(&self, service_id: &str, replicas: u32) -> Result<()>;
    async fn logs(&self, service_id: &str, opts: LogOptions) -> Result<LogStream>;
    async fn status(&self, service_id: &str) -> Result<ServiceStatus>;
    async fn exec(&self, service_id: &str, command: &[String]) -> Result<ExecResult>;
    async fn rollback(&self, service_id: &str, target_deploy_id: &str) -> Result<()>;
    async fn metrics(&self, service_id: &str) -> Result<ContainerMetrics>;
}
```

**DockerAdapter** — Uses `bollard` crate (Docker Engine API):
- `deploy()`: pull image → stop old container → create new container with Traefik labels → start → health check.
- Container naming: `syn-{project}-{service}-{deploy_short_id}`.
- Traefik labels for routing, SSL, and load balancing.

**KubernetesAdapter** — Uses `kube-rs` crate (Kubernetes API):
- `deploy()`: create/patch Deployment + Service + IngressRoute.
- Namespace per project: `syn-{project}`.
- Rolling update strategy with configurable max surge/unavailable.
- HPA (Horizontal Pod Autoscaler) support for auto-scaling.

**Auto-detection logic:**
```
On agent startup:
  1. Check if `kubectl cluster-info` succeeds → KubernetesAdapter
  2. Check if Docker socket exists (/var/run/docker.sock) → DockerAdapter
  3. Neither found → install Docker automatically, use DockerAdapter
```

### 10.4 Telemetry Collection Module

| Component | Implementation | Details |
|-----------|---------------|---------|
| OTLP Receiver | tonic (gRPC) + axum (HTTP) | Listen on localhost:4317/4318. Receive spans, logs, metrics from app SDKs. |
| Log Collector | Docker logs API / kubelet API | Capture stdout/stderr from all managed containers/pods. Parse JSON logs. |
| Metrics Scraper | Custom HTTP client | Scrape Prometheus /metrics endpoints. System metrics from /proc filesystem. |
| Health Checker | reqwest HTTP client | Configurable HTTP/TCP probes per service. Record response time, status. |
| Buffer | Circular ring buffer (50MB max) | Buffer all telemetry locally. Survive network blips. |
| Batcher | Timer (5s) + count (1000) trigger | Batch events. Compress with zstd. Send via WebSocket. |
| Sampler | Adaptive rate limiter | High-volume: sample 10% traces. Always keep 100% errors. Configurable. |

### 10.5 Agent Communication Protocol

Agent connects **outbound** to control plane via WebSocket (WSS). No inbound ports needed on user's server.

**Handshake:**
```json
{
  "type": "agent_hello",
  "agent_id": "agt_xxx",
  "token": "syn_tkn_xxx",
  "version": "0.1.0",
  "runtime": "docker",
  "os": "ubuntu-24.04",
  "arch": "x86_64",
  "resources": { "cpu_cores": 4, "memory_mb": 8192, "disk_gb": 80 }
}
```

**Command messages (Control Plane → Agent):**
- `deploy`: Deploy a service with image, config, env vars.
- `stop`: Stop a running service.
- `scale`: Change replica count.
- `exec`: Execute command inside container.
- `logs`: Stream logs for a service.
- `restart`: Restart a service.
- `update_agent`: Self-update to new version.
- `configure_health_check`: Set/update health check params.

**Telemetry messages (Agent → Control Plane):**
- `heartbeat`: Every 30s. CPU, RAM, disk, container count.
- `deploy_status`: Build progress, deploy result, health check result.
- `telemetry_batch`: Compressed batch of traces, logs, metrics, errors.
- `alert`: Health check failure, resource threshold exceeded.

### 10.6 Auto-Update Mechanism

1. Agent checks for new version every 6 hours (or on control plane command).
2. Download new binary to temp path.
3. Verify checksum (SHA-256).
4. Replace binary via atomic rename.
5. Restart via systemd (`systemctl restart syntra-agent`).
6. Report new version to control plane.

---

## 11. Dashboard & User Interface

### 11.1 Technology Stack

- Framework: Next.js 14 (App Router)
- UI: Tailwind CSS + shadcn/ui components
- State: TanStack Query (server state) + Zustand (client state)
- Real-time: WebSocket for live updates
- Charts: Recharts (time-series) + D3.js (trace waterfall)
- Workflow: React Flow (DAG editor)
- Terminal: xterm.js (web terminal)
- Tables: TanStack Table (sortable, filterable)

### 11.2 Page Structure

```
/ (Landing/Marketing)
/login
/register

/dashboard
├── /servers
│   ├── /[serverId]              — Server detail (resources, services, agent status)
│   └── /new                     — Add server (generate install command)
├── /projects
│   ├── /[projectId]
│   │   ├── /overview            — Project summary, recent deploys
│   │   ├── /services
│   │   │   └── /[serviceId]
│   │   │       ├── /overview    — Service status, config
│   │   │       ├── /deployments — Deploy history, trigger deploy, rollback
│   │   │       ├── /logs        — Log explorer (search, filter, live tail)
│   │   │       ├── /traces      — Trace list + waterfall view
│   │   │       ├── /errors      — Issue list (Sentry-like)
│   │   │       │   └── /[issueId] — Issue detail + AI analysis
│   │   │       ├── /metrics     — Performance charts
│   │   │       ├── /settings    — Env vars, domains, health checks
│   │   │       └── /cost        — Resource cost breakdown
│   │   ├── /workflows
│   │   │   ├── /builder         — Visual workflow editor (React Flow)
│   │   │   └── /runs            — Workflow execution history
│   │   ├── /environments        — Dev/Staging/Prod environment management
│   │   ├── /alerts              — Alert rules configuration
│   │   └── /settings            — Git repo, team access, notifications
│   └── /new                     — Create project wizard
├── /observability
│   ├── /issues                  — All error groups across projects
│   ├── /traces                  — Global trace search
│   ├── /logs                    — Global log search
│   └── /metrics                 — Global metrics overview
├── /ai                          — AI co-pilot chat interface
├── /status                      — Public status page configuration
├── /templates                   — One-click deploy templates
├── /team                        — Team members, roles, invitations
├── /billing                     — Plan, usage, invoices
└── /settings                    — Account, API tokens, notifications
```

### 11.3 Key UI Components

**Issues View (Error Tracking):**
- Table: title, status badge (unresolved/resolved/ignored), event count, user count, first seen, last seen, assigned to.
- Sort by: frequency, last seen, users affected.
- Bulk actions: resolve, ignore, merge, assign.
- Filter by: service, environment, status, severity, time range.
- Click → Issue detail with stack trace, breadcrumbs, AI analysis panel.

**Trace Waterfall:**
- Horizontal bar chart showing span hierarchy and timing.
- Color-coded by span type (HTTP, DB, external, internal).
- Click span → details panel with attributes, linked logs, linked errors.
- Timeline ruler with microsecond precision.

**Metrics Charts:**
- Time-series line/area charts (Recharts).
- Default dashboards: request rate, error rate, latency percentiles, CPU, RAM.
- Deploy markers: vertical lines on timeline showing when deploys happened.
- Zoom and pan. Time range selector.

**AI Insights Panel:**
- Slide-out sidebar with chat interface.
- Context-aware: when viewing a service, AI knows which service.
- Streaming response with markdown formatting.
- Suggested questions: "Why did errors spike?", "What's the slowest endpoint?", "Optimize this service."

---

## 12. Workflow Engine

### 12.1 Workflow Definition (YAML)

```yaml
name: production-deploy
trigger:
  - push:
      branch: main

stages:
  build:
    parallel: true
    steps:
      - name: Build API
        service: api
        action: build
        timeout: 10m
      - name: Build Frontend
        service: frontend
        action: build
        timeout: 10m

  test:
    needs: [build]
    steps:
      - name: Run API Tests
        service: api
        action: exec
        command: "npm test"
        timeout: 5m
      - name: Run E2E Tests
        service: frontend
        action: exec
        command: "npx playwright test"
        timeout: 10m

  deploy-staging:
    needs: [test]
    steps:
      - name: Deploy to Staging
        service: api
        action: deploy
        environment: staging
      - name: Health Check
        service: api
        action: health_check
        timeout: 2m

  approval:
    needs: [deploy-staging]
    type: manual_approval
    approvers: [admin, owner]
    timeout: 24h

  deploy-production:
    needs: [approval]
    strategy: rolling
    steps:
      - name: Deploy API
        service: api
        action: deploy
        environment: production
        replicas: 3
      - name: Deploy Frontend
        service: frontend
        action: deploy
        environment: production

  notify:
    needs: [deploy-production]
    always: true
    steps:
      - name: Slack Notification
        action: notify
        channel: slack
        on_success: "✅ Production deploy complete: v{{git.sha_short}}"
        on_failure: "❌ Production deploy FAILED: v{{git.sha_short}}"
```

### 12.2 Visual Workflow Builder

- Built with React Flow library.
- Node types: Build, Test, Deploy, Exec, Approval, Notify, Condition, Custom Script.
- Edge types: dependency (solid), conditional (dashed).
- Drag nodes from palette → connect with edges → configure in side panel.
- Export/import YAML ↔ visual editor (bidirectional).
- Live run visualization: nodes highlight as they execute (green=success, red=fail, yellow=running, gray=waiting).

### 12.3 Execution Engine

- DAG executor: topological sort → execute in parallel where possible.
- Step state machine: pending → running → success/failure/skipped.
- Timeout handling per step and per workflow.
- Retry configuration per step (max retries, backoff).
- Manual approval: pause execution, wait for user action, resume or cancel.
- Auto-rollback: if deploy step fails and rollback is configured, trigger rollback to previous version.
- Conditional steps: execute only if expression evaluates true (e.g., `branch == 'main'`).

---

## 13. Security & Compliance

### 13.1 Agent Security

- **Outbound-only connections**: Agent connects to control plane. No inbound ports needed on user's server. Firewall-friendly.
- **mTLS authentication**: Unique TLS certificate per agent. Mutual verification. Certificate rotation every 90 days.
- **Scoped tokens**: Agent token only grants access to assigned projects/services. Least-privilege principle.
- **Binary verification**: Agent binary signed with Ed25519. Checksum verification before auto-update.

### 13.2 Data Security

- **Encryption at rest**: Environment variables encrypted with AES-256-GCM. Database encryption via PostgreSQL TDE or application-level.
- **Encryption in transit**: All communication over TLS 1.3. WebSocket connections use WSS.
- **Secret management**: Env vars decrypted only at deployment time, injected into container/pod. Never logged.
- **Image signing**: Docker images signed before push to registry. Verified before pull on agent.
- **Telemetry data**: Encrypted in transit (WSS + zstd). Stored encrypted in ClickHouse. Retention limits enforced.

### 13.3 Access Control

- **Authentication**: OAuth 2.0 (GitHub, Google). Email/password with MFA (TOTP). API tokens with scopes.
- **Authorization (RBAC)**: Owner (full access) → Admin (manage team, servers) → Developer (deploy, view) → Viewer (read-only).
- **Per-project permissions**: Team members can have different roles per project.
- **Audit log**: All actions logged with timestamp, user, IP, action, resource. Searchable. Exportable (Team+).
- **SSO/SAML**: Enterprise plan. Okta, Azure AD, Google Workspace integration.

### 13.4 Network Security

- **Control plane**: CloudFlare WAF, DDoS protection, rate limiting.
- **Agent communication**: Certificate-pinned WebSocket connections. Replay attack prevention via nonces.
- **Registry**: Private Docker registry. Image pull requires agent authentication. No anonymous access.
- **Build isolation**: Each build runs in isolated Docker container. No shared filesystem between builds. Build containers destroyed after completion.

### 13.5 Compliance Targets

- SOC 2 Type II (planned for Year 2).
- GDPR compliance: data deletion on account closure, data export, DPA available.
- No PII stored by default in telemetry (SDK opt-in).
- Data residency: control plane region selectable (EU, US, APAC) for Enterprise.

---

## 14. API Specification

### 14.1 API Design

- RESTful JSON API.
- Authentication: Bearer token (API key) or OAuth session.
- Rate limiting: 100 requests/minute (Free), 1000/min (Pro), 5000/min (Team).
- Pagination: cursor-based.
- Versioning: URL-based (`/api/v1/...`).

### 14.2 Core Endpoints

**Servers**
```
GET    /api/v1/servers                    — List servers
POST   /api/v1/servers                    — Register server (returns install command)
GET    /api/v1/servers/:id                — Server detail
DELETE /api/v1/servers/:id                — Remove server
GET    /api/v1/servers/:id/metrics        — Server resource metrics
```

**Projects**
```
GET    /api/v1/projects                   — List projects
POST   /api/v1/projects                   — Create project
GET    /api/v1/projects/:id               — Project detail
PATCH  /api/v1/projects/:id               — Update project
DELETE /api/v1/projects/:id               — Delete project
```

**Services**
```
GET    /api/v1/projects/:id/services          — List services
POST   /api/v1/projects/:id/services          — Create service
GET    /api/v1/services/:id                   — Service detail
PATCH  /api/v1/services/:id                   — Update service config
DELETE /api/v1/services/:id                   — Delete service
POST   /api/v1/services/:id/deploy            — Trigger deployment
POST   /api/v1/services/:id/rollback          — Rollback deployment
POST   /api/v1/services/:id/restart           — Restart service
POST   /api/v1/services/:id/scale             — Scale service
GET    /api/v1/services/:id/logs              — Get logs (query params for filters)
```

**Deployments**
```
GET    /api/v1/services/:id/deployments       — List deployments
GET    /api/v1/deployments/:id                — Deployment detail + build logs
POST   /api/v1/deployments/:id/cancel         — Cancel running deployment
```

**Observability**
```
GET    /api/v1/projects/:id/issues            — List error groups
GET    /api/v1/issues/:id                     — Issue detail + AI analysis
PATCH  /api/v1/issues/:id                     — Update issue (resolve, assign, ignore)
GET    /api/v1/issues/:id/events              — Error events for issue
GET    /api/v1/services/:id/traces            — Query traces (time range, filters)
GET    /api/v1/traces/:traceId                — Full trace with all spans
GET    /api/v1/services/:id/metrics           — Query metrics (time range, metric name)
GET    /api/v1/services/:id/health            — Health check history
```

**AI**
```
POST   /api/v1/ai/analyze-error              — Trigger AI analysis for error group
POST   /api/v1/ai/generate-dockerfile        — Generate Dockerfile from repo info
POST   /api/v1/ai/chat                       — AI co-pilot chat (streaming SSE)
GET    /api/v1/ai/recommendations/:serviceId — Get AI resource recommendations
```

**Workflows**
```
GET    /api/v1/projects/:id/workflows         — List workflows
POST   /api/v1/projects/:id/workflows         — Create workflow
PATCH  /api/v1/workflows/:id                  — Update workflow
POST   /api/v1/workflows/:id/run              — Trigger workflow run
GET    /api/v1/workflows/:id/runs             — List workflow runs
GET    /api/v1/workflow-runs/:id              — Run detail + step statuses
POST   /api/v1/workflow-runs/:id/approve      — Approve manual gate
POST   /api/v1/workflow-runs/:id/cancel       — Cancel running workflow
```

**Alerts**
```
GET    /api/v1/projects/:id/alerts            — List alert rules
POST   /api/v1/projects/:id/alerts            — Create alert rule
PATCH  /api/v1/alerts/:id                     — Update alert rule
DELETE /api/v1/alerts/:id                     — Delete alert rule
GET    /api/v1/alerts/:id/incidents           — List alert incidents
```

### 14.3 Webhook Events

Outgoing webhooks notify external systems of events:

```json
{
  "event": "deployment.completed",
  "timestamp": "2026-01-31T10:00:00Z",
  "data": {
    "deployment_id": "dep_xxx",
    "service_id": "svc_xxx",
    "status": "success",
    "duration_ms": 45200,
    "git_commit": "abc1234",
    "image": "registry.syntra.dev/proj/svc:abc1234"
  }
}
```

Events: `deployment.started`, `deployment.completed`, `deployment.failed`, `service.health_changed`, `issue.created`, `issue.resolved`, `alert.fired`, `alert.resolved`, `workflow.completed`.

---

## 15. Competitive Analysis

### 15.1 PaaS Competitor Matrix

| Feature | Syntra | Railway | Coolify | Dokploy | Vercel |
|---------|-----------|---------|---------|---------|--------|
| Model | BYOS SaaS | Hosted PaaS | Self-hosted OSS | Self-hosted OSS | Hosted PaaS |
| AI co-pilot | ★ Yes | No | No | No | Partial (v0) |
| AI error analysis | ★ Yes | No | No | No | No |
| Dual runtime (Docker+K8s) | ★ Yes | Proprietary | Docker only | Docker only | Serverless |
| Visual workflow builder | ★ Yes | No | No | No | No |
| Built-in observability | ★ 5-in-1 | Basic metrics | Basic | Basic | Basic analytics |
| Service inter-linking | Yes | Yes | No | No | No |
| Preview environments | Yes | Yes | Partial | Yes | Yes |
| CLI tool | Yes | Yes | No | No | Yes |
| Public status page | ★ Yes | No | No | No | No |
| Cost per 5 services | ~$18/mo | ~$100-250/mo | $0 + VPS | $0 + VPS | ~$100-300/mo |
| Agent RAM overhead | ~15MB | N/A | ~1GB | ~800MB | N/A |

### 15.2 Observability Competitor Matrix

| Feature | Syntra | Sentry | Datadog | Grafana Stack | BetterStack |
|---------|-----------|--------|---------|---------------|-------------|
| Error tracking | ✓ Built-in | ✓ Core | ✓ | Via Loki | Partial |
| APM / Traces | ✓ Built-in | ✓ | ✓ Best-in-class | Via Tempo | No |
| Log aggregation | ✓ Built-in | No | ✓ | Via Loki | ✓ Core |
| Metrics | ✓ Built-in | Basic | ✓ Best-in-class | Via Prometheus | Basic |
| Uptime monitoring | ✓ Built-in | No | ✓ | No | ✓ Core |
| AI error explanation | ★ Unique | No | No | No | No |
| AI anomaly detection | ★ Unique | Partial | ✓ ($$$) | Via ML plugin | No |
| AI fix suggestions | ★ Unique | No | No | No | No |
| AI performance advisor | ★ Unique | No | No | No | No |
| Natural language query | ★ Unique | No | Bits AI (limited) | Partial | No |
| Deploy correlation | ★ Native | Release tracking | ✓ | Manual | No |
| Integrated with PaaS | ★ Same platform | Separate tool | Separate tool | Separate tool | Separate tool |
| OpenTelemetry support | ✓ Native | Partial | ✓ | ✓ | No |
| Pricing (small team) | Included in $18/mo | $26+/mo | $31+/host/mo | Free (self-host) | $20+/mo |

### 15.3 Key Competitive Advantages

1. **Only AI-native PaaS** — No competitor combines PaaS + AI-powered observability. This is a category-creating feature.
2. **5-in-1 saves money** — Replaces Sentry ($26) + Datadog ($31) + BetterStack ($20) + Grafana (time cost) = $77+ with $0 additional cost.
3. **Full-context AI** — AI has access to errors + traces + logs + metrics + deploy history simultaneously. No isolated tool can match this cross-correlation.
4. **BYOS cost advantage** — 70-90% cheaper than Railway/Render at scale while providing more features.
5. **Docker-to-K8s growth path** — Only self-hosted PaaS supporting both runtimes via single agent.
6. **Lightweight agent** — 15MB RAM vs 1GB+ for competitor control planes running on user's server.

---

## 16. Development Roadmap

### Phase 1: MVP (Weeks 1-8)

**Goal**: Basic PaaS that works. User can install agent, connect server, deploy apps via git push.

| Week | Deliverables |
|------|-------------|
| 1-2 | Rust agent skeleton: WebSocket client, Docker adapter (deploy, stop, logs), systemd service, install script. |
| 3-4 | Next.js dashboard: auth (NextAuth), server management, project CRUD, service configuration. |
| 5-6 | Build system: GitHub webhook, BullMQ queue, Docker build worker, private registry (Harbor). Deploy pipeline: build → push → deploy via agent. |
| 7-8 | Traefik integration (agent-side), auto SSL, custom domains. Real-time deploy logs (WebSocket). Basic monitoring (CPU, RAM). Rollback. |

**Exit criteria**: User can `git push` → app builds → deploys to their server → accessible via custom domain with SSL.

### Phase 2: AI Ops v1 (Weeks 9-14)

**Goal**: Core observability + first AI features. The differentiators.

| Week | Deliverables |
|------|-------------|
| 9-10 | Agent OTLP receiver (gRPC + HTTP). SDK v1 (JavaScript + Python): error capture, auto-instrumentation, breadcrumbs. Telemetry buffer + batching. |
| 11-12 | Telemetry ingestion pipeline: receive from agents, process, store in ClickHouse + PostgreSQL. Error grouping (fingerprint). Issues view in dashboard. |
| 13-14 | AI error analysis: integrate Claude API, feed stack trace + context, generate explanation + fix. AI Dockerfile generator. Visual workflow builder (basic: build → deploy). Service inter-linking (${{ref}}). |

**Exit criteria**: Errors auto-captured, grouped, and AI-analyzed. Users see actionable insights without manual debugging.

### Phase 3: Full Observability (Weeks 15-20)

**Goal**: Complete 5-in-1 observability stack. Growth features.

| Week | Deliverables |
|------|-------------|
| 15-16 | Trace waterfall UI. Log explorer (search, filter, live tail). Metrics dashboard with deploy markers. |
| 17-18 | AI anomaly detection (baseline learning + deviation alerts). AI resource recommender. Smart cost dashboard. Health checks + uptime tracking. |
| 19-20 | Alerting engine (rules + AI + multi-channel). Public status pages. Preview environments. CLI tool (df). Deploy notifications. |

**Exit criteria**: Full observability parity with Sentry + Datadog basics. AI providing continuous value.

### Phase 4: Team & Scale (Weeks 21-26)

**Goal**: Team features for paid plans. Kubernetes support. Enterprise readiness.

| Week | Deliverables |
|------|-------------|
| 21-22 | Kubernetes adapter (kube-rs). Auto-detection. K3s install option. K8s-specific features (HPA, rolling updates). |
| 23-24 | Multi-user RBAC. Environment promotion (dev → staging → prod). Approval gates in workflows. Database provisioning (one-click Postgres, Redis). |
| 25-26 | AI co-pilot chat (natural language query). Natural language deploy. Canary/blue-green deployments. Backup & restore. Template marketplace. One-click templates. Referral program. |

**Exit criteria**: Platform ready for team adoption. Kubernetes as premium feature. Full AI co-pilot experience.

### Post-Launch Priorities

- Terraform provider for Infrastructure as Code.
- SSO/SAML (Enterprise).
- Go and Rust SDK.
- Mobile app for monitoring on the go.
- GPU workload support (AI/ML deployments).
- Multi-region deployment support.
- On-premise control plane option (Enterprise).

---

## 17. Success Metrics & KPIs

### 17.1 Product Metrics

| Metric | Target (Month 6) | Target (Month 12) |
|--------|-------------------|---------------------|
| Registered users | 200 | 500 |
| Connected servers | 400 | 1,250 |
| Daily active users | 50 | 150 |
| Deployments per day | 200 | 1,000 |
| AI analyses per day | 100 | 500 |
| Avg sessions per week (per user) | 4 | 5 |

### 17.2 Business Metrics

| Metric | Target (Month 6) | Target (Month 12) |
|--------|-------------------|---------------------|
| MRR | $4,400 | $16,250 |
| Paying customers | 80 | 250 |
| Free-to-paid conversion rate | 8% | 12% |
| Monthly churn rate | <5% | <3% |
| Average revenue per user (ARPU) | $11 | $13 |
| Net Promoter Score (NPS) | 40 | 50 |
| Customer Acquisition Cost (CAC) | <$50 | <$40 |
| LTV:CAC ratio | >3:1 | >5:1 |

### 17.3 Technical Metrics

| Metric | Target |
|--------|--------|
| Control plane uptime | 99.9% |
| Agent → control plane latency | <100ms (p95) |
| Deploy time (build + deploy) | <3 minutes (p95) |
| Telemetry ingestion latency | <5 seconds end-to-end |
| AI analysis response time | <10 seconds |
| Error grouping accuracy | >95% (correct fingerprinting) |
| Dashboard page load time | <2 seconds |
| Agent binary startup time | <3 seconds |

### 17.4 AI-Specific Metrics

| Metric | Target |
|--------|--------|
| AI analysis helpfulness rating (user feedback) | >80% helpful |
| AI fix suggestion accuracy | >60% correct (user applied fix) |
| AI anomaly detection precision | >90% (true positives) |
| AI anomaly detection recall | >70% (catches real anomalies) |
| Average AI cost per user per month | <$2 |
| AI cache hit rate | >40% (reuse analysis for same error) |

---

## 18. Risk Analysis

### 18.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ClickHouse scaling issues at high telemetry volume | Medium | High | Start with TimescaleDB (simpler). Migrate to ClickHouse when volume justifies. Implement aggressive sampling. |
| AI hallucination in error analysis | Medium | Medium | Provide full context (stack trace, code, deploys). Use structured prompts. Show confidence score. Allow user feedback loop. Cache and improve over time. |
| Agent security vulnerability | Low | Critical | Rust memory safety. mTLS authentication. Security audit before launch. Bug bounty program. Automatic agent updates. |
| WebSocket connection reliability | Medium | High | Auto-reconnect with exponential backoff. Local telemetry buffer survives disconnection. Agent operates independently when disconnected (existing containers keep running). |
| Docker/K8s version compatibility | Medium | Medium | Test against major versions. Use stable APIs only. Graceful degradation for unsupported features. |

### 18.2 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Coolify/Dokploy add AI features | Medium | High | Move fast. AI features are hard to retrofit. Our integrated approach (PaaS + observability + AI) is architecturally difficult to replicate. Build moat through data quality and user feedback. |
| Railway reduces pricing | Medium | Medium | Our BYOS model is structurally cheaper. Even free Railway cannot beat $5 VPS. Focus on features Railway cannot offer (self-hosted, K8s, visual workflows). |
| LLM API costs increase | Low | Medium | Cache aggressively (40%+ cache hit target). Use smaller models (Haiku) for routine analysis. Self-host open-source models as fallback. Pricing includes AI cost headroom. |
| Low conversion from free to paid | High | High | Ensure free tier is useful but limited (1 server, 3 projects, 5 AI/day). Make upgrade moments natural ("Add second server" → Pro required). Show cost savings dashboard even on free. |
| User data trust concerns | Medium | High | Transparent privacy policy. SDK sends minimal data. User controls what gets collected. Telemetry never leaves user's server until agent sends it. Open-source SDK. |

### 18.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Solo developer bottleneck | High | High | Prioritize ruthlessly (MVP first). Use established libraries (not reinvent). Leverage AI for code generation. Consider co-founder or early hire for frontend. |
| Support burden at scale | Medium | Medium | Comprehensive docs. AI-generated troubleshooting. Community forum (Discord). Self-service for common issues. Automate onboarding. |
| Infrastructure cost spike | Low | Medium | 93%+ gross margin provides buffer. Monitor closely. Auto-scale with demand. ClickHouse compression reduces storage costs. |

---

## 19. Technical Dependencies

### 19.1 Control Plane Stack

| Component | Technology | Version | License | Purpose |
|-----------|-----------|---------|---------|---------|
| Runtime | Node.js | 20 LTS | MIT | Server runtime |
| Framework | Next.js | 14.x | MIT | Full-stack web framework |
| ORM | Drizzle | Latest | Apache 2.0 | Type-safe database ORM |
| Database | PostgreSQL | 16 | PostgreSQL | Primary data store |
| Cache/Queue | Redis | 7.x | BSD | Caching, pub/sub, job queue |
| Job Queue | BullMQ | Latest | MIT | Build job processing |
| TSDB | ClickHouse | Latest | Apache 2.0 | Telemetry time-series storage |
| Registry | Harbor | 2.x | Apache 2.0 | Docker image registry |
| Auth | NextAuth.js | 5.x | ISC | Authentication |
| Payments | Stripe SDK | Latest | MIT | Subscription billing |
| WebSocket | ws | Latest | MIT | Agent communication |
| UI Components | shadcn/ui | Latest | MIT | Dashboard UI |
| Charts | Recharts | Latest | MIT | Time-series visualization |
| Workflow Editor | React Flow | Latest | MIT | Visual DAG builder |
| Terminal | xterm.js | Latest | MIT | Web terminal |

### 19.2 Agent Stack (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| tokio | 1.x | Async runtime |
| bollard | Latest | Docker Engine API client |
| kube-rs | Latest | Kubernetes API client |
| tokio-tungstenite | Latest | WebSocket client |
| tonic | Latest | gRPC server (OTLP receiver) |
| axum | Latest | HTTP server (OTLP receiver) |
| clap | 4.x | CLI argument parser |
| serde / serde_json | Latest | Serialization |
| tracing | Latest | Structured logging |
| rustls | Latest | TLS implementation |
| reqwest | Latest | HTTP client (health checks) |
| zstd | Latest | Compression |
| anyhow | Latest | Error handling |

### 19.3 External Services

| Service | Purpose | Cost |
|---------|---------|------|
| Anthropic Claude API | AI error analysis, co-pilot, Dockerfile gen | Usage-based (~$0.01-0.05/analysis) |
| Stripe | Payment processing | 2.9% + $0.30 per transaction |
| GitHub API | Webhook integration, repo access | Free |
| CloudFlare | CDN, DNS, DDoS protection | Free-$20/mo |
| Hetzner / DigitalOcean | Control plane hosting | $50-200/mo |
| S3 / MinIO | Registry storage, backups | $5-50/mo |
| Resend / SendGrid | Transactional email | Free tier sufficient initially |

---

## 20. Onboarding & First-Time User Experience

### 20.1 Onboarding Philosophy

Syntra's onboarding follows the **"Time to First Deploy" (TTFD)** principle: a new user must go from sign-up to a running application in under 10 minutes. Every friction point between registration and a successful deployment is a potential churn point.

### 20.2 Registration & Activation Flow

```
1. Sign Up (GitHub OAuth — one click)
   └── Auto-create organization from GitHub username
2. Welcome Screen — "What describes you best?"
   ├── Solo developer → Recommend Free plan, single server setup
   ├── Small team → Recommend Team plan, invite flow
   └── Agency → Recommend multi-project setup
3. Connect Server (interactive wizard)
   ├── Step 1: Choose provider hint (Hetzner/DO/AWS/other) — cosmetic, no lock-in
   ├── Step 2: Copy install command (one-liner with embedded token)
   ├── Step 3: Live connection indicator (WebSocket heartbeat detected → ✅)
   └── Step 4: Server appears in dashboard with system info auto-populated
4. First Project
   ├── Connect GitHub repo (OAuth scope already granted)
   ├── Auto-detect framework → show detected stack ("Next.js 14 detected")
   ├── AI generates Dockerfile suggestion → user reviews
   └── One-click deploy → build log streaming → success screen with live URL
5. Celebration + Guided Tour
   ├── Confetti animation on first successful deploy
   ├── Tooltip tour: observability, AI chat, logs, metrics
   └── Prompt: "Add the Syntra SDK for error tracking" (2-line code snippet)
```

### 20.3 First-Time User Experience (FTUE) Milestones

| Milestone | Target Time | Trigger |
|-----------|-------------|---------|
| Account created | T+0 | GitHub OAuth |
| First server connected | T+3 min | Install script completes |
| First deploy triggered | T+5 min | Git repo connected + deploy |
| First deploy live | T+8 min | Build + deploy completes |
| First error captured | T+15 min | SDK installed, error occurs |
| First AI analysis viewed | T+16 min | Auto-triggered on error |
| Observability "aha moment" | T+30 min | User sees trace waterfall or AI fix suggestion |

### 20.4 Onboarding Automation

- **Empty state designs**: Every dashboard page has helpful empty states with CTAs, not blank screens. Issues page shows "No errors captured yet — install the SDK to start." with copy-paste snippet.
- **Smart defaults**: Auto-configure health checks (/health, /api/health, /healthz). Auto-detect port from Dockerfile EXPOSE. Pre-fill resource limits based on server capacity.
- **Progressive disclosure**: Free users see Pro/Team features grayed out with "Unlock with Pro" badges. Never block the workflow — just show what's possible.
- **Email drip sequence**: Day 1: "Your first deploy is live!" → Day 3: "Did you know Syntra has AI error analysis?" → Day 7: "Your weekly performance report" → Day 14: "Invite your team" → Day 30: "You've saved $X compared to Railway."
- **In-app checklist**: Persistent sidebar widget showing onboarding progress (0-100%). Rewards: badge on profile for completing setup. Steps: connect server, deploy app, install SDK, capture first error, invite teammate.

### 20.5 Activation Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Activation rate | % of sign-ups that complete first deploy | >60% |
| Time to First Deploy (TTFD) | Median time from sign-up to live deploy | <10 min |
| SDK adoption rate | % of projects with SDK installed within 7 days | >40% |
| Week 1 retention | % of activated users returning in week 1 | >70% |
| Week 4 retention | % of activated users returning in week 4 | >50% |
| Onboarding completion | % who finish all checklist items within 14 days | >35% |

---

## 21. Go-to-Market Strategy

### 21.1 Launch Strategy: Developer-Led Growth (DLG)

Syntra follows a **bottom-up developer-led growth** model. Individual developers adopt Syntra for personal projects, experience the value, and then advocate for team adoption at their companies. This mirrors the playbook of Railway, Vercel, and Sentry.

### 21.2 Pre-Launch (Weeks -8 to 0)

| Activity | Channel | Goal |
|----------|---------|------|
| Build in public | Twitter/X, dev.to, personal blog | Build audience (1,000+ followers) |
| Weekly dev updates | YouTube shorts, Twitter threads | Show progress, build trust |
| Beta waitlist | Landing page with email capture | 500+ waitlist sign-ups |
| Private beta (50 users) | Invite from waitlist, Discord community | Validate MVP, fix critical bugs |
| Open-source SDK early | GitHub | Build credibility, collect stars |
| Content: "Why I'm building Syntra" | Blog post, HN/Reddit submission | Awareness, inbound interest |

### 21.3 Launch (Week 0)

- **Product Hunt launch**: Prepare assets (logo, screenshots, demo video, tagline). Target #1 Product of the Day.
- **Hacker News Show HN**: Authentic technical post focusing on architecture decisions (Rust agent, AI integration).
- **Reddit**: Posts in r/selfhosted, r/devops, r/webdev, r/SaaS, r/IndieHackers (genuine, not spammy).
- **Dev.to / Hashnode**: Technical deep-dive article: "How We Built an AI-Powered PaaS with a Rust Agent."
- **Twitter/X**: Thread explaining problem → solution → demo GIF → link. Tag relevant devs and communities.
- **Discord**: Launch own community server. Cross-post in Coolify/Dokploy/Railway communities (where allowed).

### 21.4 Post-Launch Growth Channels

| Channel | Tactic | Expected Impact | Cost |
|---------|--------|-----------------|------|
| SEO/Content | Blog: "Railway vs Syntra", "Self-Hosted PaaS Comparison", "AI Ops Guide" | Long-tail traffic, 10K visits/mo by M6 | Time only |
| YouTube | Deploy tutorials, AI feature demos, "Syntra vs X" comparisons | 500-2K views per video, trust building | Time only |
| GitHub presence | Open-source SDK, agent, CLI. Stars = social proof. | 1K+ stars in 6 months | Time only |
| Referral program | Give $10 credit, get $10 credit when referral converts to paid | 20% of new users via referral | $10 per acquisition |
| Template marketplace | One-click deploy templates (WordPress, Ghost, n8n, Supabase, Plausible) | SEO + "try before you buy" | Time only |
| Partnership | Integration partnerships with VPS providers (Hetzner, DO referral) | Co-marketing, affiliate revenue | Revenue share |
| Developer advocates | Sponsor small devrel creators, give free Team plans for reviews | Authentic testimonials | $200-500/mo |
| Conference talks | PaaS/DevOps meetups, KubeCon lightning talks, local tech meetups | Authority, direct leads | Travel costs |

### 21.5 Pricing-Led Conversion Funnel

```
Free (Acquisition) → Pro $9/server (Activation) → Team $19/server (Expansion) → Enterprise (Custom)

Key conversion triggers:
├── Free → Pro:  "Add second server" or "Unlock unlimited AI"
├── Pro → Team:  "Invite teammate" or "Add RBAC" or "Environment promotion"
└── Team → Enterprise: "SSO requirement" or "Compliance" or ">50 servers"
```

### 21.6 GTM KPIs

| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| Website visitors/month | 5,000 | 15,000 | 50,000 |
| Sign-ups/month | 100 | 400 | 1,000 |
| Activation rate (first deploy) | 50% | 60% | 65% |
| Free-to-paid conversion | 6% | 8% | 12% |
| Organic traffic share | 30% | 50% | 65% |
| GitHub stars (SDK + Agent) | 200 | 800 | 2,500 |
| Discord community members | 200 | 800 | 3,000 |
| NPS (paying users) | 35 | 40 | 50 |

---

## 22. Agent Failure Modes & Recovery

### 22.1 Design Principle: Graceful Degradation

The Syntra agent is designed with the principle that **user applications must never be affected by agent failures**. The agent is an observer and orchestrator — if it fails, running containers/pods continue to serve traffic uninterrupted. Only new deployments and telemetry collection are paused.

### 22.2 Failure Mode Matrix

| Failure Mode | Impact | Detection | Recovery | User Impact |
|-------------|--------|-----------|----------|-------------|
| Agent process crash | No new deploys, no telemetry | systemd auto-restart (Restart=always, RestartSec=5s) | Auto-restart within 5-10 seconds. Resume WebSocket connection. Replay buffered telemetry. | None on running apps. Brief gap in metrics/logs. |
| WebSocket disconnection | Cannot receive deploy commands. Telemetry buffered locally. | Heartbeat timeout (90s without response). Agent-side ping/pong every 30s. | Exponential backoff reconnect: 1s → 2s → 4s → 8s → 16s → max 60s. Buffer telemetry in ring buffer (50MB). | Running apps unaffected. Deploys queued on control plane until reconnection. |
| Control plane outage | All agents lose connection. No dashboard access. | External uptime monitoring (Pingdom/BetterStack). Multi-region health checks. | Agent operates autonomously: containers keep running, health checks continue locally, telemetry buffers. Control plane recovery → agents auto-reconnect → flush buffers. | Running apps 100% unaffected. Users cannot trigger new deploys or view dashboard. |
| Docker daemon crash | Agent cannot manage containers. Existing containers may also be affected. | Agent detects Docker socket unresponsive. Health check probes fail. | Agent alerts control plane "Docker daemon unreachable." Retry connection every 10s. Alert user via all configured channels. Agent cannot self-heal Docker — requires manual intervention. | Running containers may be affected (depends on Docker state). User alerted immediately. |
| Disk full on user server | Builds fail. Logs cannot be written. Containers may fail to start. | Agent monitors disk usage via /proc. Alert at 85%, critical at 95%. | Proactive: alert user at 85% with AI recommendation ("Delete old images: `docker system prune` would free ~2.4GB"). Agent auto-cleans Syntra temp files and old image layers (configurable). | Potential app downtime if disk reaches 100%. Proactive alerts prevent this. |
| Out of memory (OOM) | Agent killed by OOM killer. Or user's apps OOM. | systemd logs OOM. Agent reports container OOM events. | Agent: auto-restart by systemd (low OOM score via OOMScoreAdjust=-500). App containers: report to dashboard, AI suggests memory limit adjustment. | Agent restarts quickly. App OOM = container restart, event logged. |
| TLS certificate expiration | Agent cannot authenticate to control plane. | Agent checks cert expiry daily. Alert 14 days before expiry. | Auto-rotation: agent requests new cert from control plane 30 days before expiry. If expired: fallback to token-based auth for cert renewal only. | None if auto-rotation works. If expired: temporary telemetry gap until manual renewal. |
| Corrupted agent binary | Agent fails to start after update. | Checksum verification before replacing binary. systemd detects repeated crash. | Rollback mechanism: keep previous binary as `.bak`. If new binary crashes 3 times within 60s, systemd triggers rollback to `.bak` version. Report failed update to control plane. | Brief downtime (seconds) during rollback. Running apps unaffected. |
| Network partition (split brain) | Agent online but cannot reach control plane. | Heartbeat timeout on both sides. | Agent enters autonomous mode: continue health checks, buffer telemetry, serve existing Traefik config. No new deploys possible. Dashboard shows server as "Unreachable" with last-seen time. | Running apps unaffected. Observability delayed. |

### 22.3 Agent Self-Healing Mechanisms

1. **Watchdog timer**: Agent writes timestamp to `/tmp/syntra-agent-heartbeat` every 10s. systemd WatchdogSec detects hang.
2. **Memory limits**: Agent self-imposes 100MB memory limit. If exceeded, gracefully restart (flush buffers first).
3. **Automatic Docker cleanup**: Weekly prune of unused images, volumes, and networks older than 7 days (configurable, opt-out available).
4. **Certificate pre-rotation**: Request new mTLS cert 30 days before expiry. Store both old and new cert during transition window.
5. **Binary rollback**: Keep one previous binary version. Auto-rollback on repeated crash (3 crashes in 60 seconds).

### 22.4 Disaster Recovery Runbook

| Scenario | RTO | RPO | Recovery Steps |
|----------|-----|-----|----------------|
| Single agent crash | <10s | 0 (buffered) | systemd auto-restart → reconnect → flush buffer |
| Control plane DB failure | <15 min | <5 min | Automated failover to replica → agents auto-reconnect |
| Control plane total outage | <1 hour | <15 min | Restore from backup → DNS failover → agents reconnect |
| Agent host server death | User-dependent | Last telemetry batch | User provisions new server → run install script → redeploy from registry |
| Registry corruption | <30 min | 0 (images immutable) | Restore from S3 backup → rebuild latest if needed |

---

## 23. Migration & Data Portability

### 23.1 Import: Migrating TO Syntra

| Source Platform | Import Method | What's Migrated |
|----------------|---------------|-----------------|
| Coolify | CLI importer: `syn migrate --from coolify --config /path/to/coolify` | Services, env vars, domains, Docker Compose files. User re-builds images. |
| Dokploy | CLI importer: `syn migrate --from dokploy --db-url postgres://...` | Projects, services, env vars, domains. Docker Compose conversion. |
| Railway | Export project → `syn migrate --from railway --token rt_xxx` | Services, env vars, domains, deployment settings. Nixpacks config preserved. |
| Docker Compose | `syn import compose ./docker-compose.yml` | Auto-convert to Syntra services. Map ports, volumes, env vars, networks. |
| Kubernetes | `syn import k8s --namespace my-app` | Convert Deployments, Services, Ingress to Syntra project/service model. |
| Manual / SSH | `syn import dockerfile ./Dockerfile` + manual env var copy | Dockerfile-based service creation. User provides env vars. |

### 23.2 Export: Migrating FROM Syntra (Zero Lock-in Guarantee)

Syntra's anti-lock-in philosophy: users must be able to leave within 1 hour with all their data, configs, and applications intact.

| Export Feature | Format | How |
|----------------|--------|-----|
| Application images | Standard Docker images | Images stored in Harbor registry. User can `docker pull` any image. Or export to any container registry. |
| Environment variables | `.env` file or JSON | Dashboard export button → download `.env` per service. API: `GET /api/v1/services/:id/env?format=dotenv` |
| Service configuration | Docker Compose YAML | `syn export compose --project my-app` → generates `docker-compose.yml` with all services, ports, volumes, env vars. |
| Kubernetes manifests | Standard K8s YAML | `syn export k8s --project my-app` → generates Deployment + Service + Ingress YAML files. |
| Telemetry data | JSON / CSV | Dashboard: Export → select time range, data type (errors, traces, logs, metrics) → download. API: `GET /api/v1/export/telemetry?type=errors&format=json` |
| Workflow definitions | YAML | Download workflow YAML from dashboard or API. Standard format, easily adaptable. |
| Full project backup | Tarball (.tar.gz) | `syn export backup --project my-app` → includes: Docker Compose, env files, workflow YAMLs, Dockerfiles, telemetry snapshot. |

### 23.3 Data Portability API

```
GET  /api/v1/export/project/:id           — Full project export (JSON manifest)
GET  /api/v1/export/project/:id/compose   — Docker Compose export
GET  /api/v1/export/project/:id/k8s       — Kubernetes manifests
GET  /api/v1/export/service/:id/env       — Environment variables
GET  /api/v1/export/telemetry             — Telemetry data (errors, traces, logs, metrics)
POST /api/v1/import/compose               — Import from Docker Compose
POST /api/v1/import/k8s                   — Import from Kubernetes manifests
POST /api/v1/import/coolify               — Import from Coolify backup
POST /api/v1/import/railway               — Import from Railway project
GET  /api/v1/account/data-export          — GDPR full data export (all user data)
```

### 23.4 Lock-in Prevention Principles

1. **Standard formats only**: Docker images, OCI containers, standard Kubernetes manifests. No proprietary formats.
2. **OpenTelemetry native**: Telemetry data follows OTel standard. Switch to any OTel-compatible backend.
3. **No proprietary runtime**: Syntra agent manages standard Docker/K8s. Remove agent → apps keep running.
4. **DNS independence**: Custom domains point via CNAME. Change CNAME → traffic goes elsewhere instantly.
5. **Transparent pricing**: No hidden data egress fees. No transfer charges. Export is always free.

---

## 24. Multi-Tenancy & Isolation Architecture

### 24.1 Isolation Model

Syntra implements **logical multi-tenancy** at the control plane level and **physical isolation** at the data plane level.

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTROL PLANE (Shared)                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  PostgreSQL (shared, row-level security)              │   │
│  │  ├── org_id on every table                            │   │
│  │  ├── RLS policies enforce org boundaries              │   │
│  │  └── API layer validates org membership on every query│   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  ClickHouse (shared, partition by org_id)             │   │
│  │  ├── Telemetry partitioned by org_id + time           │   │
│  │  ├── Queries always include org_id filter             │   │
│  │  └── Retention policies enforced per-org              │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Redis (shared, key prefix by org)                    │   │
│  │  ├── Cache keys: org:{org_id}:resource:{id}           │   │
│  │  ├── Rate limiting scoped per org                     │   │
│  │  └── Pub/sub channels scoped per org                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Layer Security                                   │   │
│  │  ├── Auth middleware: validate session/token           │   │
│  │  ├── Org middleware: extract org_id, verify membership │   │
│  │  ├── RBAC middleware: check role permissions           │   │
│  │  └── All queries parameterized with org_id            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ DATA PLANE A │  │ DATA PLANE B │  │ DATA PLANE C │
│ (Org 1)      │  │ (Org 2)      │  │ (Org 2)      │
│ Physical     │  │ Physical     │  │ Physical     │
│ Isolation    │  │ Isolation    │  │ Isolation    │
│              │  │              │  │              │
│ Agent only   │  │ Agent only   │  │ Agent only   │
│ talks to     │  │ talks to     │  │ talks to     │
│ own org's    │  │ own org's    │  │ own org's    │
│ resources    │  │ resources    │  │ resources    │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 24.2 Isolation Boundaries

| Layer | Isolation Mechanism | Enforcement |
|-------|---------------------|-------------|
| Database (PostgreSQL) | Row-level security (RLS) with `org_id` | RLS policies + application-level WHERE clauses |
| Telemetry (ClickHouse) | Partition by `org_id`, mandatory filter | Query middleware injects org_id predicate |
| Cache (Redis) | Key prefix `org:{id}:` | Application-level key construction |
| WebSocket | Agent tokens scoped to org + server | Token validation on connection, message routing by org |
| Docker Registry | Per-org namespace: `registry.syntra.dev/{org}/` | Registry auth tokens scoped to org namespace |
| Build Workers | Isolated Docker-in-Docker per build | No shared filesystem. Container destroyed post-build. |
| Agent (Data Plane) | Agent token scoped to assigned server + org | mTLS cert encodes org_id. Server physically owned by user. |
| Environment Variables | AES-256-GCM encrypted, decryption key per org | Key derived from org-specific master key |
| API Tokens | Scoped to org, with permission bitmask | Token introspection includes org_id + permissions |

### 24.3 Cross-Tenant Security Guarantees

1. **No data leakage**: Organization A can never read, write, or infer data from Organization B. Enforced at database (RLS), API (middleware), and cache (key prefix) levels.
2. **No resource contention**: Rate limiting per-org prevents one tenant from starving others. Build queue priority weighted by plan tier.
3. **No compute interference**: Each user's apps run on their own servers (BYOS). Syntra's control plane is the only shared infrastructure.
4. **Audit-ready**: All cross-org access attempts logged and alerted. Penetration tested quarterly.

### 24.4 Enterprise Isolation (Future)

For Enterprise customers requiring stricter isolation:

- **Dedicated ClickHouse instance**: Separate telemetry storage, no shared tables.
- **Dedicated build workers**: Isolated build infrastructure, no shared Docker cache.
- **Data residency**: Choose control plane region (EU, US, APAC).
- **Private registry**: Dedicated Harbor instance, no shared namespace.
- **VPN/Private Link**: Agent connects via private network, not public internet.

---

## 25. Scalability Thresholds & Planning

### 25.1 Current Architecture Capacity Estimates

| Component | Threshold | Bottleneck | Scaling Strategy |
|-----------|-----------|------------|------------------|
| WebSocket Hub | ~5,000 concurrent agent connections | Memory (~2KB per connection + buffers) | Horizontal: shard by agent_id hash across N WebSocket nodes. Sticky routing via consistent hashing. |
| Telemetry Ingestion | ~50,000 events/second | ClickHouse write throughput + network I/O | Horizontal: Kafka/NATS buffer → multiple ingest workers → ClickHouse cluster. Batch writes. |
| Build Workers | ~20 concurrent builds | CPU + Docker daemon | Horizontal: add build worker nodes. Queue priority by plan tier. Spot/preemptible instances for cost. |
| PostgreSQL | ~10,000 queries/second | Connection pool, complex joins | Vertical first (bigger instance). Read replicas for dashboard queries. Partition large tables (deployments, error_events) by time. |
| ClickHouse | ~1 TB/month raw telemetry | Disk I/O, query complexity | Cluster mode (sharding + replication). Aggressive downsampling: 1s → 1min (after 7d) → 1hr (after 30d). TTL auto-delete. |
| Redis | ~100,000 ops/second | Memory | Redis Cluster (3+ nodes). Separate instances for cache vs queue vs pub/sub. |
| Docker Registry (Harbor) | ~10 TB images | S3 storage costs | S3 backend (virtually unlimited). Garbage collection for untagged images. Retention: keep last 20 images per service. |
| AI Analysis | ~100 concurrent requests | LLM API rate limits + cost | Queue with priority. Cache hit target >40%. Use Haiku for routine, Sonnet for complex. Parallel requests with rate limiter. |

### 25.2 Scaling Milestones

| Users | Servers | Events/Day | Infra Estimate | Architecture Changes Needed |
|-------|---------|------------|----------------|-----------------------------|
| 0-500 | 0-1,250 | <10M | Single node ($200/mo) | None. Monolith is fine. |
| 500-2,000 | 1,250-6,000 | 10-100M | 3-5 nodes ($500-1,500/mo) | Split WebSocket hub. Add ClickHouse replica. Read replica for PG. |
| 2,000-10,000 | 6,000-30,000 | 100M-1B | 10-20 nodes ($3,000-8,000/mo) | Kafka buffer for telemetry. ClickHouse cluster. Multiple build workers. CDN for static assets. |
| 10,000-50,000 | 30,000-150,000 | 1-10B | 30-50 nodes ($15,000-40,000/mo) | Full microservices split. Multi-region control plane. Dedicated ClickHouse cluster per region. Edge WebSocket nodes. |

### 25.3 Performance Budgets

| Operation | Target Latency | Max Acceptable |
|-----------|---------------|----------------|
| Dashboard page load | <1.5s | <3s |
| Deploy trigger → build start | <5s | <15s |
| Agent heartbeat round-trip | <100ms | <500ms |
| Telemetry ingest (event received → queryable) | <5s | <30s |
| AI analysis (trigger → result) | <8s | <30s |
| Log search query | <2s | <10s |
| Trace retrieval | <1s | <5s |
| Error group query (list view) | <500ms | <2s |

### 25.4 Load Testing Strategy

- **Synthetic agents**: Simulate 1,000+ agents with realistic telemetry patterns using a Rust load generator.
- **Telemetry flood test**: Generate 100K events/second sustained for 1 hour. Verify no data loss, acceptable latency.
- **Concurrent build test**: Queue 50 simultaneous builds. Verify queue fairness, no starvation.
- **WebSocket stress test**: 5,000 concurrent connections with message exchange. Verify memory stability.
- **Chaos engineering**: Kill random control plane components. Verify graceful degradation and recovery.

---

## 26. Testing & Quality Assurance Strategy

### 26.1 Testing Pyramid

```
                    ┌───────────┐
                    │   E2E     │  5% — Playwright (critical user flows)
                    │  Tests    │
                ┌───┴───────────┴───┐
                │  Integration      │  25% — API tests, DB tests, agent<>CP
                │  Tests            │
            ┌───┴───────────────────┴───┐
            │  Unit Tests               │  70% — Functions, modules, adapters
            │                           │
            └───────────────────────────┘
```

### 26.2 Test Coverage by Component

| Component | Framework | Target Coverage | Key Test Areas |
|-----------|-----------|-----------------|----------------|
| Control Plane (Next.js API) | Vitest + Supertest | >80% line coverage | API endpoint validation, auth/RBAC, build pipeline logic, telemetry processing, workflow execution |
| Dashboard (React) | Vitest + React Testing Library | >70% component coverage | Form validation, data rendering, real-time updates, error states |
| Rust Agent | `cargo test` + `tokio::test` | >85% line coverage | Docker adapter (deploy, stop, scale), K8s adapter, WebSocket protocol, OTLP receiver, buffer/batcher, health checks |
| SDK (JavaScript) | Vitest | >90% line coverage | Error capture, breadcrumbs, auto-instrumentation hooks, OTLP export, graceful degradation |
| SDK (Python) | pytest | >90% line coverage | Exception capture, WSGI/ASGI middleware, OTLP export, context propagation |
| CLI | `cargo test` + integration tests | >80% | Command parsing, API communication, output formatting |
| E2E Flows | Playwright | Critical paths only | Sign-up → deploy → view logs → AI analysis → rollback |

### 26.3 Agent-Specific Testing

The Rust agent requires special testing due to its interaction with Docker and Kubernetes APIs:

- **Mock Docker daemon**: Use `bollard` test utilities + Docker-in-Docker for integration tests. Test deploy, stop, logs, exec, rollback flows.
- **Mock Kubernetes API**: Use `kube-rs` mock server. Test Deployment/Service/Ingress CRUD, rolling updates, HPA configuration.
- **WebSocket protocol tests**: Mock control plane server. Test handshake, command execution, telemetry batching, reconnection logic, certificate rotation.
- **Fuzzing**: Fuzz OTLP receiver input with `cargo-fuzz`. Ensure no panics on malformed telemetry data.
- **Memory leak detection**: Run agent under `valgrind` / AddressSanitizer for 24-hour soak test. Verify stable memory usage.
- **Cross-platform**: CI builds and tests for both `linux/amd64` and `linux/arm64` targets.

### 26.4 CI/CD Pipeline

```
On every Pull Request:
  ├── Lint (ESLint, Clippy, Ruff)
  ├── Type check (TypeScript, Rust compiler, mypy)
  ├── Unit tests (all components, parallel)
  ├── Integration tests (API + DB, agent + mock Docker)
  ├── Build check (Next.js build, cargo build --release)
  └── Security scan (npm audit, cargo audit, Trivy for Docker images)

On merge to main:
  ├── All PR checks +
  ├── E2E tests (Playwright against staging)
  ├── Agent binary build (amd64 + arm64)
  ├── Docker image build + push to staging registry
  ├── Auto-deploy to staging environment
  └── Smoke tests against staging

On release tag:
  ├── All main checks +
  ├── Performance regression test (compare with baseline)
  ├── Agent binary publish (GitHub Releases)
  ├── SDK publish (npm, PyPI, crates.io)
  ├── Docker image push to production registry
  └── Staged rollout to production (canary → 25% → 100%)
```

### 26.5 Quality Gates

| Gate | Criteria | Enforcement |
|------|----------|-------------|
| PR merge | All tests pass, no new lint warnings, coverage not decreased | GitHub branch protection rules |
| Staging deploy | E2E tests pass, no critical security findings | CI pipeline gate |
| Production deploy | Staging smoke tests pass, no P0/P1 bugs open | Manual approval + automated checks |
| Agent release | All platform tests pass, no memory leaks, binary size within budget (<10MB) | Release checklist |
| SDK release | All SDK tests pass, backward compatibility verified, docs updated | Automated + maintainer review |

---

## 27. Documentation & Developer Education

### 27.1 Documentation Architecture

```
docs.syntra.dev
├── /getting-started
│   ├── quickstart             — Sign up → deploy in 10 minutes
│   ├── install-agent          — Agent installation guide (all OS)
│   ├── first-deploy           — Deploy your first app
│   ├── install-sdk            — Add observability (per language)
│   └── concepts               — Architecture overview, terminology
├── /platform
│   ├── servers                — Server management, multi-server setup
│   ├── projects               — Project & service configuration
│   ├── deployments            — Git deploy, rollback, preview envs
│   ├── networking             — Domains, SSL, Traefik config
│   ├── databases              — One-click databases, backups
│   ├── workflows              — Visual builder, YAML reference
│   └── environments           — Dev/staging/prod promotion
├── /observability
│   ├── error-tracking         — SDK error capture, issues, grouping
│   ├── tracing                — Distributed traces, waterfall
│   ├── logs                   — Log collection, search, filters
│   ├── metrics                — System & app metrics, dashboards
│   ├── health-checks          — Uptime monitoring, status pages
│   └── alerting               — Rules, channels, escalation
├── /ai
│   ├── error-analysis         — How AI analyzes errors
│   ├── anomaly-detection      — Baseline learning, deviation alerts
│   ├── copilot-chat           — Natural language queries
│   ├── dockerfile-generator   — AI Dockerfile generation
│   └── resource-advisor       — AI cost optimization
├── /sdk
│   ├── javascript             — @syntra/sdk reference
│   ├── python                 — syntra-sdk reference
│   ├── rust                   — syntra-sdk crate reference
│   ├── go                     — sdk-go reference
│   └── opentelemetry          — OTel compatibility guide
├── /api
│   ├── authentication         — API keys, OAuth, scopes
│   ├── reference              — Full REST API reference (OpenAPI)
│   ├── webhooks               — Webhook events & payloads
│   └── rate-limits            — Rate limiting by plan
├── /cli
│   ├── installation           — Install syn CLI
│   ├── commands               — Full command reference
│   └── configuration          — Config file reference
├── /self-hosting (future)
│   └── control-plane          — Self-host Syntra guide
├── /guides
│   ├── migrate-from-railway   — Step-by-step Railway migration
│   ├── migrate-from-coolify   — Step-by-step Coolify migration
│   ├── docker-to-kubernetes   — Upgrade path guide
│   ├── ci-cd-best-practices   — Workflow patterns & templates
│   └── security-hardening     — Production security checklist
└── /changelog                 — Release notes, feature announcements
```

### 27.2 Documentation Standards

- **Framework**: Docusaurus or Mintlify (MDX-based, full-text search, versioning).
- **Code examples**: Every API endpoint includes curl + JavaScript + Python examples. Runnable code snippets.
- **Interactive**: Embedded API explorer (try endpoints from docs). SDK playground (CodeSandbox/StackBlitz).
- **Versioned**: Documentation versioned per major release. SDK docs auto-generated from JSDoc/docstrings.
- **Search**: Algolia DocSearch or built-in full-text search. AI-powered search ("How do I set up alerts for my FastAPI app?").
- **Feedback**: "Was this helpful?" widget on every page. GitHub-based edit suggestions.
- **Freshness**: Docs reviewed monthly. Broken link checker in CI. Coverage report: every API endpoint and SDK method must have docs.

### 27.3 Developer Education Content

| Content Type | Platform | Frequency | Purpose |
|-------------|----------|-----------|---------|
| Quickstart tutorials | docs.syntra.dev | Evergreen | Onboarding |
| Video walkthroughs | YouTube | Bi-weekly | Visual learners, SEO |
| Blog posts (technical) | blog.syntra.dev | Weekly | SEO, thought leadership, feature announcements |
| Changelog | docs.syntra.dev/changelog | Per release | Transparency, feature discovery |
| Discord community | discord.gg/syntra | Always-on | Support, feedback, community building |
| Example projects | github.com/syntra-dev/examples | Ongoing | Reference implementations per framework |
| Template gallery | syntra.dev/templates | Ongoing | One-click deploy demos |
| API reference (OpenAPI) | docs.syntra.dev/api | Auto-generated | Developer reference |
| Architecture Decision Records | github.com/syntra-dev/adr | As needed | Technical transparency |

---

## 28. Open Source Strategy & Licensing

### 28.1 Open Source Philosophy

Syntra follows a **open-core model**: core components are open source to build trust and community, while advanced features and the control plane remain proprietary SaaS.

### 28.2 Open Source vs Proprietary Split

| Component | License | Repository | Rationale |
|-----------|---------|-----------|-----------|
| Syntra Agent | Apache 2.0 | `syntra-dev/agent` | Trust: users need to verify what runs on their servers. Community contributions for platform support. |
| JavaScript SDK | MIT | `syntra-dev/sdk-js` | Adoption: low barrier. SDK value is in the platform, not the SDK itself. |
| Python SDK | MIT | `syntra-dev/sdk-python` | Same as JS SDK. |
| Rust SDK | MIT / Apache 2.0 (dual) | `syntra-dev/sdk-rust` | Standard Rust ecosystem licensing. |
| Go SDK | MIT | `syntra-dev/sdk-go` | Adoption. |
| CLI (`syn`) | Apache 2.0 | `syntra-dev/cli` | Developer trust. CLI is a client tool, not the moat. |
| Install scripts | MIT | `syntra-dev/install` | Transparency. Users need to see what install scripts do. |
| Example projects | MIT | `syntra-dev/examples` | Education. |
| Documentation | CC BY 4.0 | `syntra-dev/docs` | Community contributions to docs. |
| **Control Plane** | **Proprietary** | Private | Core business value: dashboard, API, build system, AI engine, telemetry processing. |
| **AI Engine** | **Proprietary** | Private | Key differentiator. Prompt engineering, analysis pipeline, caching logic. |
| **Workflow Engine** | **Proprietary** | Private | Complex business logic, visual builder. |
| **Billing System** | **Proprietary** | Private | Revenue infrastructure. |

### 28.3 Community Engagement

- **Contributing guide**: CONTRIBUTING.md with code style, PR process, issue templates, CLA.
- **Good first issues**: Label beginner-friendly issues in agent/SDK repos. Mentorship for first-time contributors.
- **RFC process**: Major agent/SDK changes proposed as RFCs (Request for Comments) in a public repo. Community feedback before implementation.
- **Release process**: Semantic versioning. Changelog per release. GitHub Releases with binary artifacts.
- **Community governance**: Syntra team maintains final decision authority. Top contributors acknowledged in releases and website.

### 28.4 Competitive Moat Through Open Source

| Strategy | Implementation |
|----------|---------------|
| Build trust | Agent source visible → users verify security. No "black box" on their servers. |
| Increase adoption | MIT SDKs → zero friction integration. Developers try before they buy. |
| Community contributions | Agent support for new Linux distros, Docker versions, K8s versions contributed by community. |
| Hiring pipeline | Open source contributors = potential hires who already know the codebase. |
| Developer advocacy | GitHub stars = social proof. Community = organic word-of-mouth marketing. |
| Defensibility | Open sourcing the agent + SDK is table stakes. The moat is the integrated platform + AI — not the agent binary itself. |

---

## 29. Legal, Compliance & SLA Framework

### 29.1 Legal Entities & Structure

| Aspect | Detail |
|--------|--------|
| Operating entity | PT. Kreasi Media Asia (INSIGNIA) — Indonesia |
| Product brand | Syntra |
| Data processing | Control plane hosted in EU (Hetzner Falkenstein) initially. Multi-region expansion planned. |
| Terms of Service | Standard SaaS ToS. Users own their data. Syntra provides platform access. |
| Privacy Policy | GDPR-compliant. Minimal data collection. Telemetry data owned by user. |
| DPA (Data Processing Agreement) | Available for Team and Enterprise plans. |
| Acceptable Use Policy | No illegal content, no crypto mining, no resource abuse, no spam/phishing. |

### 29.2 GDPR Compliance

| Requirement | Implementation |
|------------|----------------|
| Right to access | User can export all data via API (`/api/v1/account/data-export`). Dashboard export button. |
| Right to erasure | Account deletion removes all user data within 30 days. Telemetry purged from ClickHouse. Backups rotated out within 90 days. |
| Right to portability | Export in standard formats: JSON, CSV, Docker Compose, K8s manifests. |
| Data minimization | SDK collects no PII by default. Telemetry metadata only. Opt-in for user context. |
| Breach notification | Notify affected users within 72 hours. Incident response plan documented. |
| Consent | Explicit consent for data processing at sign-up. Opt-out available for non-essential analytics. |
| DPA | Standard DPA template available. Custom DPA for Enterprise customers. |

### 29.3 SOC 2 Roadmap

| Phase | Timeline | Scope |
|-------|----------|-------|
| Gap assessment | Month 6 | Identify gaps against SOC 2 Type I criteria |
| Implementation | Month 6-12 | Implement controls: access management, change management, incident response, encryption |
| Type I audit | Month 12-15 | Point-in-time assessment of control design |
| Type II audit | Month 18-24 | Sustained assessment of control effectiveness (6-12 month observation) |

### 29.4 Service Level Agreements (SLA)

**SLA applies to control plane availability only.** User's server uptime is the user's responsibility. Syntra guarantees the management layer.

| Plan | Uptime SLA | Monthly Credit |
|------|-----------|----------------|
| Free | No SLA | None |
| Pro | 99.5% | None |
| Team | 99.9% | 10% credit per 0.1% below SLA |
| Enterprise | 99.95% | 25% credit per 0.05% below SLA, custom terms |

**SLA Exclusions:**
- Scheduled maintenance (announced 48h in advance, max 4h/month).
- Force majeure (natural disasters, war, government action).
- User's server/network issues.
- Third-party service outages (GitHub, Stripe, LLM providers).
- Beta/preview features.

**SLA Measurement:**
- Measured monthly (calendar month).
- Uptime = (total minutes - downtime minutes) / total minutes × 100.
- Downtime defined as: dashboard inaccessible AND API returning errors AND agents unable to connect for >5 consecutive minutes.
- Monitored by independent external service (Pingdom/BetterStack).

### 29.5 Incident Response Plan

| Severity | Definition | Response Time | Resolution Target | Communication |
|----------|-----------|---------------|-------------------|---------------|
| P0 — Critical | Control plane fully down. All users affected. Data loss risk. | <15 min | <1 hour | Status page, Twitter, email blast |
| P1 — Major | Significant feature unavailable. >10% users affected. No data loss. | <30 min | <4 hours | Status page, affected user email |
| P2 — Minor | Non-critical feature degraded. <10% users affected. Workaround available. | <2 hours | <24 hours | Status page |
| P3 — Low | Cosmetic issue. Single user affected. No functional impact. | <24 hours | Next release cycle | Support ticket response |

### 29.6 Intellectual Property

- Syntra name and logo: trademark registration pending (Indonesia, US, EU).
- Agent source code: Apache 2.0 (copyleft-free, allows commercial use).
- SDK source code: MIT (permissive, maximum adoption).
- Control plane code: proprietary, all rights reserved.
- User data: users retain full ownership. Syntra has processing rights only per DPA.
- AI-generated content (Dockerfiles, analysis): non-exclusive, royalty-free license to user. Syntra may use anonymized patterns to improve AI models.

### 29.7 Insurance & Liability

- Professional indemnity insurance: planned for post-revenue ($1M+ ARR).
- Liability cap: as defined in Terms of Service — limited to fees paid in last 12 months.
- No liability for user's application bugs, data loss on user's servers, or third-party service failures.

---

## 30. Appendix

### 30.1 Glossary

| Term | Definition |
|------|-----------|
| BYOS | Bring Your Own Server — user provides VPS, Syntra provides management layer |
| Control Plane | SaaS-hosted components: dashboard, API, build system, AI engine |
| Data Plane | User's server(s) running the Syntra agent |
| Agent | Lightweight Rust binary (~8MB) installed on user's servers |
| OTLP | OpenTelemetry Protocol — standard protocol for telemetry data |
| Fingerprint | Hash that identifies unique error types for grouping |
| Span | Single unit of work in a distributed trace (e.g., one HTTP request) |
| DAG | Directed Acyclic Graph — workflow pipeline structure |
| Nixpacks | Build system that auto-detects language/framework and builds Docker images |
| mTLS | Mutual TLS — both client and server verify each other's certificates |
| DSN | Data Source Name — connection string for SDK to send telemetry |

### 30.2 References

- OpenTelemetry Specification: https://opentelemetry.io/docs/specs/
- Sentry SDK Architecture: https://develop.sentry.dev/sdk/
- Railway Architecture Blog: https://blog.railway.app/
- Coolify GitHub: https://github.com/coollabsio/coolify
- Dokploy GitHub: https://github.com/Dokploy/dokploy
- ClickHouse for Observability: https://clickhouse.com/docs/en/use-cases/observability
- Traefik Proxy: https://doc.traefik.io/traefik/
- Bollard (Rust Docker): https://docs.rs/bollard/
- Kube-rs (Rust K8s): https://docs.rs/kube/

### 30.3 Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-31 | Bima Pangestu | Initial draft — architecture, features, competitive analysis |
| 1.0 | 2026-01-31 | Bima Pangestu | Complete PRD — AI Ops observability, SDK, security, roadmap, KPIs |
| 2.0 | 2026-01-31 | Bima Pangestu | Renamed from DeployFlow to Syntra (trademark conflict). Added 10 sections: Onboarding, GTM, Agent Failure Modes, Migration, Multi-Tenancy, Scalability, Testing, Documentation, Open Source, Legal/Compliance. |

---

*This document is confidential and intended for internal use only. Distribution outside the team requires written approval.*

*© 2026 Syntra — Catalystlabs. All rights reserved.*