import type { DbOrTx } from "@jim/db";
import { sql } from "drizzle-orm";

interface NameRow extends Record<string, unknown> {
  session_id: string | null;
  post_id: string | null;
  names: string[];
}

/** Usernames of up to two other reactors per workout or post (issue #748). */
export async function loadReactionNames(
  tx: DbOrTx,
  sessionIds: readonly string[],
  postIds: readonly string[],
): Promise<{ bySession: Map<string, string[]>; byPost: Map<string, string[]> }> {
  const bySession = new Map<string, string[]>();
  const byPost = new Map<string, string[]>();
  if (sessionIds.length === 0 && postIds.length === 0) return { bySession, byPost };
  const rows = await tx.execute<NameRow>(
    sql`SELECT * FROM reaction_names(${uuidArray(sessionIds)}::uuid[], ${uuidArray(postIds)}::uuid[])`,
  );
  for (const row of rows) {
    const names = row.names ?? [];
    if (row.session_id) bySession.set(row.session_id, names);
    if (row.post_id) byPost.set(row.post_id, names);
  }
  return { bySession, byPost };
}

function uuidArray(ids: readonly string[]): string {
  return `{${ids.join(",")}}`;
}
