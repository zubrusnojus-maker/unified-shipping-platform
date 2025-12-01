FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY packages/database/package.json ./packages/database/
COPY packages/shipping-providers/package.json ./packages/shipping-providers/
COPY packages/chatbot/package.json ./packages/chatbot/
COPY packages/agents-adapter/package.json ./packages/agents-adapter/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages ./packages
COPY apps/api ./apps/api
COPY tsconfig.base.json ./

# Build all packages and API
RUN pnpm run build

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/index.js"]
