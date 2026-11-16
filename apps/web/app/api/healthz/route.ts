/** Liveness probe for the MCP server's admin_health (issue #811): no auth, no DB. */
export function GET() {
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
