#!/bin/bash
# Syntra Development Environment Setup Script

set -e

echo "========================================"
echo "  Syntra Development Environment Setup"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 found"
        return 0
    else
        echo -e "${RED}✗${NC} $1 not found"
        return 1
    fi
}

echo "Checking prerequisites..."
echo ""

MISSING=0
check_command node || MISSING=1
check_command pnpm || { echo "  Install with: npm install -g pnpm"; MISSING=1; }
check_command cargo || { echo "  Install from: https://rustup.rs"; MISSING=1; }
check_command docker || MISSING=1
check_command docker-compose || check_command "docker compose" || MISSING=1

if [ $MISSING -eq 1 ]; then
    echo ""
    echo -e "${RED}Missing required tools. Please install them and try again.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}All prerequisites found!${NC}"
echo ""

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
pnpm install

# Setup Rust toolchain
echo ""
echo "Setting up Rust toolchain..."
rustup default stable 2>/dev/null || true
rustup component add clippy rustfmt 2>/dev/null || true

# Fetch Rust dependencies
echo "Fetching Rust dependencies..."
cargo fetch --manifest-path agents/syntra-agent/Cargo.toml 2>/dev/null || true

# Copy environment file if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo -e "${YELLOW}Created .env file from .env.example${NC}"
    echo "Please update .env with your configuration values."
fi

# Start Docker services
echo ""
echo "Starting Docker services..."
docker compose -f infra/docker/docker-compose.yml up -d

echo ""
echo "Waiting for services to be ready..."
sleep 5

# Check if PostgreSQL is ready
echo "Checking PostgreSQL..."
for i in {1..30}; do
    if docker exec syntra-postgres pg_isready -U syntra &>/dev/null; then
        echo -e "${GREEN}✓${NC} PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗${NC} PostgreSQL failed to start"
        exit 1
    fi
    sleep 1
done

# Check if Redis is ready
echo "Checking Redis..."
for i in {1..30}; do
    if docker exec syntra-redis redis-cli ping &>/dev/null; then
        echo -e "${GREEN}✓${NC} Redis is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗${NC} Redis failed to start"
        exit 1
    fi
    sleep 1
done

echo ""
echo "========================================"
echo -e "${GREEN}  Setup Complete!${NC}"
echo "========================================"
echo ""
echo "To start development:"
echo ""
echo "  # Terminal 1: Start Dashboard"
echo "  cd apps/dashboard && pnpm dev"
echo ""
echo "  # Terminal 2: Start Agent (optional)"
echo "  cd agents/syntra-agent && cargo run -- start --config config/dev.toml"
echo ""
echo "Services running:"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis:      localhost:6379"
echo "  - ClickHouse: localhost:8123"
echo "  - Registry:   localhost:5000"
echo "  - Traefik:    localhost:8080 (dashboard)"
echo "  - Mailhog:    localhost:8025 (email UI)"
echo ""
echo "To stop services:"
echo "  docker compose -f infra/docker/docker-compose.yml down"
echo ""
