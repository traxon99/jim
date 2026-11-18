"use client";

import { SWITCH_CLASS } from "@/components/switch-class";
import { disconnectStrava, setStravaAutoPost } from "@/lib/strava/client-api";
import {
  patchStravaConnection,
  refreshStravaConnection,
  useStravaConnection,
} from "@/lib/strava/use-strava";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

const RESULT_MESSAGES: Record<string, string> = {
  denied: "Strava wasn't connected. Allow Jim to upload activities and try again.",
  error: "Couldn't connect Strava. Try again.",
};

/** Settings → Account → Strava (issue #836): connect, who it's connected as, auto-post, disconnect. */
export function StravaSection() {
  const { load, refresh } = useStravaConnection();
  const result = useSearchParams().get("strava");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAutoPost(next: boolean) {
    setError(null);
    patchStravaConnection({ autoPost: next });
    const saved = await setStravaAutoPost(next);
    if (!saved.ok) {
      patchStravaConnection({ autoPost: !next });
      setError(saved.error);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setBusy(true);
    try {
      const done = await disconnectStrava();
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshStravaConnection();
    } finally {
      setBusy(false);
    }
  }

  if (load.status === "loading") return null;

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Strava
      </h2>

      {load.status === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-red-600 dark:text-red-500">{load.error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="min-h-11 w-fit rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Try again
          </button>
        </div>
      )}

      {load.status === "ready" && !load.configured && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Strava isn't set up for this version of Jim yet.
        </p>
      )}

      {load.status === "ready" && load.configured && !load.connected && (
        <a
          href="/api/strava/connect"
          data-ripple
          className="flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          Connect Strava
        </a>
      )}

      {load.status === "ready" && load.connected && (
        <>
          <p className="allow-pwa-select min-w-0 truncate text-sm font-medium">
            Connected as {load.athleteName ?? "your Strava account"}
          </p>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900">
            Auto-post to Strava
            <input
              type="checkbox"
              role="switch"
              aria-checked={load.autoPost}
              checked={load.autoPost}
              onChange={(event) => void handleAutoPost(event.target.checked)}
              className={SWITCH_CLASS}
            />
          </label>
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={busy}
            className="min-h-11 w-full rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-500"
          >
            {busy ? "Disconnecting…" : "Disconnect Strava"}
          </button>
        </>
      )}

      {result && RESULT_MESSAGES[result] && load.status === "ready" && !load.connected && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-500">
          {RESULT_MESSAGES[result]}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
