# Monorepo & DevOps Setup Guide

**Version:** 1.0
**Date:** January 31, 2026

---

## 1. Monorepo Structure

```
syntra/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # Main CI pipeline
│   │   ├── release-agent.yml         # Agent release
│   │   ├── release-sdk.yml           # SDK releases
│   │   └── deploy.yml                # Deployment workflow
│   ├── CODEOWNERS
│   └── PULL_REQUEST_TEMPLATE.md
├── apps/
│   ├── dashboard/                    # Next.js control plane
│   │   ├── src/
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   └── landing/                      # Marketing website (optional)
│       └── ...
├── agents/
│   └── syntra-agent/                 # Rust agent
│       ├── src/
│       ├── Cargo.toml
│       ├── Cargo.lock
│       └── Dockerfile
├── packages/
│   ├── sdk-js/                       # JavaScript/TypeScript SDK
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── vitest.config.ts
│   ├── sdk-python/                   # Python SDK
│   │   ├── syntra_sdk/
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── poetry.lock
│   ├── cli/                          # Rust CLI tool
│   │   ├── src/
│   │   └── Cargo.toml
│   ├── contracts/                    # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── api.ts
│   │   │   ├── agent.ts
│   │   │   └── telemetry.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ui/                           # Shared UI components (optional)
│       ├── src/
│       └── package.json
├── services/
│   ├── build-worker/                 # Docker build worker
│   │   ├── src/
│   │   ├── package.json
│   │   └── Dockerfile
│   └── telemetry-ingest/             # Telemetry ingestion (future)
│       └── ...
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml        # Local development
│   │   ├── docker-compose.prod.yml   # Production
│   │   └── docker-compose.test.yml   # Testing
│   ├── k8s/                          # Kubernetes manifests
│   │   ├── base/
│   │   ├── overlays/
│   │   │   ├── staging/
│   │   │   └── production/
│   │   └── kustomization.yaml
│   └── terraform/                    # Infrastructure as Code
│       ├── modules/
│       ├── environments/
│       │   ├── staging/
│       │   └── production/
│       └── main.tf
├── scripts/
│   ├── setup.sh                      # Dev environment setup
│   ├── test-all.sh                   # Run all tests
│   ├── lint-all.sh                   # Run all linters
│   └── release.sh                    # Release automation
├── docs/
│   ├── PRD.md
│   ├── DEVELOPMENT_PLAN.md
│   ├── specs/
│   │   ├── INTERFACE_CONTRACTS.md
│   │   ├── WORKSTREAM_AGENT.md
│   │   ├── WORKSTREAM_CONTROL_PLANE.md
│   │   └── SETUP_MONOREPO_DEVOPS.md
│   └── api/
│       └── openapi.yaml
├── .env.example
├── .gitignore
├── .prettierrc
├── .eslintrc.js
├── turbo.json                        # Turborepo config
├── pnpm-workspace.yaml               # pnpm workspaces
├── package.json                      # Root package.json
├── Cargo.toml                        # Rust workspace
├── rust-toolchain.toml
└── README.md
```

---

## 2. Initial Setup

### 2.1 Prerequisites

```bash
# Required tools
node >= 20.0.0
pnpm >= 8.0.0
rust >= 1.75.0
docker >= 24.0.0
docker-compose >= 2.0.0
go >= 1.21 (optional, for some tools)

# Recommended tools
just           # Command runner (alternative to make)
direnv         # Environment management
act            # Local GitHub Actions testing
```

### 2.2 Setup Script

