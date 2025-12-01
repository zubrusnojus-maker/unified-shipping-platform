# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (via Turborepo)
pnpm run build

# Development mode (all apps)
pnpm run dev

# Lint
pnpm run lint

# Run tests
pnpm run test

# Run a single package's tests
pnpm --filter @unified/dashboard test

# Start infrastructure (Postgres, Redis, n8n)
make infra-up

# Individual services in dev mode
make api-dev        # apps/api on port 3000
make manager-dev    # apps/agent-manager
make worker-dev     # apps/agent-worker
```

## Architecture Overview

This is a **pnpm monorepo** using **Turborepo** for build orchestration. The platform provides shipping automation with AI-powered chatbot, multi-carrier shipping integrations, and autonomous code generation agents.

### Workspace Layout

- **apps/** - Deployable applications
  - `api/` - Express REST API gateway (port 3000) - routes at `/api/chat`, `/api/shipping`, `/api/agents`, `/api/memories`
  - `agent-manager/` - BullMQ worker that orchestrates code generation tasks, creates GitHub PRs
  - `agent-worker/` - Sandbox test runner using Vitest/Playwright
  - `dashboard/` - Next.js 15 frontend with Tailwind CSS

- **packages/** - Shared libraries (all export via `@unified/*`)
  - `types/` - Shared TypeScript types (`@unified/types`)
  - `database/` - PostgreSQL client & repository pattern (`@unified/database`)
  - `chatbot/` - HuggingFace-powered AI chatbot with memory (`@unified/chatbot`)
  - `agents-adapter/` - BullMQ queue helpers for enqueuing/tracking jobs (`@unified/agents-adapter`)

### Data Flow

1. **API Gateway** (`apps/api`) receives requests and routes to appropriate service
2. **Chatbot** uses HuggingFace inference + memory system for context-aware responses
3. **Agent System**: API enqueues tasks via `@unified/agents-adapter` → `agent-manager` processes with LLM → `agent-worker` runs tests in sandbox → manager creates GitHub PR
4. **Persistence**: PostgreSQL for data, Redis for BullMQ job queues

### Key Patterns

- All packages use ESM (`"type": "module"`) with `.js` extensions in imports
- Repository pattern in `packages/database/src/repositories/`
- BullMQ queues connect via `REDIS_URL` env variable
- Agent jobs have lanes (`p0`, `p1`) with priority-based processing and compliance gates

## Infrastructure

- **PostgreSQL** (5432) - main database, schema in `sql/schema.sql`
- **Redis** (6379) - BullMQ job queues
- **n8n** (5678) - workflow automation for shipping providers

Start with `make infra-up`, stop with `make infra-down`.

## Testing

- Dashboard uses **Vitest** with React Testing Library (`apps/dashboard/vitest.config.ts`)
- Agent worker sandbox supports both Vitest and Playwright
- Run `pnpm run test` at root for all packages, or filter: `pnpm --filter @unified/dashboard test -- --run`
