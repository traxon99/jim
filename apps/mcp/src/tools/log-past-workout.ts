import {
  type PrCandidate,
  type WeightRepsSet,
  computePriorBests,
  deletedSessionExerciseIds,
  detectPersonalRecords,
  isWarmupExercise,
  resolveCurrentRows,
  summarizeSession,
  tracksRepsAtWeight,
  uuidv7,
} from "@jim/core";
import { type DbOrTx, personalRecords, routines, sessionExercises, sessions, sets } from "@jim/db";
import { and, eq, inArray, lt } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { findGym } from "./gyms.js";
import { resolveExercise } from "./resolve-exercise.js";
import { RoutineNotFoundError } from "./update-routine.js";

type SetKind = typeof sets.$inferInsert.kind & string;

export interface LogPastWorkoutSetInput {
  weight?: number;
  reps?: number;
  rpe?: number;
  rir?: number;
  durationSeconds?: number;
  distance?: number;
  kind?: SetKind;
}

export interface LogPastWorkoutExerciseInput {
  exercise: string;
  notes?: string;
  sets: LogPastWorkoutSetInput[];
}

export interface LogPastWorkoutInput {
  /** When the workout started (ISO date/time). */
  startedAt: string;
  /** How long it took; defaults to 60 minutes. The session ends `startedAt + durationMinutes`. */
  durationMinutes?: number;
  name?: string;
  routineId?: string;
  notes?: string;
  bodyweight?: number;
  /** The gym it was at (issue #454), by name or id; none when omitted. */
  gym?: string;
  exercises: LogPastWorkoutExerciseInput[];
  /** Preview only: run every check and return the result, then roll back (#245). */
  dryRun?: boolean;
}

export const DEFAULT_DURATION_MINUTES = 60;

/** Room for clock skew between the agent's idea of "now" and ours. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

/**
 * Sets are spread evenly across the session, in the order given, so rest
 * gaps and "PR achieved at" land inside the workout rather than all at once.
 */
export function setCompletionTimes(startedAt: Date, endedAt: Date, count: number): Date[] {
  const span = endedAt.getTime() - startedAt.getTime();
  return Array.from(
    { length: count },
    (_, index) => new Date(startedAt.getTime() + (span * (index + 1)) / count),
  );
}

/**
 * Every earlier working set for `exerciseId`, from sessions that aren't
 * deleted: what a backdated set is compared against for PRs. Only sets
 * completed before `before` count, so logging an old workout never beats
 * a record against lifts that came after it.
 */
async function historyBefore(
  tx: DbOrTx,
  exerciseId: string,
  before: Date,
): Promise<Array<WeightRepsSet & { completedAt: Date }>> {
  const sessionExerciseRows = await tx
    .select({
      id: sessionExercises.id,
      sessionId: sessionExercises.sessionId,
      deletedAt: sessionExercises.deletedAt,
    })
    .from(sessionExercises)
    .where(eq(sessionExercises.exerciseId, exerciseId));
  if (sessionExerciseRows.length === 0) return [];

  const sessionRows = await tx
    .select({ id: sessions.id, deletedAt: sessions.deletedAt })
    .from(sessions)
    .where(inArray(sessions.id, [...new Set(sessionExerciseRows.map((row) => row.sessionId))]));
  const deleted = deletedSessionExerciseIds(sessionRows, sessionExerciseRows);
  const liveIds = sessionExerciseRows.map((row) => row.id).filter((id) => !deleted.has(id));
  if (liveIds.length === 0) return [];

  const rawSets = await tx
    .select()
    .from(sets)
    .where(and(inArray(sets.sessionExerciseId, liveIds), lt(sets.completedAt, before)));
  return resolveCurrentRows(rawSets)
    .filter((set) => !set.deletedAt && set.kind !== "warmup")
    .map((set) => ({
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      completedAt: set.completedAt,
    }));
}

/**
 * Logs a workout that already happened — "I forgot my phone, here's what I
 * did" (#244). The session is created already finalized (`endedAt` set, in
 * the past), so it can never be, or touch, the phone's in-progress session
 * (ADR-007). PRs are detected the way the phone does it when a set is
 * logged (`detectPersonalRecords`), against every earlier set.
 */
