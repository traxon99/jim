import { APP_VERSION } from "@/lib/version";
import type { HealthOptions } from "@jim/db/admin";

/** Health as the web app sees it: itself up, the MCP server probed (issue #810). */
export function webHealthOptions(): HealthOptions {
  const region = process.env.VERCEL_REGION ?? null;
  return {
    // This page rendering is the web app answering.
    self: { name: "Web app", detail: region ? `Vercel · ${region}` : "Vercel", state: "healthy" },
    peer: {
      name: "jim-mcp",
      host: "Fly",
      origin: process.env.NEXT_PUBLIC_MCP_URL || null,
      path: "/healthz",
    },
    deploy: {
      version: APP_VERSION,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      region,
      builtAt: process.env.JIM_BUILT_AT ?? null,
    },
  };
}
