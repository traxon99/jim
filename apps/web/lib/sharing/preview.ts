import { isUuid } from "@/lib/api/route-helpers";
import { serviceDb } from "@/lib/db/user-scoped";
import {
  type ShareSnapshot,
  type ShareSummary,
  listNames,
  parseShareSnapshot,
  shareSnapshotSummary,
  shareSummaryStats,
} from "@jim/core";
import { shareLinks, users } from "@jim/db";
import { eq } from "drizzle-orm";
import { cache } from "react";

// Share links read without signing in: the preview chat apps build when a
// link is pasted (issue #431) and the read-only page anyone who opens the
// link sees (issue #638). Both read the link on the server's own connection;
// adding it to your own routines still takes the signed-in app.

/** How many exercises (or a program's routines) a preview names before "+N more". */
export const PREVIEW_NAMES = 6;

export interface SharePreview {
  snapshot: ShareSnapshot;
  summary: ShareSummary;
  username: string | null;
}

/** A live link's preview, or null when it's malformed, revoked or unreadable. */
export const loadSharePreview = cache(async (id: string): Promise<SharePreview | null> => {
  if (!isUuid(id)) return null;
  try {
    const [row] = await serviceDb()
      .select({ snapshot: shareLinks.snapshot, username: users.username })
      .from(shareLinks)
      .innerJoin(users, eq(users.id, shareLinks.userId))
      .where(eq(shareLinks.id, id))
      .limit(1);
    const snapshot = row ? parseShareSnapshot(row.snapshot) : null;
    if (!row || !snapshot) return null;
    return { snapshot, summary: shareSnapshotSummary(snapshot), username: row.username };
  } catch (error) {
    // A preview is a nicety: never fail the page over it.
    console.error("[share preview] couldn't load link:", error);
    return null;
  }
});

/** The line under a preview's title, e.g. "~55 min · 6 exercises · 18 sets. Bench Press, …". */
export function sharePreviewDescription({
  summary,
  username,
}: Pick<SharePreview, "summary" | "username">): string {
  const label = summary.kind === "program" ? "Program" : "Routine";
  const by = username ? ` shared by ${username}` : "";
  const names = listNames(
    summary.kind === "program" ? summary.routineNames : summary.exerciseNames,
    PREVIEW_NAMES,
  );
  const stats = shareSummaryStats(summary).join(" · ");
  return `${label}${by}: ${stats}.${names ? ` ${names}.` : ""}`;
}
