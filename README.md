# Unified Shipping Platform

A comprehensive shipping automation platform that combines AI-powered chatbot capabilities, multi-provider shipping integrations, and autonomous code generation agents.

## Features

- **AI Chatbot with Memory**: Conversational interface that remembers user preferences and shipping history
- **Multi-Provider Shipping**: Support for EasyPost (100+ carriers), Easyship (550+ couriers), and n8n workflows
- **Agent Infrastructure**: Automated code generation, testing, and GitHub PR creation
- **Unified API**: Single REST API for all functionality

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UNIFIED API GATEWAY                       │
│  /api/chat    /api/shipping    /api/agents    /api/memories │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌──────────┐        ┌───────────┐        ┌──────────┐
   │ CHATBOT  │        │ SHIPPING  │        │  AGENTS  │
   │ SERVICE  │        │ SERVICE   │        │ SERVICE  │
   ├──────────┤        ├───────────┤        ├──────────┤
   │ HuggingFace│      │ EasyPost  │        │ Manager  │
   │ Memory   │        │ Easyship  │        │ Worker   │
   │ System   │        │ n8n       │        │ GitHub   │
   └──────────┘        └───────────┘        └──────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
   ┌─────────────────────────────────────────────────┐
   │                   DATA LAYER                     │
   │  PostgreSQL (data)    Redis (queues/cache)      │
   └─────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd unified-shipping-platform

# Install dependencies
make install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your API keys

# Start infrastructure
make infra-up

# Run database migrations
make db-migrate

# Start development servers
make dev
```

### Docker Deployment

```bash
# Build and start all services
make docker-build
make docker-up

# View logs
make docker-logs

# Stop services
make docker-down
```

## Project Structure

```
unified-shipping-platform/
├── apps/
│   ├── api/              # Unified API Gateway
│   ├── agent-manager/    # Code generation orchestrator
│   ├── agent-worker/     # Test execution sandbox
│   └── web/              # Frontend (coming soon)
│
├── packages/
│   ├── types/            # Shared TypeScript types
│   ├── database/         # PostgreSQL client & repositories
│   ├── shipping-providers/  # EasyPost, Easyship, n8n
│   ├── chatbot/          # AI chatbot with memory
│   └── agents-adapter/   # BullMQ queue helpers
│
├── sql/
│   └── schema.sql        # Database schema
│
├── docker-compose.yml    # Service orchestration
├── package.json          # Workspace root
└── turbo.json           # Turborepo config
```

## API Endpoints

### Chat

```bash
# Send a message
POST /api/chat
{ "message": "...", "userId": "...", "conversationId": "..." }

# Get conversation history
GET /api/chat/history/:userId
```

### Shipping

```bash
# Get rates from all providers
POST /api/shipping/rates
{ "origin": {...}, "destination": {...}, "parcel": {...} }

# Book a shipment
POST /api/shipping/book
{ ... }

# Track a shipment
GET /api/shipping/track/:trackingNumber
```

### Agents

```bash
# Generate code
POST /api/agents/generate
{
  "taskDescription": "Add validation to...",
  "targetFiles": ["src/..."],
  "branchName": "feature/...",
  "prTitle": "..."
}

# Check status
GET /api/agents/status/:jobId
```

### Memories

```bash
# Get user memories
GET /api/memories/:userId

# Clear memories
DELETE /api/memories/:userId
```

## Configuration

See `.env.example` for all available configuration options.

For naming standards, deprecations, and environment access patterns, see `docs/naming.md`.

### Required API Keys

- `HF_TOKEN` - HuggingFace API token for chatbot
- `EASYPOST_API_KEY` - EasyPost for domestic shipping
- `EASYSHIP_API_KEY` - Easyship for international shipping
- `GITHUB_TOKEN` - GitHub for PR creation (agents)

### Shipping Environment Variables

Common defaults

- `SHIPPING_DEFAULT_CURRENCY`: Fallback currency when provider-specific is not set.
- `SHIPPER_*`: Default origin fields merged into requests when missing.
  - `SHIPPER_NAME`, `SHIPPER_COMPANY`, `SHIPPER_STREET1`, `SHIPPER_STREET2`, `SHIPPER_CITY`, `SHIPPER_STATE`, `SHIPPER_ZIP`, `SHIPPER_COUNTRY`, `SHIPPER_PHONE`, `SHIPPER_EMAIL`.

EasyPost

- `EASYPOST_API_KEY`, `EASYPOST_MODE` (`test|production`)
- `EASYPOST_LABEL_FORMAT` (`PDF|PNG|ZPL`)

Easyship

- `EASYSHIP_API_KEY`, `EASYSHIP_MODE` (`sandbox|production`)
- `EASYSHIP_CURRENCY` (falls back to `SHIPPING_DEFAULT_CURRENCY` or `USD`)
- `EASYSHIP_WEIGHT_UNIT` (`lb|kg`), `EASYSHIP_DIMENSION_UNIT` (`in|cm`) — legacy names `EASYSHIP_UNITS_WEIGHT`, `EASYSHIP_UNITS_DIMENSIONS` also supported (deprecated; warning emitted at startup)
- `EASYSHIP_INCOTERM_DEFAULT` (`DDP|DDU`), `EASYSHIP_DDP_RESTRICTED` (CSV ISO2 list like `MX,BR,AR`)
- Optional: `EASYSHIP_BASE_URL`, `EASYSHIP_LABEL_FORMAT` (`PDF|PNG|ZPL`)

n8n

- `N8N_WEBHOOK_BASE_URL` and optional `N8N_WEBHOOK_*_PATH` overrides (`intake`, `rates`, `book`, `tracking`)

## Development

```bash
# Install dependencies
make install

# Start infrastructure
make infra-up

# Run API in development mode
make api-dev

# Run agent manager
make manager-dev

# Run agent worker
make worker-dev

# Build all packages
make build

# Run tests
make test
```

## Services

| Service    | Port | Description         |
| ---------- | ---- | ------------------- |
| API        | 3000 | Unified REST API    |
| n8n        | 5678 | Workflow automation |
| PostgreSQL | 5432 | Database            |
| Redis      | 6379 | Job queues          |
| pgAdmin    | 8080 | Database admin      |

## License

MIT
