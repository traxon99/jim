"use client";

import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { PostToFriendsButton } from "@/components/friends/post-to-friends-button";
import { achievementPostDraft } from "@/lib/friends/post-drafts";
import { useAchievements } from "@/lib/history/use-achievements";
import type { Achievement, AchievementCategory } from "@jim/core";
import { Flame } from "lucide-react";
import { useMemo } from "react";

function weeks(count: number): string {
  return `${count} ${count === 1 ? "week" : "weeks"}`;
}

/**
 * Profile's motivation layer (issue #253): the weekly training streak,
 * earned badges, and the next milestone in each track. Everything is
 * derived from local history, so it works offline and a deleted workout
 * drops out on the next render. Hidden entirely until there's history.
 */
export function AchievementsSection() {
  const data = useAchievements();

  const { earned, upNext } = useMemo(() => {
    const achievements = data?.achievements ?? [];
    const earnedList = achievements
      .filter((achievement) => achievement.achievedAt)
      .sort((a, b) => (b.achievedAt?.getTime() ?? 0) - (a.achievedAt?.getTime() ?? 0));
    const seen = new Set<AchievementCategory>();
    const next: Achievement[] = [];
    for (const achievement of achievements) {
      if (achievement.achievedAt || seen.has(achievement.category)) continue;
      seen.add(achievement.category);
      next.push(achievement);
    }
    return { earned: earnedList, upNext: next };
  }, [data]);

  if (!data || data.achievements.length === 0) return null;
  const { streak } = data;

  return (
    <section className="flex w-full flex-col gap-4 text-left">
      <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-500">Achievements</h2>

      <div className="flex items-center gap-3 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            streak.current > 0
              ? "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400"
              : "bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600"
          }`}
        >
          <Flame className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-semibold">
            {streak.current > 0 ? `${weeks(streak.current)} streak` : "No streak yet"}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            {Math.min(streak.thisWeek, streak.weeklyTarget)}/{streak.weeklyTarget} workouts this
            week · best {weeks(streak.longest)}
          </span>
        </div>
      </div>

      {earned.length > 0 && (
        <ul className="grid grid-cols-4 gap-x-2 gap-y-3">
          {earned.map((achievement) => (
            <li key={achievement.id}>
              {/* Tapping an earned badge posts it to friends (issue #316). */}
              <PostToFriendsButton
                draft={achievementPostDraft(achievement)}
                label={`Post ${achievement.title} to friends`}
                className="w-full flex-col gap-1! rounded-lg text-center"
              >
                <AchievementBadge achievement={achievement} />
                <span className="text-[11px] leading-tight">{achievement.title}</span>
              </PostToFriendsButton>
            </li>
          ))}
        </ul>
      )}

      {upNext.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-500">Up next</h3>
          <ul className="flex flex-col gap-2">
            {upNext.map((achievement) => (
              <li key={achievement.id} className="flex items-center gap-3">
                <AchievementBadge achievement={achievement} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">{achievement.title}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    {achievement.description}
                  </span>
                  {achievement.progress && (
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${Math.min(100, (achievement.progress.current / achievement.progress.target) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-500">
                        {achievement.progress.current.toLocaleString()}/
                        {achievement.progress.target.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
