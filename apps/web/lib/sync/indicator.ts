import type { SyncStatus } from "./status";

export type SyncIndicator =
  | { tone: "muted"; text: string }
  | { tone: "alert"; text: string; action: "retry" | "sign-in" };

/**
 * What the tab bar's sync row says. `outboxCount` is the live outbox size, so
 * a set logged with no signal shows up straight away instead of at the next
 * cycle (#665). Being offline is the normal gym-basement case, so it reads as
 * neutral "saved on this phone"; red is kept for a server that refused.
 */
export function syncIndicator(
  status: SyncStatus,
  outboxCount: number,
  online: boolean,
): SyncIndicator | null {
  switch (status.kind) {
    case "signed-out":
      return {
        tone: "alert",
        text: `Signed out${outboxCount > 0 ? ` · ${outboxCount} not synced` : ""}`,
        action: "sign-in",
      };
    case "error":
      return { tone: "alert", text: `Sync error · ${outboxCount} pending`, action: "retry" };
    case "offline":
      return offline(outboxCount);
    case "pending":
      if (!online) return offline(outboxCount);
      return outboxCount > 0 ? { tone: "muted", text: `Pending ${outboxCount}` } : null;
    case "synced":
      // Online, a fresh write waits quietly for the next cycle, as it always has.
      return online ? null : offline(outboxCount);
  }
}

function offline(outboxCount: number): SyncIndicator | null {
  if (outboxCount === 0) return null;
  return { tone: "muted", text: `Offline · ${outboxCount} saved on this phone` };
}
