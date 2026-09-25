// Streamable HTTP + OAuth 2.1 MCP server (S8; see docs/STORIES.md and
// docs/ARCHITECTURE.md §5). Holds a user's own Supabase session token and is
// subject to the same RLS as the web app — never a service-role key (ADR-006).
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { loginRoutes } from "./auth/login-routes.js";
import { SupabaseOAuthProvider } from "./auth/provider.js";
import type { UserContext } from "./context.js";
import { getDb } from "./db.js";
import { createMcpServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3001);
// Must be the server's actual public HTTPS origin in any deployed
// environment (see router.js's checkIssuerUrl) — localhost is exempted for
// local dev only. Also the origin Supabase's Auth settings must allow as a
// redirect URL (see apps/mcp/.env.example).
const issuerUrl = new URL(process.env.MCP_ISSUER_URL ?? `http://localhost:${PORT}`);
const resourceUrl = new URL("/mcp", issuerUrl);

const provider = new SupabaseOAuthProvider();
const app = express();
// Deployed behind the host's TLS-terminating proxy (Fly, Render, Railway):
// trust its one X-Forwarded-For hop so the auth router's rate limiter keys on
// the real client IP instead of rejecting the forwarded header outright.
app.set("trust proxy", 1);

// Liveness probe for the host's health check — no auth, no DB round trip.
app.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok");
});

app.use(
  mcpAuthRouter({
    provider,
    issuerUrl,
    resourceServerUrl: resourceUrl,
    resourceName: "jim",
  }),
);
app.use(loginRoutes(issuerUrl));

const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl);

app.post(
  "/mcp",
  express.json(),
  requireBearerAuth({ verifier: provider, resourceMetadataUrl }),
  async (req, res) => {
    const extra = req.auth?.extra as { userId?: unknown; email?: unknown } | undefined;
    const userId = typeof extra?.userId === "string" ? extra.userId : undefined;
    if (!userId) {
      res
        .status(401)
        .json({ error: "invalid_token", error_description: "token carries no user id" });
      return;
    }

    const context: UserContext = {
      db: getDb(),
      userId,
      email: typeof extra?.email === "string" ? extra.email : "",
    };

    // A fresh server + transport per request (see server.ts) — simplest
    // correct thing for a stateless deployment, and cheap since tool
    // registration is just populating in-memory maps.
    const server = createMcpServer(context);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  },
);

// Stateless mode (no sessionIdGenerator) doesn't support the GET/DELETE
// halves of the Streamable HTTP spec (standalone SSE, session teardown) —
// every tool call here is a fast DB read/write with no server-initiated
// notifications, so there's nothing for a standalone stream to carry.
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    error: "method_not_allowed",
    error_description: "This server only supports the POST half of Streamable HTTP.",
  });
});
app.delete("/mcp", (_req, res) => {
  res.status(405).end();
});

app.get("/", (_req, res) => {
  res.type("text/plain").send("jim MCP server. Connect an MCP client to /mcp.");
});

app.listen(PORT, () => {
  console.log(`jim MCP server listening on :${PORT} (issuer ${issuerUrl.href})`);
});
