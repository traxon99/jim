import { DrizzleQueryError } from "drizzle-orm";

export const GENERIC_TOOL_ERROR = "Something went wrong on the server. Nothing was changed.";

/** A database failure: drizzle wraps these with the full SQL and params in the message. */
function isDatabaseError(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    if (current instanceof DrizzleQueryError) return true;
    if (!(current instanceof Error)) return false;
    if (current.name === "PostgresError") return true;
    if (current.message.startsWith("Failed query:")) return true;
    current = current.cause;
  }
  return false;
}

/**
 * What a tool error tells the caller (#514). The tools throw plain `Error`s
 * with deliberate, user-facing messages ("No routine matches ...", validation
 * failures), and those pass through. Anything the database raised, or
 * anything that isn't an `Error` at all, would leak SQL, params or internals,
 * so the caller gets a generic message and the original is logged here.
 */
export function toolErrorMessage(error: unknown): string {
  if (error instanceof Error && !isDatabaseError(error)) return error.message;
  console.error("MCP tool failed:", error);
  return GENERIC_TOOL_ERROR;
}
