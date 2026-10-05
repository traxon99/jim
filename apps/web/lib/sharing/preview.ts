import { serviceDb } from "@/lib/db/user-scoped";
import {
  type ShareSummary,
  listNames,
  parseShareSnapshot,
  shareSnapshotSummary,
  shareSummaryStats,
} from "@jim/core";
import { shareLinks, users } from "@jim/db";
import { eq } from "drizzle-orm";
import { cache } from "react";

// Link previews for share links (issue #431). Chat apps fetch a pasted link
// signed out, so this reads the link on the server's own connection (opening
// it still takes signing in: app/api/shares/[id]/route.ts) and hands back
// only the summary a preview shows: the name, rough size and who shared it.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SharePreview {
  summary: ShareSummary;
  username: string | null;
}

/** A live link's preview, or null when it's malformed, revoked or unreadable. */
export const loadSharePreview = cache(async (id: string): Promise<SharePreview | null> => {
  if (!UUID_PATTERN.test(id)) return null;
  try {
    const [row] = await serviceDb()
      .select({ snapshot: shareLinks.snapshot, username: users.username })
      .from(shareLinks)
      .innerJoin(users, eq(users.id, shareLinks.userId))
      .where(eq(shareLinks.id, id))
      .limit(1);
    const snapshot = row ? parseShareSnapshot(row.snapshot) : null;
    if (!row || !snapshot) return null;
    return { summary: shareSnapshotSummary(snapshot), username: row.username };
  } catch (error) {
    // A preview is a nicety: never fail the page over it.
    console.error("[share preview] couldn't load link:", error);
    return null;
  }
});

/** The line under a preview's title, e.g. "~55 min · 6 exercises · 18 sets. Bench Press, …". */
export function sharePreviewDescription({ summary, username }: SharePreview): string {
  const label = summary.kind === "program" ? "Program" : "Routine";
  const by = username ? ` shared by ${username}` : "";
  const names = listNames(
    summary.kind === "program" ? summary.routineNames : summary.exerciseNames,
  );
  const stats = shareSummaryStats(summary).join(" · ");
  return `${label}${by}: ${stats}.${names ? ` ${names}.` : ""}`;
}
