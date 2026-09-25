# @jim/mcp

The Jim MCP server — streamable HTTP transport, OAuth 2.1. See
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §5 for the design and
[docs/STORIES.md](../../docs/STORIES.md) (S8) for the tool list and acceptance criteria.

It holds a user's own Supabase session token and reads/writes through the same
RLS as the web app — never a service-role key (ADR-006).

## Running locally

```
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_ANON_KEY / DATABASE_URL
pnpm dev                # from repo root: pnpm --filter @jim/mcp dev
```

Add `http://localhost:3001/login/callback` to the Supabase project's
**Auth → URL Configuration → Redirect URLs**, or magic-link sign-in will fail.

Connect an MCP client (e.g. `claude mcp add --transport http jim http://localhost:3001/mcp`)
and it'll be walked through OAuth: an authorization code flow with PKCE, ending
in a magic-link sign-in page this server renders itself (Supabase has no
hosted authorize page of its own — see `src/auth/`).

## Deploying

This process holds OAuth/session state in memory (registered clients, pending
logins, issued auth codes) and calls `app.listen()`, so it needs a platform
that runs a persistent Node process — Fly.io, Render, Railway, a small VM —
rather than a serverless function platform. Run a single instance: that
in-memory state isn't shared between replicas.

`Dockerfile` builds the server as a container. Build it from the repo root so
the workspace packages it imports are in context:

```
docker build -f apps/mcp/Dockerfile -t jim-mcp .
```

It runs the TypeScript source under `tsx` (`pnpm start` does the same outside
Docker): `@jim/core` and `@jim/db` ship raw `.ts` with no build step, so there
is no compiled output to run.

To bring up the official server:

1. Deploy the image. Set `PORT` if the host doesn't default to 3001, and point
   the host's health check at `GET /healthz`.
2. Set `DATABASE_URL` (the transaction pooler string), `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, and `MCP_ISSUER_URL` = the deployed HTTPS origin.
3. Add `<MCP_ISSUER_URL>/login/callback` to Supabase's
   **Auth → URL Configuration → Redirect URLs**.
4. Set `NEXT_PUBLIC_MCP_URL` = the same origin in the web app's Vercel env and
   redeploy it. Settings → Connect Claude then shows the server URL and the
   `claude mcp add` command.
