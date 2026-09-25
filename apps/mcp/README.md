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

The official server runs on a **Raspberry Pi 3**, published through a
**Cloudflare Tunnel** (ADR-016). The tunnel gives it a public HTTPS origin
with Cloudflare terminating TLS, and needs no port forwarding and no exposed
home IP — the Pi only makes outbound connections (to Cloudflare and to
Supabase).

This process holds OAuth/session state in memory (registered clients, pending
logins, issued auth codes) and calls `app.listen()`, so it needs a persistent
Node process, not a serverless platform. Run a single instance: that in-memory
state isn't shared between replicas. It also means a restart (reboot, power
cut, redeploy) drops every connected client's tokens, and each one has to redo
the OAuth sign-in.

`Dockerfile` builds the server as a container, and `compose.yaml` runs it
alongside `cloudflared`. The image runs the TypeScript source under `tsx`
(`pnpm start` does the same outside Docker): `@jim/core` and `@jim/db` ship raw
`.ts` with no build step, so there is no compiled output to run.

### 1. Prepare the Pi

- Flash **Raspberry Pi OS Lite (64-bit)**. The Pi 3's Cortex-A53 is 64-bit
  capable; use arm64 rather than the 32-bit image, since that's where Node and
  `cloudflared` images are best supported.
- A good-quality SD card (or a USB SSD, which the Pi 3 B+ can boot from). The
  server writes nothing to disk besides container logs, which `compose.yaml`
  caps at 30 MB per service.
- Install Docker and the compose plugin: `curl -fsSL https://get.docker.com | sh`,
  then `sudo usermod -aG docker $USER` and log back in.
- The Pi 3 has 1 GB of RAM. Running the server is comfortable; the image build
  (`pnpm install`) is the tight part — if it gets OOM-killed, raise swap to
  1 GB (`CONF_SWAPSIZE=1024` in `/etc/dphys-swapfile`, then
  `sudo systemctl restart dphys-swapfile`).

### 2. Create the tunnel

In the Cloudflare dashboard (Zero Trust → Networks → Tunnels), create a
**Cloudflared** tunnel named e.g. `jim-mcp`. Copy the connector token (the long
string after `--token` in the install command) — you don't need to run that
install command; `compose.yaml` runs the connector.

Add a public hostname route: e.g. `mcp.<your-domain>` → service
`http://mcp:3001` (`mcp` is the compose service name). The domain must be on
Cloudflare.

Don't put Cloudflare Access, Bot Fight Mode or any other challenge in front of
this hostname: MCP clients (including Claude's servers, for claude.ai
connectors) call `/mcp`, `/register` and `/token` non-interactively and can't
solve one. The server has its own OAuth.

### 3. Configure and start

On the Pi:

```
git clone <this repo> jim && cd jim/apps/mcp
cp .env.example .env               # DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY
cp .env.tunnel.example .env.tunnel # TUNNEL_TOKEN from step 2
```

In `.env`, set `DATABASE_URL` to the transaction pooler string and
`MCP_ISSUER_URL` to the tunnel's origin, e.g. `https://mcp.<your-domain>`.
Leave `PORT` at 3001 — the tunnel route points there.

```
docker compose up -d --build
docker compose logs -f             # "jim MCP server listening on :3001 ..."
curl https://mcp.<your-domain>/healthz   # ok
```

Both services are `restart: unless-stopped`, so they come back after a reboot
once Docker starts.

### 4. Wire up Supabase and the web app

1. Add `<MCP_ISSUER_URL>/login/callback` to Supabase's
   **Auth → URL Configuration → Redirect URLs**.
2. Set `NEXT_PUBLIC_MCP_URL` = the same origin in the web app's Vercel env and
   redeploy it. Settings → Connect Claude then shows the server URL and the
   `claude mcp add` command.

### Updating

```
cd jim && git pull
cd apps/mcp && docker compose up -d --build
```

The rebuild restarts the server, so connected clients re-authenticate. Point
an external uptime monitor at `GET /healthz` if you want to hear about outages
— nothing on the Pi watches it.
