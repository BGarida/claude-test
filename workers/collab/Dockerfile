FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY turbo.json tsconfig.base.json ./

# Copy the collab worker and its workspace dependency
COPY workers/collab/ ./workers/collab/
COPY packages/db/ ./packages/db/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Build
FROM base AS builder
RUN pnpm --filter @proof-clone/db build || true
RUN pnpm --filter @proof-clone/collab-worker build

# Production
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/workers/collab/dist ./dist
COPY --from=builder /app/workers/collab/package.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
