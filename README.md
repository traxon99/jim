# Jim

A personal strength-training PWA for iPhone 16, with an MCP server for reading training
history and writing programming.

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design,
[docs/DECISIONS.md](docs/DECISIONS.md) for why it's built this way, and
[docs/STORIES.md](docs/STORIES.md) for what's built and what's next.

## Workspace

```
apps/web      Next.js 16 App Router PWA
apps/mcp      MCP server (streamable HTTP + OAuth) — stub until S8
packages/core shared types + pure logic (1RM, volume, PRs, plate math)
packages/db   Drizzle schema, migrations, RLS, catalog seed — stub until S1
```

## Commands

Run from the repo root:

```
pnpm install     install all workspace dependencies
pnpm dev         run the web app
pnpm test        run every package's tests
pnpm lint        check formatting and lint rules (Biome)
pnpm lint:fix     apply safe fixes
pnpm typecheck   typecheck every package
```

## Requirements

- Node 20+
- pnpm 9 (via `corepack enable && corepack prepare pnpm@9 --activate`, or see `packageManager` in package.json)
