"use client";

import { db } from "@/lib/db/schema";
import { fetchWeekRings } from "@/lib/friends/client";
import { useFriends } from "@/lib/friends/use-friends";
import { useAchievements } from "@/lib/history/use-achievements";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import {
  type WeekRingDisplay,
  type WeekRingPerson,
  clampWeeklyWorkoutGoal,
  sortWeekRingPeople,
  toWeekRingDisplay,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WeekRingAvatar } from "./week-ring-avatar";

function profileHref(person: WeekRingDisplay): string {
  return person.isSelf ? "/profile" : `/friends/${encodeURIComponent(person.username)}`;
}

function labelFor(person: WeekRingDisplay): string {
  return person.isSelf ? "You" : person.username;
}

function mergeSelfLocal(
  people: WeekRingPerson[],
  localDone: number | undefined,
  localGoal: number,
  selfFallback: Pick<WeekRingPerson, "userId" | "username" | "avatar"> | null,
): WeekRingPerson[] {
  if (localDone === undefined) return people;
  if (people.some((person) => person.isSelf)) {
    return people.map((person) =>
      person.isSelf
        ? {
            ...person,
            workoutsThisWeek: localDone,
            weeklyGoal: localGoal,
            shareWorkouts: true,
          }
        : person,
    );
  }
  if (!selfFallback) return people;
  return [
    {
      ...selfFallback,
      shareWorkouts: true,
      workoutsThisWeek: localDone,
      weeklyGoal: localGoal,
      lastWorkoutAt: null,
      isSelf: true,
    },
    ...people,
  ];
}

/**
 * Friends' week rings at the top of Home (issue #750): you first, then friends
 * still working toward their goal, then friends who met it.
 */
export function WeekRingsStrip() {
  const { load } = useFriends();
  const achievements = useAchievements();
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const [remote, setRemote] = useState<WeekRingPerson[] | null>(null);

  const hasFriends = load.status === "ready" && load.friends.some((f) => f.status === "accepted");
  const selfFallback =
    load.status === "ready" && load.username
      ? {
          userId: "me",
          username: load.username,
          avatar: load.avatar,
        }
      : null;

  useEffect(() => {
    if (load.status !== "ready") return;
    let cancelled = false;
    void fetchWeekRings().then((result) => {
      if (cancelled) return;
      if (result.ok) setRemote(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [load.status]);

  const localGoal = clampWeeklyWorkoutGoal(settings.weeklyWorkoutGoal);
  const localDone = achievements?.streak.thisWeek;

  const people = useMemo(() => {
    const base = remote ?? [];
    const merged = mergeSelfLocal(base, localDone, localGoal, selfFallback);
    return sortWeekRingPeople(merged).map(toWeekRingDisplay);
  }, [remote, localDone, localGoal, selfFallback]);

  if (load.status !== "ready") return null;
  if (!hasFriends && people.length === 0) return null;

  return (
    <nav
      aria-label="This week's workouts"
      className="-mx-4 flex gap-4 overflow-x-auto overscroll-x-contain px-4 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {people.map((person) => (
        <Link
          key={person.userId}
          href={profileHref(person)}
          data-ripple
          className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5"
        >
          <WeekRingAvatar person={person} />
          <span className="flex w-full flex-col items-center gap-0.5 text-center">
            <span
              className={`max-w-full truncate text-xs ${
                person.isSelf
                  ? "font-semibold text-zinc-950 dark:text-zinc-50"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {labelFor(person)}
            </span>
            {person.shareWorkouts && person.progress !== null && (
              <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-500">
                {person.workoutsThisWeek} of {person.weeklyGoal}
              </span>
            )}
          </span>
        </Link>
      ))}
    </nav>
  );
}
