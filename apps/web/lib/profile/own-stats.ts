import { db } from "@/lib/db/schema";
import { fetchProfile } from "@/lib/friends/client";
import { useFriends } from "@/lib/friends/use-friends";
import { sortGyms } from "@/lib/gyms";
import { useAchievements } from "@/lib/history/use-achievements";
import { useSessionList } from "@/lib/history/use-session-list";
import { weekActivity } from "@/lib/home/stats";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { weeklyStreakTarget } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";

/** Header stats and gym line for the signed-in user's profile (#752). */
export function useOwnProfileHeader(today: Date) {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const entries = useSessionList()?.entries;
  const achievements = useAchievements();
  const gyms = useLiveQuery(() => db.gyms.toArray(), []) ?? [];
  const programs = useLiveQuery(() => db.programs.toArray(), []) ?? [];
  const programRoutines = useLiveQuery(() => db.programRoutines.toArray(), []) ?? [];
  const { load } = useFriends();
  const [shareWorkouts, setShareWorkouts] = useState(true);

  useEffect(() => {
    void fetchProfile().then((result) => {
      if (result.ok) setShareWorkouts(result.value.shareWorkouts);
    });
  }, []);

  const workoutCount = entries?.length ?? 0;
  const friendCount =
    load.status === "ready"
      ? load.friends.filter((friend) => friend.status === "accepted").length
      : 0;

  const streakWeeks = achievements?.streak.current ?? 0;
  const weekDays = useMemo(
    () =>
      weekActivity(
        (entries ?? []).map((entry) => entry.startedAt),
        settings.weekStart,
        today,
      ),
    [entries, settings.weekStart, today],
  );
  const thisWeek = weekDays.filter((day) => day.trained).length;
  const activeProgram = programs.find((program) => program.isActive && !program.deletedAt);
  const weeklyTarget = weeklyStreakTarget(
    activeProgram
      ? {
          mode: activeProgram.mode,
          items: programRoutines.filter((item) => item.programId === activeProgram.id),
        }
      : null,
  );

  const defaultGym = sortGyms(gyms).find((gym) => !gym.deletedAt && gym.isDefault) ?? null;

  return {
    settings,
    workoutCount,
    friendCount,
    streakWeeks,
    weekDays,
    thisWeek,
    weeklyTarget,
    defaultGym,
    username: load.status === "ready" ? load.username : null,
    avatar: load.status === "ready" ? load.avatar : null,
    sharePrivate: !shareWorkouts,
  };
}
