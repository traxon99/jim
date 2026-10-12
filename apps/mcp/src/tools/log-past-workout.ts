import {
  type PrCandidate,
  type WeightRepsSet,
  computePriorBests,
  deletedSessionExerciseIds,
  detectPersonalRecords,
  isVisiblePrKind,
  isWarmupExercise,
  resolveCurrentRows,
  summarizeSession,
  tracksRepsAtWeight,
  uuidv7,
} from "@jim/core";
import { type DbOrTx, personalRecords, sessionExercises, sessions, sets } from "@jim/db";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { findRoutine } from "./find-routine.js";
import { findGym } from "./gyms.js";
import { resolveExercise } from "./resolve-exercise.js";

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

/**
 * The set fields each tracking type is logged with, the way the app's set
 * entry shows them: holds are seconds, distance cardio is a distance (and a
 * time for `distance_time`), everything else is reps (issue #513).
 */
const FIELDS_BY_TRACKING_TYPE: Record<string, readonly (keyof LogPastWorkoutSetInput)[]> = {
  weight_reps: ["weight", "reps", "rpe", "rir"],
  bodyweight: ["weight", "reps", "rpe", "rir"],
  weighted_bodyweight: ["weight", "reps", "rpe", "rir"],
  time: ["durationSeconds", "weight", "rpe", "rir"],
  distance: ["distance"],
  distance_time: ["distance", "durationSeconds"],
};

const SET_FIELDS = ["weight", "reps", "rpe", "rir", "durationSeconds", "distance"] as const;

/** Rejects set fields the exercise's tracking type doesn't log, e.g. reps on a plank. */
export function validateSetFields(
  exercise: { name: string; trackingType: string },
  sets: readonly LogPastWorkoutSetInput[],
) {
  const allowed = FIELDS_BY_TRACKING_TYPE[exercise.trackingType];
  if (!allowed) return;
  for (const [index, set] of sets.entries()) {
    const wrong = SET_FIELDS.filter((field) => set[field] != null && !allowed.includes(field));
    if (wrong.length > 0) {
      throw new Error(
        `${exercise.name} is tracked by ${exercise.trackingType}, so set ${index + 1} can't have ${wrong.join(", ")}. Use ${allowed.join(", ")} instead.`,
      );
    }
  }
}

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
): Promise<Array<WeightRepsSet & { id: string; completedAt: Date }>> {
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
      id: set.id,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      completedAt: set.completedAt,
    }));
}

const END_OF_TIME = new Date("9999-12-31T00:00:00Z");

/**
 * A backdated workout can outdo PRs logged after it (issue #537): with a
 * 120×5 on Jan 1, Jan 10's 100×5 was never a PR. Re-checks each later PR
 * row for the exercise the way it was first detected, against every set
 * before it (the new ones included), and retires the ones that no longer
 * hold. Returns how many it retired.
 */
async function retireOutdoneLaterPrs(
  tx: DbOrTx,
  exerciseId: string,
  repsAtWeight: boolean,
  after: Date,
  now: Date,
): Promise<number> {
  const laterPrs = await tx
    .select()
    .from(personalRecords)
    .where(
      and(
        eq(personalRecords.exerciseId, exerciseId),
        isNull(personalRecords.deletedAt),
        gt(personalRecords.achievedAt, after),
      ),
    );
  if (laterPrs.length === 0) return 0;

  const history = await historyBefore(tx, exerciseId, END_OF_TIME);
  let retired = 0;
  for (const pr of laterPrs) {
    const set = history.find((row) => row.id === pr.setId);
    if (!set) continue;
    const prior = computePriorBests(history.filter((row) => row.completedAt < set.completedAt));
    const stillHolds = detectPersonalRecords(set, prior, { repsAtWeight }).some(
      (candidate) => candidate.kind === pr.kind,
    );
    if (stillHolds) continue;
    await tx
      .update(personalRecords)
      .set({
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(personalRecords.id, pr.id));
    retired++;
  }
  return retired;
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
    // An id or the routine's exact name, like every other routine tool (#514).
    const routine = input.routineId ? await findRoutine(tx, input.routineId) : null;
    const routineName = routine?.name ?? null;

    const gym = input.gym ? await findGym(tx, input.gym) : null;

    const now = new Date();
    const sessionId = uuidv7();
    const name = input.name ?? routineName;
    await tx.insert(sessions).values({
      id: sessionId,
      userId: context.userId,
      routineId: routine?.id ?? null,
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
    const prChecks = new Map<string, boolean>();

    for (const [position, item] of input.exercises.entries()) {
      const exercise = await resolveExercise(tx, context.userId, item.exercise);
      validateSetFields(exercise, item.sets);
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
      if (!exerciseIsWarmup) prChecks.set(exercise.id, repsAtWeight);

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

    let laterPrsRetired = 0;
    for (const [exerciseId, repsAtWeight] of prChecks) {
      laterPrsRetired += await retireOutdoneLaterPrs(tx, exerciseId, repsAtWeight, endedAt, now);
    }

    // Same summary list_workouts reports, so the two can't disagree.
    const allSets = loggedExercises.flatMap((item) => item.sets);
    const summary = summarizeSession(
      allSets,
      startedAt,
      endedAt,
      allSets.reduce((n, set) => n + set.prs.filter((kind) => isVisiblePrKind(kind)).length, 0),
    );

    return {
      id: sessionId,
      name,
      routineId: routine?.id ?? null,
      gym: gym ? { id: gym.id, name: gym.name } : null,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      totalVolume: summary.totalVolume,
      setCount: summary.setCount,
      prCount: summary.prCount,
      /** PRs logged after this workout that it outdid, now no longer PRs (#537). */
      laterPrsRetired,
      exercises: loggedExercises,
    };
  });
}
