"use client";

import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { PR_KIND_LABELS, formatPrValue } from "@/components/history/pr-badges";
import { AchievementShareButton } from "@/components/share-card/achievement-share-button";
import type { FriendRecordRow } from "@/lib/friends/types";
import { useAchievements } from "@/lib/history/use-achievements";
import { useMemo } from "react";

function OwnRecordsTab() {
  const data = useAchievements();
  const earned = useMemo(
    () =>
      (data?.achievements ?? [])
        .filter((achievement) => achievement.achievedAt && achievement.category !== "cardio")
        .sort((a, b) => (b.achievedAt?.getTime() ?? 0) - (a.achievedAt?.getTime() ?? 0)),
    [data],
  );
  // Cardio badges (issue #872) sit on their own shelf, earned and still
  // ahead, grouped by sport in a stable order, with the closest few up next.
  const cardio = useMemo(
    () => (data?.achievements ?? []).filter((achievement) => achievement.category === "cardio"),
    [data],
  );
  const cardioUpNext = useMemo(
    () =>
      cardio
        .filter((achievement) => !achievement.achievedAt && achievement.progress)
        .sort(
          (a, b) =>
            (b.progress ? b.progress.current / b.progress.target : 0) -
            (a.progress ? a.progress.current / a.progress.target : 0),
        )
        .slice(0, 2),
    [cardio],
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
              <li key={achievement.id}>
                {/* Tapping an earned badge opens its share image (issue #838). */}
                <AchievementShareButton
                  achievement={achievement}
                  className="flex w-full flex-col items-center gap-1 rounded-lg"
                >
                  <AchievementBadge achievement={achievement} size="md" />
                  <span className="line-clamp-2 text-center text-[10px] leading-tight">
                    {achievement.title}
                  </span>
                </AchievementShareButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      {cardio.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-500">Cardio</h3>
          <ul className="grid grid-cols-4 gap-x-2 gap-y-3">
            {cardio.map((achievement) => (
              <li key={achievement.id}>
                {achievement.achievedAt ? (
                  <AchievementShareButton
                    achievement={achievement}
                    className="flex w-full flex-col items-center gap-1 rounded-lg"
                  >
                    <AchievementBadge achievement={achievement} size="md" />
                    <span className="line-clamp-2 text-center text-[10px] leading-tight">
                      {achievement.title}
                    </span>
                  </AchievementShareButton>
                ) : (
                  <div className="flex w-full flex-col items-center gap-1">
                    <AchievementBadge achievement={achievement} size="md" />
                    <span className="line-clamp-2 text-center text-[10px] leading-tight text-zinc-500">
                      {achievement.title}
                      <span className="sr-only">, locked</span>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {cardioUpNext.length > 0 && (
            <ul
              aria-label="Up next"
              className="surface mt-1 flex flex-col divide-y divide-zinc-900/10 dark:divide-white/10"
            >
              {cardioUpNext.map((achievement) => {
                const progress = achievement.progress;
                if (!progress) return null;
                return (
                  <li key={achievement.id} className="flex items-center gap-3 px-3 py-2.5">
                    <AchievementBadge achievement={achievement} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{achievement.title}</p>
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${Math.min(100, (progress.current / progress.target) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-zinc-500 tabular-nums">
                      {progress.current.toLocaleString()}/{progress.target.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
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
