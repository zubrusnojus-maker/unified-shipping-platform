.PHONY: help install build dev clean docker-up docker-down docker-build docker-logs

# Default target
help:
	@echo "Unified Shipping Platform - Available commands:"
	@echo ""
	@echo "Development:"
	@echo "  make install      - Install all dependencies"
	@echo "  make build        - Build all packages and apps"
	@echo "  make dev          - Start development servers"
	@echo "  make clean        - Remove build artifacts and node_modules"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up    - Start all services with Docker Compose"
	@echo "  make docker-down  - Stop all Docker services"
	@echo "  make docker-build - Build Docker images"
	@echo "  make docker-logs  - View Docker logs"
	@echo ""
	@echo "Infrastructure:"
	@echo "  make infra-up     - Start infrastructure only (Postgres, Redis, n8n)"
	@echo "  make infra-down   - Stop infrastructure"
	@echo ""
	@echo "Individual services:"
	@echo "  make api-dev      - Run API in development mode"
	@echo "  make manager-dev  - Run Agent Manager in development mode"
	@echo "  make worker-dev   - Run Agent Worker in development mode"

# ===========================================
# Development
# ===========================================

install:
	pnpm install

build:
	pnpm run build

dev:
	pnpm run dev

clean:
	pnpm run clean
	rm -rf node_modules
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	find . -name "dist" -type d -prune -exec rm -rf '{}' +

# ===========================================
# Docker
# ===========================================

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-build:
	docker-compose build

docker-logs:
	docker-compose logs -f

docker-clean:
	docker-compose down -v --remove-orphans
	docker system prune -f

# ===========================================
# Infrastructure only
# ===========================================

infra-up:
	docker-compose up -d postgres redis n8n

infra-down:
	docker-compose stop postgres redis n8n

# ===========================================
# Individual services (local development)
# ===========================================

api-dev:
	cd apps/api && pnpm run dev

manager-dev:
	cd apps/agent-manager && pnpm run dev

worker-dev:
	cd apps/agent-worker && pnpm run dev

# ===========================================
# Database
# ===========================================

db-migrate:
	PGPASSWORD=$(POSTGRES_PASSWORD) psql -h localhost -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f sql/schema.sql

db-shell:
	PGPASSWORD=$(POSTGRES_PASSWORD) psql -h localhost -U $(POSTGRES_USER) -d $(POSTGRES_DB)

redis-cli:
	docker-compose exec redis redis-cli

# ===========================================
# Testing
# ===========================================

test:
	pnpm run test

test-watch:
	pnpm run test -- --watch
