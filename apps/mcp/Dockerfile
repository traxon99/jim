# Build context is the repo root (a pnpm workspace) — see fly.toml's
# `[build] dockerfile`/`ignorefile` and the `fly deploy` invocation in
# apps/mcp/README.md, which passes `.` (repo root) as the working directory
# so this Dockerfile can see packages/db and packages/core.
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/core/package.json packages/core/package.json
RUN pnpm install --frozen-lockfile --filter @jim/mcp...

FROM deps AS runner
ENV NODE_ENV=production
COPY packages/db packages/db
COPY packages/core packages/core
COPY apps/mcp apps/mcp
WORKDIR /app/apps/mcp
EXPOSE 3001
CMD ["pnpm", "start"]
