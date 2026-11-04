import type { AccessTokenScope } from "@jim/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Every MCP tool is classified here as a read or a write (issue #736), so a
// `read` personal access token can be held by a dashboard (ADR-022) without
// being able to change anything. A test fails if server.ts registers a tool
// that's in neither list; an unlisted tool is refused to read tokens anyway.

/** Tools that never write, so a `read` token may call them. */
export const READ_TOOLS = new Set([
  "list_workouts",
  "get_workout",
  "exercise_history",
  "get_prs",
  "get_body_measurements",
  "list_routines",
  "get_routine",
  "dpr_status",
  "volume_report",
  "weekly_summary",
  "search_exercises",
  "list_warmup_templates",
  "list_programs",
  "list_scheduled_workouts",
  "list_gyms",
  "search_places",
  "list_injuries",
  "get_settings",
  "list_friend_activity",
  "list_comments",
]);

/** Tools that create, change or delete something, `dry_run` or not. */
export const WRITE_TOOLS = new Set([
  "create_routine",
  "update_routine",
  "schedule_workout",
  "log_past_workout",
  "upsert_exercise",
  "merge_exercises",
  "delete_routine",
  "create_warmup",
  "create_program",
  "update_program",
  "delete_program",
  "cancel_scheduled_workout",
  "delete_workout",
  "log_body_measurement",
  "delete_body_measurement",
  "create_gym",
  "update_gym",
  "delete_gym",
  "report_injury",
  "log_pain",
  "heal_injury",
  "set_injury_exercise_rule",
  "clear_injury_exercise_rule",
  "delete_injury",
  "update_settings",
  "add_comment",
  "react_to_comment",
  "react_to_workout",
  "delete_comment",
]);

export const READ_ONLY_MESSAGE = "This token is read-only.";

function refuseReadOnly() {
  return { content: [{ type: "text" as const, text: READ_ONLY_MESSAGE }], isError: true };
}

/**
 * For a `read` token, swaps the handler of every tool that isn't in
 * `READ_TOOLS` for one that answers with the read-only error before any
 * database work, so `dry_run` previews are refused too. Call it before
 * registering tools.
 */
export function guardWriteTools(server: McpServer, scope: AccessTokenScope): void {
  if (scope !== "read") return;
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: never, callback: never) =>
    register(
      name,
      config,
      READ_TOOLS.has(name) ? callback : (refuseReadOnly as never),
    )) as typeof server.registerTool;
}
