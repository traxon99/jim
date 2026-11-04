import type { DbOrTx } from "@jim/db";
import { sql } from "drizzle-orm";
import type { CommentSummary } from "./types";

export const NO_COMMENTS: CommentSummary = { count: 0, latest: null };

interface SummaryRow extends Record<string, unknown> {
  session_id: string | null;
  post_id: string | null;
  comment_count: number;
  latest_username: string | null;
  latest_body: string | null;
}

/**
 * Comment counts and the newest comment for the feed's workouts and posts
 * (issue #749), from migration 0063's `comment_summaries()`. Keyed by
 * session id and post id; ids with no comments are left out.
 */
export async function loadCommentSummaries(
  tx: DbOrTx,
  sessionIds: readonly string[],
  postIds: readonly string[],
): Promise<{ bySession: Map<string, CommentSummary>; byPost: Map<string, CommentSummary> }> {
  const bySession = new Map<string, CommentSummary>();
  const byPost = new Map<string, CommentSummary>();
  if (sessionIds.length === 0 && postIds.length === 0) return { bySession, byPost };
  const rows = await tx.execute<SummaryRow>(
    sql`SELECT * FROM comment_summaries(${uuidArray(sessionIds)}::uuid[], ${uuidArray(postIds)}::uuid[])`,
  );
  for (const row of rows) {
    const summary: CommentSummary = {
      count: Number(row.comment_count),
      latest:
        row.latest_username !== null && row.latest_body !== null
          ? { username: row.latest_username, body: row.latest_body }
          : null,
    };
    if (row.session_id) bySession.set(row.session_id, summary);
    if (row.post_id) byPost.set(row.post_id, summary);
  }
  return { bySession, byPost };
}

/** A Postgres array literal of uuids; the ids come from our own query results. */
function uuidArray(ids: readonly string[]): string {
  return `{${ids.join(",")}}`;
}
