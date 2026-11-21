import {
  E1RM_FORMULAS,
  type InsightSet,
  PREDICTION_TUNING,
  dayKey,
  daysBetween,
  gymChanges,
  injuryAreaLabel,
  isDayKey,
  isSetToFailure,
  isStrengthExercise,
  isValidTimeZone,
  latestPainByDay,
  localTimeOfDay,
  predictOneRepMax,
  progressDecomposition,
  rapidSetFlags,
  repeatedTargetTrends,
  resolveCurrentRows,
  startOfLocalDay,
  workoutGaps,
} from "@jim/core";
import {
  type DbOrTx,
  gyms,
  injuries,
  painCheckins,
  routines,
  sessionExercises,
  sessions,
  sets,
  sickDays,
  users,
} from "@jim/db";
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";
import { findRoutine } from "./find-routine.js";
import { findGym } from "./gyms.js";
import { resolveExercise } from "./resolve-exercise.js";
import { exercisesById } from "./volume-report.js";

/**
 * Training-insight report tools (issue #860): read-only, in the user's local
 * calendar days, with the e1RM definitions stated in every result that uses
 * one. The computations live in @jim/core's history/training-insights.
 */

/** The longest range one call reads, so a report stays fast. */
export const INSIGHT_RANGE_MAX_DAYS = 366;
export const GET_SETS_DEFAULT_LIMIT = 500;
export const GET_SETS_MAX_LIMIT = 2000;

export interface InsightRangeInput {
  from: string;
  to: string;
}

interface InsightScope {
  from: string;
  to: string;
  timeZone: string;
  /** True when the user has no stored zone and days fall back to UTC. */
  timeZoneFallback: boolean;
  units: "kg" | "lb";
  start: Date;
  /** Exclusive: midnight starting the day after `to`. */
  end: Date;
}

function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function insightScope(tx: DbOrTx, userId: string, input: InsightRangeInput) {
  if (!isDayKey(input.from)) throw new Error("from must be a date written YYYY-MM-DD.");
  if (!isDayKey(input.to)) throw new Error("to must be a date written YYYY-MM-DD.");
  if (input.to < input.from) throw new Error("to must be on or after from.");
  if (daysBetween(input.from, input.to) + 1 > INSIGHT_RANGE_MAX_DAYS) {
    throw new Error(`Ask for at most ${INSIGHT_RANGE_MAX_DAYS} days at a time.`);
  }
  const [user] = await tx
    .select({ timeZone: users.timeZone, units: users.units })
    .from(users)
    .where(eq(users.id, userId));
  const stored = user?.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : null;
  const timeZone = stored ?? "UTC";
  return {
    from: input.from,
    to: input.to,
    timeZone,
    timeZoneFallback: stored === null,
    units: user?.units ?? "lb",
    start: startOfLocalDay(input.from, timeZone),
    end: startOfLocalDay(nextDay(input.to), timeZone),
  } satisfies InsightScope;
}

/** The range block every insight result echoes back. */
function rangeBlock(scope: InsightScope) {
  return {
    from: scope.from,
    to: scope.to,
    timeZone: scope.timeZone,
    ...(scope.timeZoneFallback
      ? { timeZoneNote: "No time zone is stored for this user, so days are UTC days." }
      : {}),
    units: scope.units,
  };
}

interface LoadedSet extends InsightSet {
  setIndex: number;
  rir: number | null;
  durationSeconds: number | null;
  distance: number | null;
  routineId: string | null;
  gymId: string | null;
}

/**
 * Every current, live set completed in [start, end), from workouts that
 * aren't deleted, oldest first. Every version of a set carries the
 * original's completedAt and session exercise, so the range filter keeps
 * whole supersede chains for resolveCurrentRows (as volume_report does).
 */
