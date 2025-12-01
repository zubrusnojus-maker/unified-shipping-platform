FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY apps/agent-worker/package.json ./apps/agent-worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types ./packages/types
COPY apps/agent-worker ./apps/agent-worker
COPY tsconfig.base.json ./

# Build
RUN pnpm --filter @unified/types build
RUN pnpm --filter @unified/agent-worker build

WORKDIR /app/apps/agent-worker

CMD ["node", "dist/index.js"]