export async function logPastWorkout(context: UserContext, input: LogPastWorkoutInput) {
  const startedAt = new Date(input.startedAt);
  if (Number.isNaN(startedAt.getTime())) throw new Error(`Invalid startedAt: ${input.startedAt}`);
  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  if (!(durationMinutes > 0)) throw new Error("durationMinutes must be greater than 0");
  const endedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
  if (endedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new Error(
      "log_past_workout only logs workouts that are already over — this one would end in the future. Use schedule_workout to plan one.",
    );
  }
  const totalSets = input.exercises.reduce((sum, item) => sum + item.sets.length, 0);
  if (totalSets === 0) throw new Error("A logged workout needs at least one set.");

  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    let routineName: string | null = null;
    if (input.routineId) {
      const [routine] = await tx.select().from(routines).where(eq(routines.id, input.routineId));
      if (!routine || routine.deletedAt) throw new RoutineNotFoundError(input.routineId);
      routineName = routine.name;
    }

    const gym = input.gym ? await findGym(tx, input.gym) : null;

    const now = new Date();
    const sessionId = uuidv7();
    const name = input.name ?? routineName;
    await tx.insert(sessions).values({
      id: sessionId,
      userId: context.userId,
      routineId: input.routineId ?? null,
      name,
      startedAt,
      endedAt,
      notes: input.notes ?? null,
      bodyweight: input.bodyweight == null ? null : String(input.bodyweight),
      gymId: gym?.id ?? null,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
    });

    const completionTimes = setCompletionTimes(startedAt, endedAt, totalSets);
    let setCursor = 0;
    const loggedExercises = [];

    for (const [position, item] of input.exercises.entries()) {
      const exercise = await resolveExercise(tx, context.userId, item.exercise);
      const sessionExerciseId = uuidv7();
      await tx.insert(sessionExercises).values({
        id: sessionExerciseId,
        userId: context.userId,
        sessionId,
        exerciseId: exercise.id,
        position,
        notes: item.notes ?? null,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
      });

      const exerciseIsWarmup = isWarmupExercise(exercise);
      const firstCompletedAt = completionTimes[setCursor] ?? endedAt;
      // Earlier sets in this same workout count too, as they do on the phone.
      const history: WeightRepsSet[] = exerciseIsWarmup
        ? []
        : await historyBefore(tx, exercise.id, firstCompletedAt);
      const repsAtWeight = tracksRepsAtWeight(exercise.trackingType);

      const loggedSets = [];
      for (const [setIndex, set] of item.sets.entries()) {
        const completedAt = completionTimes[setCursor++] ?? endedAt;
        const kind = set.kind ?? "working";
        const setId = uuidv7();
        await tx.insert(sets).values({
          id: setId,
          userId: context.userId,
          sessionExerciseId,
          setIndex,
          kind,
          weight: set.weight == null ? null : String(set.weight),
          reps: set.reps ?? null,
          durationSeconds: set.durationSeconds ?? null,
          distance: set.distance == null ? null : String(set.distance),
          rpe: set.rpe == null ? null : String(set.rpe),
          rir: set.rir ?? null,
          completedAt,
        });

        let prs: PrCandidate[] = [];
        if (!exerciseIsWarmup && kind !== "warmup") {
          const candidate = { weight: set.weight ?? null, reps: set.reps ?? null };
          prs = detectPersonalRecords(candidate, computePriorBests(history), { repsAtWeight });
          history.push(candidate);
          for (const pr of prs) {
            await tx.insert(personalRecords).values({
              id: uuidv7(),
              userId: context.userId,
              exerciseId: exercise.id,
              kind: pr.kind,
              value: String(pr.value),
              setId,
              achievedAt: completedAt,
              updatedAt: now,
              deviceId: MCP_DEVICE_ID,
            });
          }
        }

        loggedSets.push({
          id: setId,
          kind,
          weight: set.weight ?? null,
          reps: set.reps ?? null,
          rpe: set.rpe ?? null,
          completedAt: completedAt.toISOString(),
          prs: prs.map((pr) => pr.kind),
        });
      }

      loggedExercises.push({
        sessionExerciseId,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: loggedSets,
      });
    }

    // Same summary list_workouts reports, so the two can't disagree.
    const allSets = loggedExercises.flatMap((item) => item.sets);
    const summary = summarizeSession(
      allSets,
      startedAt,
      endedAt,
      allSets.filter((set) => set.prs.length > 0).length,
    );

    return {
      id: sessionId,
      name,
      routineId: input.routineId ?? null,
      gym: gym ? { id: gym.id, name: gym.name } : null,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      totalVolume: summary.totalVolume,
      setCount: summary.setCount,
      prCount: summary.prCount,
      exercises: loggedExercises,
    };
  });
}
