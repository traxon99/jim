import { type V1Dpr, type V1Plan, isWarmupRoutine, suggestNextWorkout } from "@jim/core";
import {
  programRoutines,
  programs,
  routineExercises,
  routines,
  scheduledWorkouts,
  sessions,
  users,
} from "@jim/db";
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { type UserContext, withUser } from "../context.js";
import { dprStatus } from "../tools/dpr-status.js";
import { asWallClock, dayIn, userZone, wallClockDay } from "./zone.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const planQuery = z.object({
  days: z.coerce.number().int().min(1).max(14).default(7),
});

export const routineWebPath = (id: string) => `/routines/${id}`;

/**
 * `GET /v1/plan` (#742): scheduled workouts in the next `days` days (the
 * `list_scheduled_workouts` source) and the active program's next workout,
 * picked by `suggestNextWorkout` like the Workout tab's Up next card. Display
 * only: nothing here starts a workout.
 */
export async function v1Plan(
  context: UserContext,
  input: { days: number },
  now: Date = new Date(),
): Promise<V1Plan> {
  return withUser(context, async (tx) => {
    const [user] = await tx
      .select({ timeZone: users.timeZone })
      .from(users)
      .where(eq(users.id, context.userId));
    const zone = userZone(user?.timeZone);
    // A calendar day is stored as noon UTC (#540), so the window is by day key.
    const today = dayIn(now, zone);
    const fromKey = today;
    const toKey = new Date(Date.parse(`${today}T12:00:00Z`) + input.days * DAY_MS)
      .toISOString()
      .slice(0, 10);

    const scheduledRows = await tx
      .select({
        routineId: scheduledWorkouts.routineId,
        scheduledFor: scheduledWorkouts.scheduledFor,
        notes: scheduledWorkouts.notes,
      })
      .from(scheduledWorkouts)
      .where(
        and(
          isNull(scheduledWorkouts.deletedAt),
          gte(scheduledWorkouts.scheduledFor, new Date(`${fromKey}T00:00:00Z`)),
          lt(scheduledWorkouts.scheduledFor, new Date(`${toKey}T00:00:00Z`)),
        ),
      )
      .orderBy(asc(scheduledWorkouts.scheduledFor));

    const routineRows = await tx.select().from(routines).where(isNull(routines.deletedAt));
    const routineById = new Map(routineRows.map((routine) => [routine.id, routine]));
    const [active] = await tx
      .select()
      .from(programs)
      .where(and(eq(programs.isActive, true), isNull(programs.deletedAt)));

    let next: V1Plan["next"] = null;
    let programRoutineIds = new Set<string>();
    let nextRoutineId: string | null = null;
    let suggestion: ReturnType<typeof suggestNextWorkout> = null;
    if (active) {
      // Rest days stay; a deleted routine or a warm-up drops out, as in useNextWorkout.
      const items = (
        await tx.select().from(programRoutines).where(eq(programRoutines.programId, active.id))
      ).filter((item) => {
        if (item.routineId === null) return true;
        const routine = routineById.get(item.routineId);
        return routine !== undefined && !isWarmupRoutine(routine);
      });
      programRoutineIds = new Set(
        items.flatMap((item) => (item.routineId ? [item.routineId] : [])),
      );
      const sessionRows = await tx
        .select({
          routineId: sessions.routineId,
          startedAt: sessions.startedAt,
          endedAt: sessions.endedAt,
          deletedAt: sessions.deletedAt,
        })
        .from(sessions);
      // suggestNextWorkout does calendar math in the runtime's zone, as on the
      // phone; hand it the user's wall clock so its days are the user's days.
      const wall = (date: Date | null) => (date ? asWallClock(date, zone) : null);
      suggestion = suggestNextWorkout({
        mode: active.mode,
        items,
        sessions: sessionRows.map((s) => ({
          ...s,
          startedAt: asWallClock(s.startedAt, zone),
          endedAt: wall(s.endedAt),
          deletedAt: s.deletedAt,
        })),
        now: asWallClock(now, zone),
      });
      nextRoutineId = suggestion?.routineId ?? null;
    }

    const routineIds = [
      ...new Set([
        ...scheduledRows.flatMap((row) => (row.routineId ? [row.routineId] : [])),
        ...(nextRoutineId ? [nextRoutineId] : []),
      ]),
    ];
    const exerciseCounts = new Map<string, number>();
    if (routineIds.length) {
      for (const row of await tx
        .select({ routineId: routineExercises.routineId })
        .from(routineExercises)
        .where(
          and(inArray(routineExercises.routineId, routineIds), isNull(routineExercises.deletedAt)),
        )) {
        exerciseCounts.set(row.routineId, (exerciseCounts.get(row.routineId) ?? 0) + 1);
      }
    }
    const planned = (routineId: string) => ({
      routineId,
      routineName: routineById.get(routineId)?.name ?? "Deleted routine",
      exerciseCount: exerciseCounts.get(routineId) ?? 0,
      webPath: routineWebPath(routineId),
    });

    if (active && suggestion && nextRoutineId && routineById.has(nextRoutineId)) {
      next = {
        ...planned(nextRoutineId),
        programName: active.name,
        date: suggestion.date ? wallClockDay(suggestion.date) : null,
        reason: suggestion.reason,
        doneToday: suggestion.doneToday,
      };
    }

    return {
      scheduled: scheduledRows.flatMap((row) =>
        row.routineId && routineById.has(row.routineId)
          ? [
              {
                ...planned(row.routineId),
                date: row.scheduledFor.toISOString().slice(0, 10),
                programName: active && programRoutineIds.has(row.routineId) ? active.name : null,
                notes: row.notes,
              },
            ]
          : [],
      ),
      next,
    };
  });
}

/** `GET /v1/dpr` (#742): `dpr_status`, reshaped. Read only. */
export async function v1Dpr(context: UserContext, now: Date = new Date()): Promise<V1Dpr> {
  const status = await dprStatus(context);
  const block = status.block;
  const week = block
    ? Math.min(
        block.weeks,
        Math.max(1, Math.floor((now.getTime() - Date.parse(block.startedAt)) / (7 * DAY_MS)) + 1),
      )
    : 0;
  return {
    enabled: status.enabled,
    units: status.units,
    block: block
      ? {
          status: block.status,
          startedAt: block.startedAt,
          endsAt: block.effectiveEndsAt,
          week,
          weeks: block.weeks,
          ended: block.ended,
        }
      : null,
    lifts: status.lifts.map((lift) => {
      const [last] = lift.recentDecisions;
      return {
        exerciseId: lift.exercise.id,
        name: lift.exercise.name,
        next: {
          call: lift.nextCall.call,
          weight: lift.nextCall.weight,
          reps: lift.nextCall.targetReps,
          rpe: lift.nextCall.targetRpe ?? null,
          reason: lift.nextCall.reason,
        },
        e1rm: lift.e1rm,
        status: lift.status ?? null,
        lastDecision: last ? { after: last.after, call: last.call, weight: last.weight } : null,
      };
    }),
  };
}
