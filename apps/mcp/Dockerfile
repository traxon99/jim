# The Jim MCP server as a long-running Node container (see README → Deploying).
# Build from the repo root so the workspace packages it imports are in context:
#   docker build -f apps/mcp/Dockerfile -t jim-mcp .
FROM node:22-slim

ENV NODE_ENV=production
RUN corepack enable
WORKDIR /repo

# Manifests first so the dependency layer is cached across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --prod --filter @jim/mcp...

# packages/core and packages/db ship raw .ts source with no build step, so the
# server runs under tsx rather than from compiled output.
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/db packages/db
COPY apps/mcp apps/mcp

WORKDIR /repo/apps/mcp
EXPOSE 3001
USER node
CMD ["node_modules/.bin/tsx", "src/index.ts"]
