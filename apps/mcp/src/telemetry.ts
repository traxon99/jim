import { AsyncLocalStorage } from "node:async_hooks";
import { telemetryFingerprint } from "@jim/core";
import { telemetryEvents } from "@jim/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type UserContext, withUser } from "./context.js";

/**
 * MCP tool errors for the admin Failures page (issue #809). Only unexpected
 * failures count: a tool's own message ("No routine matches …") is an answer,
 * not a failure. tool-error.ts hands each unexpected error to the tool call
 * it happened in through this store; the wrapper below records it once the
 * call is over, as the calling user (RLS lets a user add only their own rows).
 */
const failures = new AsyncLocalStorage<unknown[]>();

/** Called by toolErrorMessage for an error it hides behind the generic message. */
export function noteUnexpectedToolError(error: unknown): void {
  failures.getStore()?.push(error);
}

export async function recordToolFailure(
  context: UserContext,
  tool: string,
  error: unknown,
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  // Drizzle puts the SQL and its params in the message; keep the cause's.
  const cause = err.cause instanceof Error ? err.cause : null;
  const message = (cause?.message || err.message || "(no message)").slice(0, 1000);
  await withUser(context, (tx) =>
    tx.insert(telemetryEvents).values({
      userId: context.userId,
      kind: "mcp_error",
      name: tool,
      message,
      fingerprint: telemetryFingerprint("mcp_error", tool, message, err.stack),
      detail: { errorName: (cause ?? err).name },
    }),
  );
}

/** Records every unexpected failure of every tool this server registers. */
export function recordToolErrors(server: McpServer, context: UserContext): void {
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: never, callback: (...args: never[]) => unknown) =>
    register(name, config, (async (...args: never[]) => {
      const seen: unknown[] = [];
      const result = await failures.run(seen, () => callback(...args));
      for (const error of seen) {
        await recordToolFailure(context, name, error).catch((failure: unknown) =>
          console.error("[telemetry] couldn't record an MCP tool error:", failure),
        );
      }
      return result;
    }) as never)) as typeof server.registerTool;
}
