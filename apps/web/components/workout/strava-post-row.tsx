"use client";

import { SWITCH_CLASS } from "@/components/switch-class";
import { type SessionRow, db } from "@/lib/db/schema";
import { retryStravaPost } from "@/lib/strava/client-api";
import { setSessionStravaPost } from "@/lib/strava/set-post";
import { useStravaActivities, useStravaConnection } from "@/lib/strava/use-strava";
import { shouldPostToStrava, stravaActivityUrl } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

interface Props {
  session: SessionRow;
  /** The finish screen asks per workout with a switch; History posts by hand with a button. */
  mode: "finish" | "history";
  className?: string;
}

/**
 * A finished workout's Strava state (issue #836). Shows nothing unless the
 * account is connected. "On Strava" with a link once posted; "Couldn't post
 * to Strava" with Retry when it failed; otherwise the finish screen's
 * "Post to Strava" switch (on when the Settings switch or the workout's own
 * choice says so) or History's "Post to Strava" button.
 */
export function StravaPostRow({ session, mode, className = "" }: Props) {
  const { load } = useStravaConnection();
  const connected = load.status === "ready" && load.connected;
  const { activities, refresh } = useStravaActivities([session.id], connected);
  const live = useLiveQuery(async () => (await db.sessions.get(session.id)) ?? null, [session.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (load.status !== "ready" || !load.connected || !session.endedAt) return null;
  const info = activities?.[session.id];
  const stravaPost = (live ?? session).stravaPost ?? null;
  const willPost = shouldPostToStrava({ autoPost: load.autoPost, stravaPost });

  async function save(next: boolean) {
    setError(null);
    setBusy(true);
    try {
      await setSessionStravaPost(session, next);
      await refresh();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setError(null);
    setBusy(true);
    try {
      const result = await retryStravaPost(session.id);
      if (!result.ok) setError(result.error);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (info?.status === "posted" && info.activityId) {
    return (
      <a
        href={stravaActivityUrl(info.activityId)}
        target="_blank"
        rel="noopener noreferrer"
        data-ripple
        className={`flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50 ${className}`}
      >
        On Strava
      </a>
    );
  }

  if (info?.status === "posting") {
    return (
      <output
        className={`flex min-h-11 items-center justify-center text-sm text-zinc-600 dark:text-zinc-400 ${className}`}
      >
        Posting to Strava…
      </output>
    );
  }

  if (info?.status === "failed") {
    return (
      <div className={`flex min-h-11 flex-col items-center gap-1 ${className}`}>
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          Couldn't post to Strava.
        </p>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={busy}
          className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
        >
          Retry
        </button>
        {error && <p className="text-xs text-red-600 dark:text-red-500">{error}</p>}
      </div>
    );
  }

  if (mode === "history") {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <button
          type="button"
          onClick={() => void save(true)}
          disabled={busy || (info?.status === "queued" && willPost)}
          className="min-h-11 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          {info?.status === "queued" && willPost ? "Posting to Strava…" : "Post to Strava"}
        </button>
        {error && <p className="text-xs text-red-600 dark:text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`flex w-full max-w-xs flex-col gap-1 ${className}`}>
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50">
        Post to Strava
        <input
          type="checkbox"
          role="switch"
          aria-checked={willPost}
          checked={willPost}
          disabled={busy}
          onChange={(event) => void save(event.target.checked)}
          className={SWITCH_CLASS}
        />
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
