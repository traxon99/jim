import {
  type TrainingGoal,
  type V1Streak,
  type V1Weeks,
  WEEKLY_SET_TARGETS,
  dayKeyInstant,
  sickDayKeys,
  trainingStreak,
  weeklyStreakTarget,
} from "@jim/core";
import { programRoutines, programs, sessions, sickDays, users } from "@jim/db";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { type UserContext, withUser } from "../context.js";
import { MAX_SUMMARY_WEEKS, weeklySummary } from "../tools/weekly-summary.js";
import { dayIn, userZone } from "./zone.js";

export const weeksQuery = z.object({
  weeks: z.coerce.number().int().min(1).max(MAX_SUMMARY_WEEKS).default(2),
  goal: z.enum(["strength", "hypertrophy"]).default("hypertrophy"),
});

const TOP_EXERCISES = 5;

/**
 * `GET /v1/weeks` (#738): this week and the ones before it, from the same
 * `weeklySummary` the MCP tool returns, plus the time spent training.
 */
export async function v1Weeks(
  context: UserContext,
  input: { weeks: number; goal: TrainingGoal },
  now: Date = new Date(),
): Promise<V1Weeks> {
  const summaries = await weeklySummary(context, {
    date: now.toISOString(),
    weeks: input.weeks,
    goal: input.goal,
  });
  return withUser(context, async (tx) => {
    const [user] = await tx
      .select({ units: users.units, timeZone: users.timeZone })
      .from(users)
      .where(eq(users.id, context.userId));
    const zone = userZone(user?.timeZone);
    const oldest = summaries[summaries.length - 1];
    const finished = oldest
      ? await tx
          .select({ startedAt: sessions.startedAt, endedAt: sessions.endedAt })
          .from(sessions)
          .where(
            and(
              isNull(sessions.deletedAt),
              gte(sessions.startedAt, new Date(oldest.weekStart)),
              lt(sessions.startedAt, new Date(summaries[0]?.weekEnd ?? now)),
            ),
          )
      : [];
    const target = WEEKLY_SET_TARGETS[input.goal];

    return {
      goal: input.goal,
      units: user?.units ?? "lb",
      weeks: summaries.map((week) => {
        const start = new Date(week.weekStart);
        const end = new Date(week.weekEnd);
        const seconds = finished
          .filter((s) => s.endedAt && s.startedAt >= start && s.startedAt < end)
          .reduce(
            (sum, s) =>
              sum + Math.max(0, ((s.endedAt as Date).getTime() - s.startedAt.getTime()) / 1000),
            0,
          );
        return {
          // The week's first day; weeklySummary already split weeks in the user's zone.
          weekStart: dayIn(start, zone),
          workouts: week.workouts,
          workingSets: week.workingSets,
          volume: round(week.totalVolume),
          durationMinutes: Math.round(seconds / 60),
          muscles: Object.entries(week.setsByMuscle)
            .map(([muscle, sets]) => ({
              muscle,
              sets,
              target: { low: target.min, high: target.max },
              status: week.setStatusByMuscle[muscle] ?? "under",
            }))
            .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle)),
          topExercises: [...week.exercises]
            .sort((a, b) => b.volume - a.volume || b.sets - a.sets)
            .slice(0, TOP_EXERCISES)
            .map((exercise) => ({
              exerciseId: exercise.exerciseId,
              name: exercise.exerciseName,
              sets: exercise.sets,
              volume: round(exercise.volume),
            })),
        };
      }),
    };
  });
}

/**
 * `GET /v1/streak` (#738): `trainingStreak` over finished workouts with the
 * active program's weekly target, exactly as the Home tab builds it, but in
 * the user's stored zone rather than the server's.
 */
export async function v1Streak(context: UserContext, now: Date = new Date()): Promise<V1Streak> {
  return withUser(context, async (tx) => {
    const [user] = await tx
      .select({ weekStart: users.weekStart, timeZone: users.timeZone })
      .from(users)
      .where(eq(users.id, context.userId));
    const finished = (
      await tx
        .select({ startedAt: sessions.startedAt, endedAt: sessions.endedAt })
        .from(sessions)
        .where(isNull(sessions.deletedAt))
    ).filter((session) => session.endedAt !== null);
    const [active] = await tx
      .select()
      .from(programs)
      .where(and(eq(programs.isActive, true), isNull(programs.deletedAt)));
    const items = active
      ? await tx.select().from(programRoutines).where(eq(programRoutines.programId, active.id))
      : [];
    const target = weeklyStreakTarget(active ? { mode: active.mode, items } : null);
    // Sick days (issue #779) lower their week's target, as on the phone,
    // placed on their local day in the user's zone.
    const zone = userZone(user?.timeZone);
    const sick = sickDayKeys(
      await tx.select({ day: sickDays.day, deletedAt: sickDays.deletedAt }).from(sickDays),
    ).map((day) => dayKeyInstant(day, zone));
    const streak = trainingStreak(
      finished.map((session) => session.startedAt),
      target,
      user?.weekStart ?? 0,
      now,
      userZone(user?.timeZone),
      sick,
    );
    return {
      weeks: streak.current,
      target: streak.weeklyTarget,
      thisWeek: { done: streak.thisWeek, target: streak.weeklyTarget },
      longest: streak.longest,
    };
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