```bash
#!/bin/bash
# scripts/setup.sh

set -e

echo "Setting up Syntra development environment..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "node is required but not installed."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required. Install with: npm install -g pnpm"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "cargo is required. Install Rust from rustup.rs"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker is required but not installed."; exit 1; }

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
pnpm install

# Setup Rust toolchain
echo "Setting up Rust toolchain..."
rustup default stable
rustup component add clippy rustfmt
cargo fetch --manifest-path agents/syntra-agent/Cargo.toml
cargo fetch --manifest-path packages/cli/Cargo.toml

# Setup Python SDK
echo "Setting up Python SDK..."
cd packages/sdk-python
python -m venv .venv
source .venv/bin/activate
pip install poetry
poetry install
cd ../..

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file. Please update with your values."
fi

# Start development services
echo "Starting development services..."
docker compose -f infra/docker/docker-compose.yml up -d

# Wait for services
echo "Waiting for services to be ready..."
sleep 10

# Run database migrations
echo "Running database migrations..."
pnpm --filter dashboard db:migrate

# Seed development data (optional)
# pnpm --filter dashboard db:seed

echo ""
echo "Setup complete! Run the following to start development:"
echo ""
echo "  # Terminal 1: Dashboard"
echo "  pnpm --filter dashboard dev"
echo ""
echo "  # Terminal 2: Agent (optional)"
echo "  cd agents/syntra-agent && cargo run -- start --config config/dev.toml"
echo ""
echo "  # Terminal 3: Build worker"
echo "  pnpm --filter build-worker dev"
echo ""
```

### 2.3 Root Configuration Files

```json
// package.json
{
  "name": "syntra",
  "private": true,
  "packageManager": "pnpm@8.15.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "clean": "turbo clean && rm -rf node_modules",
    "db:migrate": "pnpm --filter dashboard db:migrate",
    "db:push": "pnpm --filter dashboard db:push",
    "db:studio": "pnpm --filter dashboard db:studio",
    "prepare": "husky install"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "husky": "^8.0.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.2.0",
    "turbo": "^1.12.0",
    "typescript": "^5.3.0"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ]
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "db:migrate": {
      "cache": false
    },
    "db:push": {
      "cache": false
    }
  }
}
```

```toml
# Cargo.toml (workspace root)
[workspace]
resolver = "2"
members = [
    "agents/syntra-agent",
    "packages/cli",
]

[workspace.package]
version = "0.1.0"
edition = "2024"
authors = ["Syntra <team@syntra.dev>"]
license = "Apache-2.0"
repository = "https://github.com/syntra-dev/syntra"

[workspace.dependencies]
tokio = { version = "1.35", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
anyhow = "1.0"
thiserror = "1.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
uuid = { version = "1.6", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
```

```toml
# rust-toolchain.toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
targets = ["x86_64-unknown-linux-musl", "aarch64-unknown-linux-musl"]
```

---

## 3. Docker Compose (Local Development)

```yaml
# infra/docker/docker-compose.yml
version: '3.8'

services:
  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    container_name: syntra-postgres
    environment:
      POSTGRES_USER: syntra
      POSTGRES_PASSWORD: syntra_dev_password
      POSTGRES_DB: syntra
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U syntra"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    container_name: syntra-redis
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ClickHouse
  clickhouse:
    image: clickhouse/clickhouse-server:24.1
    container_name: syntra-clickhouse
    environment:
      CLICKHOUSE_USER: syntra
      CLICKHOUSE_PASSWORD: syntra_dev_password
      CLICKHOUSE_DB: syntra_telemetry
    ports:
      - "8123:8123"   # HTTP
      - "9000:9000"   # Native
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./clickhouse-init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD", "clickhouse-client", "--query", "SELECT 1"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Docker Registry (Harbor alternative for dev)
  registry:
    image: registry:2
    container_name: syntra-registry
    ports:
      - "5000:5000"
    volumes:
      - registry_data:/var/lib/registry

  # Traefik (for local agent testing)
  traefik:
    image: traefik:v3.0
    container_name: syntra-traefik
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"   # Dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_certs:/etc/traefik/certs

  # Mailhog (email testing)
  mailhog:
    image: mailhog/mailhog
    container_name: syntra-mailhog
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI

volumes:
  postgres_data:
  redis_data:
  clickhouse_data:
  registry_data:
  traefik_certs:

networks:
  default:
    name: syntra-network
```

```sql
-- infra/docker/init-db.sql
-- PostgreSQL initialization

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create additional databases if needed
-- CREATE DATABASE syntra_test;
```

