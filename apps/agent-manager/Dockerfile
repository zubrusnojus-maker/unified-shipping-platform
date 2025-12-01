FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY apps/agent-manager/package.json ./apps/agent-manager/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types ./packages/types
COPY apps/agent-manager ./apps/agent-manager
COPY tsconfig.base.json ./

# Build
RUN pnpm --filter @unified/types build
RUN pnpm --filter @unified/agent-manager build

WORKDIR /app/apps/agent-manager

CMD ["node", "dist/index.js"]
