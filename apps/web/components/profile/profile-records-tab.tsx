"use client";

import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { PR_KIND_LABELS, formatPrValue } from "@/components/history/pr-badges";
import type { FriendRecordRow } from "@/lib/friends/types";
import { useAchievements } from "@/lib/history/use-achievements";
import { useMemo } from "react";

function OwnRecordsTab() {
  const data = useAchievements();
  const earned = useMemo(
    () =>
      (data?.achievements ?? [])
        .filter((achievement) => achievement.achievedAt)
        .sort((a, b) => (b.achievedAt?.getTime() ?? 0) - (a.achievedAt?.getTime() ?? 0)),
    [data],
  );

  if (!data) {
    return (
      <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
        Loading records…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {earned.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-500">Achievements</h3>
          <ul className="grid grid-cols-4 gap-2">
            {earned.map((achievement) => (
              <li key={achievement.id} className="flex flex-col items-center gap-1">
                <AchievementBadge achievement={achievement} size="md" />
                <span className="line-clamp-2 text-center text-[10px] leading-tight">
                  {achievement.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-500">Personal records</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your full PR history lives on{" "}
          <a href="/history/prs" className="font-medium underline underline-offset-2">
            History → PRs
          </a>
          .
        </p>
      </section>
    </div>
  );
}

function FriendRecordsTab({ records }: { records: readonly FriendRecordRow[] }) {
  if (records.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
        No records to show.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {records.map((record) => (
        <li
          key={`${record.exerciseName}:${record.achievedAt}:${record.kind}`}
          className="px-4 py-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{record.exerciseName}</span>
            <span className="tabular-nums text-sm font-semibold">
              {formatPrValue(record.value)}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {PR_KIND_LABELS[record.kind]} · {new Date(record.achievedAt).toLocaleDateString()}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ProfileRecordsTab({
  mode,
  friendRecords,
}: {
  mode: "own" | "friend";
  friendRecords?: readonly FriendRecordRow[];
}) {
  if (mode === "own") return <OwnRecordsTab />;
  return <FriendRecordsTab records={friendRecords ?? []} />;
}