```sql
-- infra/docker/clickhouse-init.sql
-- ClickHouse initialization

CREATE DATABASE IF NOT EXISTS syntra_telemetry;

-- Traces table
CREATE TABLE IF NOT EXISTS syntra_telemetry.traces (
    trace_id String,
    span_id String,
    parent_span_id String,
    service_id UUID,
    deployment_id UUID,
    operation_name String,
    span_kind Enum8('internal' = 0, 'server' = 1, 'client' = 2, 'producer' = 3, 'consumer' = 4),
    start_time DateTime64(9, 'UTC'),
    duration_ns UInt64,
    status_code Enum8('unset' = 0, 'ok' = 1, 'error' = 2),
    status_message String,
    attributes Map(String, String),
    events String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_id, start_time, trace_id, span_id)
TTL start_time + INTERVAL 30 DAY;

-- Logs table
CREATE TABLE IF NOT EXISTS syntra_telemetry.logs (
    timestamp DateTime64(9, 'UTC'),
    service_id UUID,
    deployment_id UUID,
    level Enum8('trace' = 0, 'debug' = 1, 'info' = 2, 'warn' = 3, 'error' = 4, 'fatal' = 5),
    message String,
    attributes Map(String, String),
    trace_id Nullable(String),
    span_id Nullable(String),
    source Enum8('stdout' = 0, 'stderr' = 1, 'sdk' = 2)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, timestamp)
TTL timestamp + INTERVAL 30 DAY;

-- Metrics table
CREATE TABLE IF NOT EXISTS syntra_telemetry.metrics (
    timestamp DateTime,
    service_id UUID,
    server_id UUID,
    metric_name String,
    metric_type Enum8('gauge' = 0, 'counter' = 1, 'histogram' = 2),
    value Float64,
    labels Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, metric_name, timestamp)
TTL timestamp + INTERVAL 7 DAY;
```

---

## 4. Environment Variables

```bash
# .env.example

# ============================================
# Application
# ============================================
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000

# ============================================
# Database
# ============================================
DATABASE_URL=postgresql://syntra:syntra_dev_password@localhost:5432/syntra

# ============================================
# Redis
# ============================================
REDIS_URL=redis://localhost:6379

# ============================================
# ClickHouse
# ============================================
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=syntra
CLICKHOUSE_PASSWORD=syntra_dev_password
CLICKHOUSE_DATABASE=syntra_telemetry

# ============================================
# Docker Registry
# ============================================
REGISTRY_URL=localhost:5000
REGISTRY_USERNAME=
REGISTRY_PASSWORD=

# ============================================
# Auth (NextAuth.js)
# ============================================
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-change-in-production

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# ============================================
# GitHub App (for webhooks)
# ============================================
GITHUB_APP_ID=your-github-app-id
GITHUB_APP_PRIVATE_KEY=your-github-app-private-key
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# ============================================
# AI (Claude API)
# ============================================
ANTHROPIC_API_KEY=your-anthropic-api-key

# ============================================
# Stripe (billing)
# ============================================
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# ============================================
# Email (development uses Mailhog)
# ============================================
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=noreply@syntra.dev

# ============================================
# Encryption
# ============================================
ENCRYPTION_KEY=your-32-byte-encryption-key-here

# ============================================
# Agent Configuration
# ============================================
AGENT_WS_ENDPOINT=ws://localhost:3000/agent/ws
```

---

## 5. CI/CD Pipeline

