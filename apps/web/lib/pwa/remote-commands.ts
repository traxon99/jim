import { clearLocalData } from "@/lib/auth/sign-out";
import { type JimDatabase, db } from "@/lib/db/schema";

/**
 * Force refresh (issue #808). An admin can ask an account's phones to update
 * the app, or to wipe their local data and pull it fresh. The request is a
 * timestamp on the account, sent with every sync pull; each device keeps the
 * last one it acted on, so every signed-in device acts once.
 */
export interface RemoteCommands {
  userId: string;
  updateRequestedAt: string | null;
  resetRequestedAt: string | null;
}

/** The last request this device acted on, per account. */
interface Handled {
  userId: string;
  update: string | null;
  reset: string | null;
}

const HANDLED_KEY = "jim-remote-commands";
/** Set just before a reset reloads, so the next open shows one line. */
export const RESET_NOTICE_KEY = "jim-reset-notice";

export function isRemoteCommands(value: unknown): value is RemoteCommands {
  if (typeof value !== "object" || value === null) return false;
  const { userId, updateRequestedAt, resetRequestedAt } = value as Record<string, unknown>;
  const stamp = (v: unknown) => v === null || typeof v === "string";
  return typeof userId === "string" && stamp(updateRequestedAt) && stamp(resetRequestedAt);
}

function isNewer(requested: string | null, handled: string | null): boolean {
  if (!requested) return false;
  if (!handled) return true;
  return Date.parse(requested) > Date.parse(handled);
}

/**
 * What this device still has to do. A device that has never seen this
 * account's requests adopts them as done: it was just set up (or signed in),
 * so it already runs the current app on fresh data.
 */
export function pendingRemoteCommands(
  commands: RemoteCommands,
  handled: Handled | null,
): { update: boolean; reset: boolean; adopt: boolean } {
  if (!handled || handled.userId !== commands.userId) {
    return { update: false, reset: false, adopt: true };
  }
  return {
    update: isNewer(commands.updateRequestedAt, handled.update),
    reset: isNewer(commands.resetRequestedAt, handled.reset),
    adopt: false,
  };
}

export interface RemoteCommandDeps {
  storage: Pick<Storage, "getItem" | "setItem">;
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  /** Asks the browser for a new service worker, if there is one. */
  checkForUpdate: () => Promise<unknown>;
  reload: () => void;
  outboxCount: () => Promise<number>;
  /** Whether the server answers now, so a wiped phone can pull straight back. */
  serverReachable: () => Promise<boolean>;
  wipe: () => Promise<void>;
}

const REACHABLE_TIMEOUT_MS = 5000;

function browserDeps(database: JimDatabase): RemoteCommandDeps {
  return {
    storage: window.localStorage,
    doc: document,
    checkForUpdate: async () => {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    },
    reload: () => window.location.reload(),
    outboxCount: () => database.outbox.count(),
    serverReachable: async () => {
      if (!navigator.onLine) return false;
      try {
        const response = await fetch("/api/settings", {
          signal: AbortSignal.timeout(REACHABLE_TIMEOUT_MS),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    // The cached pages stay: they're this same account's, and they're what
    // the reload opens on if the signal drops right after.
    wipe: () => clearLocalData(database),
  };
}

function readHandled(storage: RemoteCommandDeps["storage"]): Handled | null {
  try {
    const raw = storage.getItem(HANDLED_KEY);
    return raw ? (JSON.parse(raw) as Handled) : null;
  } catch {
    return null;
  }
}

function writeHandled(storage: RemoteCommandDeps["storage"], handled: Handled): void {
  try {
    storage.setItem(HANDLED_KEY, JSON.stringify(handled));
  } catch {
    // Private mode or full storage: the request runs again on the next pull.
  }
}

/** One deferred job per page load, so repeated pulls don't stack listeners. */
let scheduled: Promise<void> | null = null;

/**
 * Runs `job` the next time the user isn't looking (#507: never mid-set), or
 * straight away if the app is already in the background.
 */
function whenAway(doc: RemoteCommandDeps["doc"], job: () => Promise<void>): Promise<void> {
  if (scheduled) return scheduled;
  scheduled = new Promise<void>((resolve) => {
    const run = () => {
      if (doc.visibilityState !== "hidden") return;
      doc.removeEventListener("visibilitychange", run);
      job().finally(resolve);
    };
    doc.addEventListener("visibilitychange", run);
    run();
  }).finally(() => {
    scheduled = null;
  });
  return scheduled;
}

/**
 * Acts on the account's force-refresh requests after a pull.
 *
 * - Update app: checks for a new service worker now, then reloads once the
 *   app is in the background, so even a phone already on the latest build
 *   restarts its JS.
 * - Reset local data: only once every local change has reached the server
 *   (the outbox is empty), the server answers, and the app is in the
 *   background. It wipes IndexedDB and reloads, which pulls everything
 *   fresh. Otherwise it waits for a later pull.
 */
export async function applyRemoteCommands(
  commands: RemoteCommands,
  database: JimDatabase = db,
  deps: RemoteCommandDeps = browserDeps(database),
): Promise<void> {
  const handled = readHandled(deps.storage);
  const pending = pendingRemoteCommands(commands, handled);
  if (pending.adopt) {
    writeHandled(deps.storage, {
      userId: commands.userId,
      update: commands.updateRequestedAt,
      reset: commands.resetRequestedAt,
    });
    return;
  }
  if (!handled) return;

  if (pending.reset && (await deps.outboxCount()) === 0) {
    await whenAway(deps.doc, async () => {
      // Each check can take a moment, and iOS may freeze the app between
      // them: never wipe with a change queued, without a server to pull back
      // from, or once the user is looking again (#507). Any of those leaves
      // the reset for a later pull.
      if ((await deps.outboxCount()) > 0) return;
      if (!(await deps.serverReachable())) return;
      if (deps.doc.visibilityState !== "hidden") return;
      await deps.wipe();
      writeHandled(deps.storage, {
        ...handled,
        // The reload applies any pending update too.
        update: commands.updateRequestedAt ?? handled.update,
        reset: commands.resetRequestedAt,
      });
      try {
        deps.storage.setItem(RESET_NOTICE_KEY, "1");
      } catch {
        // The notice is a nicety; the reset still ran.
      }
      deps.reload();
    });
    return;
  }

  // Also when a reset is still waiting on unsynced changes: one change the
  // server keeps refusing must not hold back every later update.
  if (pending.update) {
    writeHandled(deps.storage, { ...handled, update: commands.updateRequestedAt });
    await deps.checkForUpdate().catch(() => {});
    await whenAway(deps.doc, async () => deps.reload());
  }
}

/** Reads and clears the one-line "data refreshed" notice a reset leaves. */
export function takeResetNotice(
  storage: Pick<Storage, "getItem" | "removeItem"> = window.localStorage,
): boolean {
  try {
    if (storage.getItem(RESET_NOTICE_KEY) !== "1") return false;
    storage.removeItem(RESET_NOTICE_KEY);
    return true;
  } catch {
    return false;
  }
}
