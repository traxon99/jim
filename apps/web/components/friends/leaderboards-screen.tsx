"use client";

import { LeaderboardBoard } from "@/components/friends/lift-leaderboard";
import { ChevronDown, Trophy } from "@/components/icons/solar";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { fetchLeaderboardLifts } from "@/lib/friends/client";
import type { LeaderboardLift } from "@/lib/friends/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Load =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; lifts: LeaderboardLift[] };

const liftKey = (lift: LeaderboardLift) =>
  lift.machine
    ? `${lift.slug}:${lift.machine.brand}:${lift.machine.model}:${lift.machine.latitude}:${lift.machine.longitude}`
    : lift.slug;

/**
 * Every lift you and at least one friend have logged (issue #837), busiest
 * first. A lift opens in place to show its board.
 */
export function LeaderboardsScreen() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [openKey, setOpenKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await fetchLeaderboardLifts();
    setLoad(
      result.ok
        ? { status: "ready", lifts: result.value }
        : { status: "error", error: result.error },
    );
  }, []);

  useEffect(() => {
    void refresh();
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Leaderboards" back={{ href: "/home", label: "Friends" }} />
      <div className={PAGE_BODY}>
        {load.status === "loading" && (
          <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
        )}

        {load.status === "error" && (
          <section className="flex flex-col items-center gap-3 py-6">
            <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">
              {load.error}
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="press min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
            >
              Try again
            </button>
          </section>
        )}

        {load.status === "ready" && load.lifts.length === 0 && (
          <div className="route-fade flex flex-col items-center gap-3 py-8 text-center">
            <Trophy
              className="h-8 w-8 text-zinc-400 dark:text-zinc-600"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No lifts in common with a friend yet.
            </p>
            <Link
              href="/friends"
              data-ripple
              className="press flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
            >
              Add friends
            </Link>
          </div>
        )}

        {load.status === "ready" && load.lifts.length > 0 && (
          <ul className="route-fade flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {load.lifts.map((lift) => {
              const key = liftKey(lift);
              const open = openKey === key;
              const machine = lift.machine ? `${lift.machine.brand} ${lift.machine.model}` : null;
              return (
                <li key={key} className="py-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenKey(open ? null : key)}
                    className="press flex min-h-11 w-full min-w-0 items-center gap-3 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-medium">{lift.name}</span>
                      {machine && (
                        <span className="truncate text-xs text-zinc-500 dark:text-zinc-500">
                          {machine}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-500">
                      {lift.participants}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-200 ease-in-out dark:text-zinc-600 ${
                        open ? "rotate-180" : ""
                      }`}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </button>
                  {open && (
                    <div className="route-fade pt-2 pb-3">
                      <LeaderboardBoard slug={lift.slug} machine={lift.machine} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