### 5.1 Main CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  # Detect changes
  changes:
    runs-on: ubuntu-latest
    outputs:
      dashboard: ${{ steps.filter.outputs.dashboard }}
      agent: ${{ steps.filter.outputs.agent }}
      sdk-js: ${{ steps.filter.outputs.sdk-js }}
      sdk-python: ${{ steps.filter.outputs.sdk-python }}
      cli: ${{ steps.filter.outputs.cli }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            dashboard:
              - 'apps/dashboard/**'
              - 'packages/contracts/**'
            agent:
              - 'agents/syntra-agent/**'
            sdk-js:
              - 'packages/sdk-js/**'
            sdk-python:
              - 'packages/sdk-python/**'
            cli:
              - 'packages/cli/**'

  # Lint all
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Lint (ESLint + Prettier)
        run: pnpm lint

      - name: Typecheck
        run: pnpm turbo typecheck

  # Dashboard tests
  test-dashboard:
    needs: [changes, lint]
    if: needs.changes.outputs.dashboard == 'true'
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: syntra_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Run migrations
        run: pnpm --filter dashboard db:push
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/syntra_test

      - name: Run tests
        run: pnpm --filter dashboard test --coverage
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/syntra_test
          REDIS_URL: redis://localhost:6379

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: apps/dashboard/coverage/lcov.info
          flags: dashboard

  # Agent tests
  test-agent:
    needs: [changes]
    if: needs.changes.outputs.agent == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: agents/syntra-agent

      - name: Check formatting
        run: cargo fmt --manifest-path agents/syntra-agent/Cargo.toml -- --check

      - name: Clippy
        run: cargo clippy --manifest-path agents/syntra-agent/Cargo.toml -- -D warnings

      - name: Run tests
        run: cargo test --manifest-path agents/syntra-agent/Cargo.toml

  # SDK JS tests
  test-sdk-js:
    needs: [changes, lint]
    if: needs.changes.outputs.sdk-js == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @syntra/sdk test --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: packages/sdk-js/coverage/lcov.info
          flags: sdk-js

  # SDK Python tests
  test-sdk-python:
    needs: [changes]
    if: needs.changes.outputs.sdk-python == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Poetry
        run: pip install poetry

      - name: Install dependencies
        run: |
          cd packages/sdk-python
          poetry install

      - name: Lint
        run: |
          cd packages/sdk-python
          poetry run ruff check .
          poetry run mypy .

      - name: Run tests
        run: |
          cd packages/sdk-python
          poetry run pytest --cov=syntra_sdk --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: packages/sdk-python/coverage.xml
          flags: sdk-python

  # Build dashboard
  build-dashboard:
    needs: [test-dashboard]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter dashboard build

      - name: Build Docker image
        run: |
          docker build -t syntra-dashboard:${{ github.sha }} apps/dashboard

  # Build agent
  build-agent:
    needs: [test-agent]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target:
          - x86_64-unknown-linux-musl
          - aarch64-unknown-linux-musl
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: agents/syntra-agent

      - name: Install cross
        run: cargo install cross --git https://github.com/cross-rs/cross

      - name: Build
        run: |
          cross build --release --target ${{ matrix.target }} \
            --manifest-path agents/syntra-agent/Cargo.toml

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: agent-${{ matrix.target }}
          path: agents/syntra-agent/target/${{ matrix.target }}/release/syntra-agent

  # E2E tests (on main only)
  e2e:
    if: github.ref == 'refs/heads/main'
    needs: [build-dashboard, build-agent]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Install Playwright
        run: pnpm --filter dashboard exec playwright install --with-deps

      - name: Start services
        run: docker compose -f infra/docker/docker-compose.test.yml up -d

      - name: Run E2E tests
        run: pnpm --filter dashboard test:e2e

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-results
          path: apps/dashboard/playwright-report/
```

### 5.2 Agent Release Workflow

```yaml
# .github/workflows/release-agent.yml
name: Release Agent

on:
  push:
    tags:
      - 'agent-v*'

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - target: x86_64-unknown-linux-musl
            name: linux-amd64
          - target: aarch64-unknown-linux-musl
            name: linux-arm64

    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Install cross
        run: cargo install cross --git https://github.com/cross-rs/cross

      - name: Build release
        run: |
          cross build --release --target ${{ matrix.target }} \
            --manifest-path agents/syntra-agent/Cargo.toml

      - name: Strip binary
        run: |
          strip agents/syntra-agent/target/${{ matrix.target }}/release/syntra-agent || true

      - name: Package
        run: |
          VERSION=${GITHUB_REF#refs/tags/agent-v}
          ARCHIVE=syntra-agent-${VERSION}-${{ matrix.name }}.tar.gz
          tar -czvf ${ARCHIVE} \
            -C agents/syntra-agent/target/${{ matrix.target }}/release \
            syntra-agent
          sha256sum ${ARCHIVE} > ${ARCHIVE}.sha256

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: agent-${{ matrix.name }}
          path: |
            syntra-agent-*.tar.gz
            syntra-agent-*.tar.gz.sha256

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4

      - name: Create release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            agent-*/syntra-agent-*.tar.gz
            agent-*/syntra-agent-*.tar.gz.sha256
          generate_release_notes: true
```

### 5.3 Deployment Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/main' || inputs.environment == 'staging'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-central-1

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Dashboard
        run: |
          docker build -t ${{ steps.login-ecr.outputs.registry }}/syntra-dashboard:${{ github.sha }} apps/dashboard
          docker push ${{ steps.login-ecr.outputs.registry }}/syntra-dashboard:${{ github.sha }}

      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/dashboard \
            dashboard=${{ steps.login-ecr.outputs.registry }}/syntra-dashboard:${{ github.sha }} \
            --namespace syntra-staging

  deploy-production:
    if: inputs.environment == 'production'
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      # Similar to staging but with production namespace
```

---

## 6. Git Workflow

### 6.1 Branch Strategy

```
main                    # Production-ready code
├── develop             # Integration branch
├── feature/xxx         # New features
├── fix/xxx             # Bug fixes
├── chore/xxx           # Maintenance
└── release/x.x.x       # Release preparation
```

### 6.2 Commit Convention

```
<type>(<scope>): <subject>

Types:
  feat     - New feature
  fix      - Bug fix
  docs     - Documentation
  style    - Formatting, missing semicolons, etc.
  refactor - Code restructuring
  test     - Adding tests
  chore    - Maintenance tasks

Scopes:
  dashboard  - Control plane dashboard
  agent      - Rust agent
  sdk-js     - JavaScript SDK
  sdk-py     - Python SDK
  cli        - CLI tool
  infra      - Infrastructure
  docs       - Documentation

Examples:
  feat(dashboard): add server metrics chart
  fix(agent): handle WebSocket reconnection
  docs(sdk-js): add usage examples
  chore(infra): update Docker Compose
```

### 6.3 Pull Request Template

```markdown
<!-- .github/PULL_REQUEST_TEMPLATE.md -->
## Description
<!-- Describe your changes -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
<!-- How was this tested? -->

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing tests pass locally
- [ ] I have updated relevant documentation
- [ ] My changes don't introduce new warnings
```

---

## 7. Quick Commands Reference

```bash
# Development
pnpm dev                           # Start all apps in dev mode
pnpm --filter dashboard dev        # Start dashboard only
pnpm --filter build-worker dev     # Start build worker

# Rust agent
cd agents/syntra-agent
cargo run -- start --config config/dev.toml
cargo test
cargo clippy

# Database
pnpm --filter dashboard db:migrate  # Run migrations
pnpm --filter dashboard db:push     # Push schema changes
pnpm --filter dashboard db:studio   # Open Drizzle Studio

# Testing
pnpm test                           # Run all tests
pnpm --filter dashboard test        # Dashboard tests
cargo test --manifest-path agents/syntra-agent/Cargo.toml

# Linting
pnpm lint                           # Lint all JS/TS
cargo clippy                        # Lint Rust
pnpm format                         # Format all files

# Docker
docker compose -f infra/docker/docker-compose.yml up -d    # Start services
docker compose -f infra/docker/docker-compose.yml down     # Stop services
docker compose -f infra/docker/docker-compose.yml logs -f  # View logs

# Build
pnpm build                          # Build all apps
cargo build --release               # Build Rust in release mode

# Clean
pnpm clean                          # Clean all node_modules and caches
cargo clean                         # Clean Rust build
```
