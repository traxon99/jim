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
logins, the streamable HTTP transport's session state) and calls `app.listen()`,
so it needs a platform that runs a persistent Node process — Fly.io, Render,
Railway, a small VM — rather than a serverless function platform. Set
`MCP_ISSUER_URL` to the deployed HTTPS origin, and add
`<that origin>/login/callback` to Supabase's redirect URL allowlist.
