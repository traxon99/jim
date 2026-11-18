"use client";

import { Avatar } from "@/components/friends/avatar";
import { fetchLeaderboard } from "@/lib/friends/client";
import type { LeaderboardPayload } from "@/lib/friends/types";
import {
  type LeaderboardMachine,
  type LeaderboardMetric,
  type RankedLeaderboardEntry,
  leaderboardMachineKey,
  leaderboardWindow,
  rankLeaderboard,
} from "@jim/core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const METRICS: readonly { id: LeaderboardMetric; label: string }[] = [
  { id: "e1rm", label: "e1RM" },
  { id: "best_set", label: "Best set" },
  { id: "relative", label: "Relative" },
];

const TOP_ROWS = 5;

type Load =
  | { status: "loading" }
  | { status: "error"; error: string }
  | ({ status: "ready" } & LeaderboardPayload);

const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

function formatValue(entry: RankedLeaderboardEntry, metric: LeaderboardMetric, units: string) {
  if (metric === "relative") return `${entry.value.toFixed(2)}×`;
  const weight = `${oneDecimal(entry.value)} ${units}`;
  return metric === "best_set" && entry.reps !== null ? `${weight} × ${entry.reps}` : weight;
}

function formatWhen(at: string | null) {
  if (!at) return null;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BoardRow({
  entry,
  metric,
  units,
}: {
  entry: RankedLeaderboardEntry;
  metric: LeaderboardMetric;
  units: string;
}) {
  const when = formatWhen(entry.at);
  const content = (
    <>
      <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-zinc-500 dark:text-zinc-500">
        {entry.rank}
      </span>
      <Avatar username={entry.username} avatar={entry.avatar} className="h-8 w-8 text-sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {entry.isMe ? "You" : `@${entry.username}`}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="text-sm font-semibold tabular-nums">
          {formatValue(entry, metric, units)}
        </span>
        {when && <span className="text-xs text-zinc-500 dark:text-zinc-500">{when}</span>}
      </span>
    </>
  );
  const base = `flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 ${
    entry.isMe ? "bg-zinc-100 dark:bg-zinc-900" : ""
  }`;
  if (entry.isMe) {
    return (
      <li aria-current="true" className={base}>
        {content}
      </li>
    );
  }
  return (
    <li>
      <Link href={`/friends/${entry.username}`} data-ripple className={`press ${base}`}>
        {content}
      </Link>
    </li>
  );
}

/**
 * One lift's board for you and your accepted friends (issue #837): the top
 * rows plus your own rank, sorted by best e1RM, best set or relative strength.
 * Server data like the friends feed, so offline it says it can't load rather
 * than showing old rankings.
 */
export function LeaderboardBoard({
  slug,
  machine = null,
}: {
  slug: string;
  machine?: LeaderboardMachine | null;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [metric, setMetric] = useState<LeaderboardMetric>("e1rm");
  const machineKey = machine ? JSON.stringify(machine) : "";

  // Only the latest request may set state, so a slow answer for the previous lift can't land late.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latest.current;
    const result = await fetchLeaderboard(slug, machineKey ? JSON.parse(machineKey) : null);
    if (request !== latest.current) return;
    setLoad(
      result.ok ? { status: "ready", ...result.value } : { status: "error", error: result.error },
    );
  }, [slug, machineKey]);

  useEffect(() => {
    setLoad({ status: "loading" });
    void refresh();
    // Tabs stay mounted (docs/PWA.md §8), so look again when the app returns.
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const ranked = useMemo(
    () => (load.status === "ready" ? rankLeaderboard(load.rows, metric, load.units) : []),
    [load, metric],
  );
  const { top, me } = leaderboardWindow(ranked, TOP_ROWS);

  if (load.status === "loading") {
    return <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>;
  }

  if (load.status === "error") {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">{load.error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="press min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!load.rows.some((row) => !row.isMe)) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No friends on this lift yet.</p>
        <Link
          href="/friends"
          data-ripple
          className="press flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Add friends
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="tablist"
        aria-label="Rank by"
        className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900"
      >
        {METRICS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={metric === id}
            onClick={() => setMetric(id)}
            className={`press min-h-11 rounded-md text-sm font-medium transition-colors duration-150 ${
              metric === id
                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-500 dark:text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {ranked.length === 0 ? (
        <p className="py-2 text-sm text-zinc-600 dark:text-zinc-400">
          Nobody is sharing relative strength yet.
        </p>
      ) : (
        <ol key={metric} className="route-fade flex flex-col gap-0.5">
          {top.map((entry) => (
            <BoardRow key={entry.userId} entry={entry} metric={metric} units={load.units} />
          ))}
          {me && (
            <>
              <li
                aria-hidden="true"
                className="text-center text-xs text-zinc-400 dark:text-zinc-600"
              >
                ···
              </li>
              <BoardRow entry={me} metric={metric} units={load.units} />
            </>
          )}
        </ol>
      )}
    </div>
  );
}

/**
 * The exercise page's Friends section. A machine exercise only compares on the
 * same machine at the same gym, so one without make, model or a pinned gym
 * says what's missing instead of showing a board.
 */
export function LiftLeaderboard({
  slug,
  machineBrand,
  machineModel,
  gym,
}: {
  slug: string;
  machineBrand: string | null | undefined;
  machineModel: string | null | undefined;
  gym: { latitude?: number | null; longitude?: number | null } | null;
}) {
  const key = leaderboardMachineKey({ machineBrand, machineModel, gym });
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Friends</h2>
      {key.eligible ? (
        <LeaderboardBoard slug={slug} machine={key.machine} />
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {key.reason === "make-model"
            ? "Add the machine's make and model to join its leaderboard."
            : "Pin this machine's gym on the map to join its leaderboard."}
        </p>
      )}
    </section>
  );
}