async function loadSets(tx: DbOrTx, start: Date, end: Date, timeZone: string) {
  const rows = await tx
    .select({
      set: sets,
      sessionId: sessionExercises.sessionId,
      exerciseId: sessionExercises.exerciseId,
      routineId: sessions.routineId,
      gymId: sessions.gymId,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .where(
      and(
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
        gte(sets.completedAt, start),
        lt(sets.completedAt, end),
      ),
    );
  const placeBySet = new Map(rows.map((row) => [row.set.id, row]));
  const loaded: LoadedSet[] = [];
  for (const set of resolveCurrentRows(rows.map((row) => row.set))) {
    if (set.deletedAt) continue;
    const place = placeBySet.get(set.id);
    if (!place) continue;
    loaded.push({
      id: set.id,
      sessionId: place.sessionId,
      exerciseId: place.exerciseId,
      completedAt: set.completedAt,
      localDate: dayKey(set.completedAt, timeZone),
      kind: set.kind,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      rpe: set.rpe == null ? null : Number(set.rpe),
      setIndex: set.setIndex,
      rir: set.rir,
      durationSeconds: set.durationSeconds,
      distance: set.distance == null ? null : Number(set.distance),
      routineId: place.routineId,
      gymId: place.gymId,
    });
  }
  // Ties broken on id (UUIDv7), so get_sets' offset cursor pages a stable order.
  return loaded.sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.id.localeCompare(b.id),
  );
}

/** Only strength exercises' sets, for trends and e1RMs; warm-up and cardio exercises aren't lifts. */
async function strengthOnly(tx: DbOrTx, loaded: readonly LoadedSet[]) {
  const known = await exercisesById(tx, [...new Set(loaded.map((set) => set.exerciseId))]);
  return {
    known,
    sets: loaded.filter((set) => {
      const exercise = known.get(set.exerciseId);
      return exercise !== undefined && isStrengthExercise(exercise);
    }),
  };
}

async function sickDaysIn(tx: DbOrTx, from: string, to: string): Promise<string[]> {
  const rows = await tx
    .select({ day: sickDays.day })
    .from(sickDays)
    .where(and(isNull(sickDays.deletedAt), gte(sickDays.day, from), lte(sickDays.day, to)));
  return [...new Set(rows.map((row) => row.day))].sort();
}

async function gymNames(tx: DbOrTx): Promise<Map<string, string>> {
  // A tombstoned gym reads as none (schema note on sessions.gym_id).
  const rows = await tx
    .select({ id: gyms.id, name: gyms.name })
    .from(gyms)
    .where(isNull(gyms.deletedAt));
  return new Map(rows.map((row) => [row.id, row.name]));
}

// ---------------------------------------------------------------------------
// get_sets
// ---------------------------------------------------------------------------

export interface GetSetsInput extends InsightRangeInput {
  exercise?: string;
  routine?: string;
  gym?: string;
  setType?: "warmup" | "working" | "drop" | "failure";
  limit?: number;
  cursor?: string;
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const offset = Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("cursor must be the nextCursor from an earlier get_sets call.");
  }
  return offset;
}

