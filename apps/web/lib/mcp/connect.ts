/**
 * Where the official Jim MCP server (apps/mcp) is deployed, for Settings →
 * Connect Claude. Must be a literal `process.env.X` access so Next.js inlines
 * it into the browser bundle (see lib/supabase/env.ts). Unset means no server
 * is deployed yet, and the section hides itself.
 */
export const MCP_SERVER_ORIGIN = process.env.NEXT_PUBLIC_MCP_URL ?? "";

/**
 * The streamable HTTP endpoint an MCP client connects to. Accepts either the
 * server's bare origin or the full `/mcp` URL, so the env var can hold
 * whichever was copied from the host's dashboard. Returns null for anything
 * that isn't an http(s) URL rather than showing a broken command.
 */
export function mcpEndpointUrl(configured: string = MCP_SERVER_ORIGIN): string | null {
  const trimmed = configured.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/mcp") ? path : `${path}/mcp`;
  url.search = "";
  url.hash = "";
  return url.href;
}

/** The one-liner that adds the server to Claude Code; OAuth sign-in follows on first use. */
export function claudeCodeAddCommand(endpoint: string): string {
  return `claude mcp add --transport http jim ${endpoint}`;
}