export async function getSets(context: UserContext, input: GetSetsInput) {
  return withUser(context, async (tx) => {
    const scope = await insightScope(tx, context.userId, input);
    const offset = parseCursor(input.cursor);
    const limit = Math.min(input.limit ?? GET_SETS_DEFAULT_LIMIT, GET_SETS_MAX_LIMIT);
    const exercise = input.exercise
      ? await resolveExercise(tx, context.userId, input.exercise)
      : null;
    const routine = input.routine ? await findRoutine(tx, input.routine) : null;
    const gym = input.gym ? await findGym(tx, input.gym) : null;

    const loaded = await loadSets(tx, scope.start, scope.end, scope.timeZone);
    // Rest before a set is the gap since the workout's previous set, any exercise.
    const restBefore = new Map<string, number>();
    const lastInSession = new Map<string, Date>();
    for (const set of loaded) {
      const previous = lastInSession.get(set.sessionId);
      if (previous) {
        restBefore.set(set.id, Math.round((set.completedAt.getTime() - previous.getTime()) / 1000));
      }
      lastInSession.set(set.sessionId, set.completedAt);
    }

    const matching = loaded.filter(
      (set) =>
        (!exercise || set.exerciseId === exercise.id) &&
        (!routine || set.routineId === routine.id) &&
        (!gym || set.gymId === gym.id) &&
        (!input.setType || set.kind === input.setType),
    );
    const page = matching.slice(offset, offset + limit);

    const names = await exercisesById(tx, [...new Set(page.map((set) => set.exerciseId))]);
    const routineIds = [...new Set(page.map((set) => set.routineId).filter((id) => id != null))];
    const routineNames = new Map(
      routineIds.length
        ? (
            await tx
              .select({ id: routines.id, name: routines.name })
              .from(routines)
              .where(inArray(routines.id, routineIds as string[]))
          ).map((row) => [row.id, row.name])
        : [],
    );
    const gymsById = await gymNames(tx);

    const next = offset + page.length;
    return {
      range: rangeBlock(scope),
      total: matching.length,
      returned: page.length,
      nextCursor: next < matching.length ? String(next) : null,
      sets: page.map((set) => ({
        setId: set.id,
        sessionId: set.sessionId,
        localDate: set.localDate,
        localTime: localTimeOfDay(set.completedAt, scope.timeZone),
        completedAt: set.completedAt.toISOString(),
        exerciseId: set.exerciseId,
        exercise: names.get(set.exerciseId)?.name ?? null,
        setIndex: set.setIndex,
        setType: set.kind,
        toFailure: isSetToFailure(set),
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
        rir: set.rir,
        durationSeconds: set.durationSeconds,
        distance: set.distance,
        restBeforeSeconds: restBefore.get(set.id) ?? null,
        routineId: set.routineId,
        routine: set.routineId ? (routineNames.get(set.routineId) ?? null) : null,
        gymId: set.gymId && gymsById.has(set.gymId) ? set.gymId : null,
        gym: set.gymId ? (gymsById.get(set.gymId) ?? null) : null,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// repeated_target_trends
// ---------------------------------------------------------------------------

export interface RepeatedTargetTrendsInput extends InsightRangeInput {
  exercise?: string;
  minSessions?: number;
  includeWarmups?: boolean;
}

export async function repeatedTargetTrendsTool(
  context: UserContext,
  input: RepeatedTargetTrendsInput,
) {
  return withUser(context, async (tx) => {
    const scope = await insightScope(tx, context.userId, input);
    const exercise = input.exercise
      ? await resolveExercise(tx, context.userId, input.exercise)
      : null;
    const { known, sets: lifts } = await strengthOnly(
      tx,
      await loadSets(tx, scope.start, scope.end, scope.timeZone),
    );
    const sick = await sickDaysIn(tx, scope.from, scope.to);
    const targets = repeatedTargetTrends(
      lifts.filter((set) => !exercise || set.exerciseId === exercise.id),
      {
        minSessions: input.minSessions ?? 2,
        includeWarmups: input.includeWarmups ?? false,
        sickDays: sick,
      },
    );
    return {
      range: rangeBlock(scope),
      formulas: E1RM_FORMULAS,
      targetCount: targets.length,
      targets: targets.map((target) => ({
        exercise: known.get(target.exerciseId)?.name ?? null,
        ...target,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// progress_decomposition
// ---------------------------------------------------------------------------

export interface ProgressDecompositionInput extends InsightRangeInput {
  exercise?: string;
}

export async function progressDecompositionTool(
  context: UserContext,
  input: ProgressDecompositionInput,
) {
  return withUser(context, async (tx) => {
    const scope = await insightScope(tx, context.userId, input);
    const exercise = input.exercise
      ? await resolveExercise(tx, context.userId, input.exercise)
      : null;
    const { known, sets: lifts } = await strengthOnly(
      tx,
      await loadSets(tx, scope.start, scope.end, scope.timeZone),
    );
    const results = progressDecomposition(
      lifts.filter((set) => !exercise || set.exerciseId === exercise.id),
    );
    if (exercise && results.length === 0) {
      results.push({
        exerciseId: exercise.id,
        status: "insufficient_data",
        sessions: 0,
        reason: "No sets of this exercise in this range.",
      });
      known.set(exercise.id, exercise);
    }
    return {
      range: rangeBlock(scope),
      formulas: E1RM_FORMULAS,
      exercises: results
        .map((result) => ({ exercise: known.get(result.exerciseId)?.name ?? null, ...result }))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "ok" ? -1 : 1;
          const changeA = a.status === "ok" ? Math.abs(a.change) : 0;
          const changeB = b.status === "ok" ? Math.abs(b.change) : 0;
          return changeB - changeA;
        }),
    };
  });
}

// ---------------------------------------------------------------------------
// training_context
// ---------------------------------------------------------------------------

export const DEFAULT_GAP_DAYS = 4;

export interface TrainingContextInput extends InsightRangeInput {
  gapDays?: number;
}

export async function trainingContext(context: UserContext, input: TrainingContextInput) {
  return withUser(context, async (tx) => {
    const scope = await insightScope(tx, context.userId, input);
    const gapDays = input.gapDays ?? DEFAULT_GAP_DAYS;
    const sick = await sickDaysIn(tx, scope.from, scope.to);
    const gymsById = await gymNames(tx);

    const sessionRows = await tx
      .select({ id: sessions.id, startedAt: sessions.startedAt, gymId: sessions.gymId })
      .from(sessions)
      .where(
        and(
          isNull(sessions.deletedAt),
          // Finished workouts only, as list_workouts counts them.
          isNotNull(sessions.endedAt),
          gte(sessions.startedAt, scope.start),
          lt(sessions.startedAt, scope.end),
        ),
      );
    const workouts = sessionRows
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .map((row) => {
        const gymName = row.gymId ? (gymsById.get(row.gymId) ?? null) : null;
        return {
          sessionId: row.id,
          localDate: dayKey(row.startedAt, scope.timeZone),
          startedAt: row.startedAt.toISOString(),
          gymId: gymName ? row.gymId : null,
          gymName,
        };
      });

    // Injuries open at any point in the range, with the range's pain check-ins.
    const injuryRows = (await tx.select().from(injuries).where(isNull(injuries.deletedAt))).filter(
      (row) => row.startedOn <= scope.to && (!row.healedOn || row.healedOn >= scope.from),
    );
    const checkins = injuryRows.length
      ? await tx
          .select()
          .from(painCheckins)
          .where(
            and(
              isNull(painCheckins.deletedAt),
              inArray(
                painCheckins.injuryId,
                injuryRows.map((row) => row.id),
              ),
              gte(painCheckins.day, scope.from),
              lte(painCheckins.day, scope.to),
            ),
          )
      : [];
    const injuryList = injuryRows
      .sort((a, b) => a.startedOn.localeCompare(b.startedOn))
      .map((row) => ({
        injuryId: row.id,
        area: row.area,
        label: injuryAreaLabel(row.area, row.side),
        side: row.side,
        openedOn: row.startedOn,
        healedOn: row.healedOn,
        pain: [...latestPainByDay(checkins, row.id)]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, painLevel]) => ({ day, painLevel })),
      }));

    const gaps = workoutGaps(
      workouts.map((w) => w.localDate),
      gapDays,
      sick,
    );
    const changes = gymChanges(workouts);

    type TimelineEvent = { date: string; type: string; detail: string };
    const timeline: TimelineEvent[] = [
      ...sick.map((day) => ({ date: day, type: "sick_day", detail: "Marked as a sick day" })),
      ...injuryList.flatMap((injury) => {
        const name = injury.label;
        const events: TimelineEvent[] = [];
        if (injury.openedOn >= scope.from) {
          events.push({ date: injury.openedOn, type: "injury_opened", detail: `${name} injury` });
        }
        if (injury.healedOn && injury.healedOn <= scope.to) {
          events.push({ date: injury.healedOn, type: "injury_healed", detail: `${name} healed` });
        }
        return events;
      }),
      ...changes.map((change) => ({
        date: change.localDate,
        type: "gym_change",
        detail: `${change.fromGym ?? "No gym"} → ${change.toGym ?? "No gym"}`,
      })),
      ...gaps.map((gap) => ({
        date: gap.from,
        type: "gap",
        detail: `${gap.days} days without a workout, until ${gap.to}${gap.sickDays ? ` (${gap.sickDays} sick)` : ""}`,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    return {
      range: rangeBlock(scope),
      gapDays,
      workoutCount: workouts.length,
      timeline,
      sickDays: sick,
      injuries: injuryList,
      workouts,
      gymChanges: changes,
      gaps,
    };
  });
}

// ---------------------------------------------------------------------------
// data_quality_flags
// ---------------------------------------------------------------------------

export const DEFAULT_RAPID_SET_SECONDS = 10;
export const DEFAULT_STALE_WEEKS = 6;

export interface DataQualityFlagsInput extends InsightRangeInput {
  rapidSetSeconds?: number;
  staleWeeks?: number;
}

export async function dataQualityFlags(context: UserContext, input: DataQualityFlagsInput) {
  return withUser(context, async (tx) => {
    const scope = await insightScope(tx, context.userId, input);
    const rapidSeconds = input.rapidSetSeconds ?? DEFAULT_RAPID_SET_SECONDS;
    const staleWeeks = input.staleWeeks ?? DEFAULT_STALE_WEEKS;
    const loaded = await loadSets(tx, scope.start, scope.end, scope.timeZone);
    const known = await exercisesById(tx, [...new Set(loaded.map((set) => set.exerciseId))]);
    const nameOf = (id: string) => known.get(id)?.name ?? null;

    const flags: Array<Record<string, unknown> & { type: string; explanation: string }> = [];

    for (const flag of rapidSetFlags(loaded, rapidSeconds)) {
      flags.push({
        type: "rapid_sets",
        explanation: `Two sets logged ${flag.secondsApart}s apart, likely after the fact, so treat their RPE as a guess.`,
        sessionId: flag.sessionId,
        localDate: flag.localDate,
        completedAt: flag.completedAt,
        exerciseId: flag.exerciseId,
        exercise: nameOf(flag.exerciseId),
        setIds: flag.setIds,
        secondsApart: flag.secondsApart,
      });
    }

    for (const exercise of known.values()) {
      if (!isStrengthExercise(exercise) || exercise.primaryMuscles.length > 0) continue;
      flags.push({
        type: "missing_primary_muscle",
        explanation:
          "A strength exercise with no primary muscle: its sets count toward no muscle in volume_report and weekly_summary. Tag it with upsert_exercise or in the app.",
        exerciseId: exercise.id,
        exercise: exercise.name,
        sessionIds: [
          ...new Set(loaded.filter((s) => s.exerciseId === exercise.id).map((s) => s.sessionId)),
        ],
      });
    }

    // A predicted 1RM as of the range's end that no working set in the last
    // `staleWeeks` weeks supports. Only lifts trained in the prediction's
    // window are checked, so long-abandoned exercises don't fill the list.
    const asOf = scope.end;
    const windowStart = new Date(asOf.getTime() - PREDICTION_TUNING.windowDays * 86_400_000);
    // The prediction itself reads up to windowDays before a lift's last set,
    // so load twice the window to match exercise_history's figure.
    const historyStart = new Date(asOf.getTime() - 2 * PREDICTION_TUNING.windowDays * 86_400_000);
    const staleCutoff = new Date(asOf.getTime() - staleWeeks * 7 * 86_400_000);
    const history = (await strengthOnly(tx, await loadSets(tx, historyStart, asOf, scope.timeZone)))
      .sets;
    const byExercise = new Map<string, typeof history>();
    for (const set of history) {
      if (set.kind === "warmup") continue;
      const list = byExercise.get(set.exerciseId) ?? [];
      list.push(set);
      byExercise.set(set.exerciseId, list);
    }
    const historyNames = await exercisesById(tx, [...byExercise.keys()]);
    for (const [exerciseId, list] of byExercise) {
      const last = list[list.length - 1];
      if (!last || last.completedAt >= staleCutoff || last.completedAt < windowStart) continue;
      const prediction = predictOneRepMax(list, new Date(asOf.getTime() - 1));
      if (!prediction) continue;
      flags.push({
        type: "stale_predicted_1rm",
        explanation: `No working set in the ${staleWeeks} weeks before ${scope.to}, so the predicted 1RM rests on old sets; don't quote it as current.`,
        exerciseId,
        exercise: historyNames.get(exerciseId)?.name ?? null,
        predictedOneRepMax: prediction.value,
        confidence: prediction.confidence,
        lastSessionId: last.sessionId,
        lastTrained: last.localDate,
        daysSinceTrained: daysBetween(last.localDate, scope.to),
      });
    }

    return {
      range: rangeBlock(scope),
      thresholds: { rapidSetSeconds: rapidSeconds, staleWeeks },
      flagCount: flags.length,
      flags,
    };
  });
}
