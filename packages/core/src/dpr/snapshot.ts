import { deletedSessionExerciseIds } from "../history/deleted-sessions";
import { resolveCurrentRows } from "../sync/supersede";
import {
  type DprHistoryEntry,
  type DprSet,
  type DprSetKind,
  type RepRange,
  type RoutineRepRangeSource,
  resolveRepRange,
} from "./decide";
import { sessionE1rm } from "./e1rm";
import type { E1rmPoint } from "./goal";

/**
 * Everything DPR derives from, read out of Dexie in one pass. DPR stores no
 * calls of its own (issue #207): every decision, goal status and log entry
 * is a pure @jim/core function of this.
 */
export interface DprSnapshot {
  /** One entry per (completed session, exercise), each tagged with its rep range. */
  history: DprHistoryEntry[];
  /** Rep ranges from every live routine, for `resolveRepRange`'s fallback. */
  routineRanges: RoutineRepRangeSource[];
  /** The rows `focusCandidates` / `buildExerciseUsage` take. */
  usageRows: { exerciseId: string; sessionId: string; startedAt: Date }[];
  /** Start of the first completed session, or null with no history. */
  firstSessionAt: Date | null;
  completedSessionCount: number;
}

/** The subset of each synced row the snapshot reads — Dexie and Drizzle rows both fit. */
export interface DprSourceRows {
  sessions: readonly {
    id: string;
    routineId: string | null;
    startedAt: Date;
    endedAt: Date | null;
    deletedAt: Date | null;
  }[];
  sessionExercises: readonly {
    id: string;
    sessionId: string;
    exerciseId: string;
    deletedAt: Date | null;
  }[];
  sets: readonly DprSourceSet[];
  routines: readonly { id: string; updatedAt: Date; deletedAt: Date | null }[];
  routineExercises: readonly {
    routineId: string;
    exerciseId: string;
    targetRepsLow: number | null;
    targetRepsHigh: number | null;
    updatedAt: Date;
    deletedAt: Date | null;
  }[];
}

export interface DprSourceSet {
  id: string;
  sessionExerciseId: string;
  setIndex: number;
  kind: DprSetKind;
  /** Postgres numeric columns arrive as strings. */
  weight: string | number | null;
  reps: number | null;
  rpe: string | number | null;
  supersedesId: string | null;
  deletedAt: Date | null;
}

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toDprSet(row: DprSourceSet): DprSet {
  return {
    kind: row.kind,
    weight: toNumber(row.weight),
    reps: row.reps,
    rpe: toNumber(row.rpe),
  };
}

export function buildDprSnapshot(rows: DprSourceRows, defaultRange: RepRange): DprSnapshot {
  const liveRoutines = new Map(
    rows.routines.filter((routine) => !routine.deletedAt).map((routine) => [routine.id, routine]),
  );
  const routineRanges: RoutineRepRangeSource[] = [];
  const rangeByRoutineExercise = new Map<string, DprSourceRows["routineExercises"][number]>();
  for (const item of rows.routineExercises) {
    const routine = liveRoutines.get(item.routineId);
    if (item.deletedAt || !routine) continue;
    routineRanges.push({
      exerciseId: item.exerciseId,
      targetRepsLow: item.targetRepsLow,
      targetRepsHigh: item.targetRepsHigh,
      updatedAt: routine.updatedAt > item.updatedAt ? routine.updatedAt : item.updatedAt,
    });
    const key = `${item.routineId}:${item.exerciseId}`;
    if (!rangeByRoutineExercise.has(key)) rangeByRoutineExercise.set(key, item);
  }

  const completed = new Map(
    rows.sessions
      .filter((session) => session.endedAt && !session.deletedAt)
      .map((session) => [session.id, session]),
  );
  const deleted = deletedSessionExerciseIds(rows.sessions, rows.sessionExercises);

  const setsBySessionExercise = new Map<string, DprSourceSet[]>();
  for (const set of resolveCurrentRows(rows.sets)) {
    if (set.deletedAt) continue;
    const list = setsBySessionExercise.get(set.sessionExerciseId) ?? [];
    list.push(set);
    setsBySessionExercise.set(set.sessionExerciseId, list);
  }

  const history: DprHistoryEntry[] = [];
  const usageRows: DprSnapshot["usageRows"] = [];
  for (const sessionExercise of rows.sessionExercises) {
    if (deleted.has(sessionExercise.id)) continue;
    const session = completed.get(sessionExercise.sessionId);
    if (!session) continue;
    usageRows.push({
      exerciseId: sessionExercise.exerciseId,
      sessionId: session.id,
      startedAt: session.startedAt,
    });

    const sets = (setsBySessionExercise.get(sessionExercise.id) ?? [])
      .sort((a, b) => a.setIndex - b.setIndex)
      .map(toDprSet);
    if (sets.length === 0) continue;

    const routineItem = session.routineId
      ? rangeByRoutineExercise.get(`${session.routineId}:${sessionExercise.exerciseId}`)
      : undefined;
    history.push({
      exerciseId: sessionExercise.exerciseId,
      repRange: resolveRepRange(
        sessionExercise.exerciseId,
        routineItem ?? null,
        routineRanges,
        defaultRange,
      ),
      date: session.startedAt,
      sets,
    });
  }

  let firstSessionAt: Date | null = null;
  for (const session of completed.values()) {
    if (!firstSessionAt || session.startedAt < firstSessionAt) firstSessionAt = session.startedAt;
  }

  return {
    history,
    routineRanges,
    usageRows,
    firstSessionAt,
    completedSessionCount: completed.size,
  };
}

/**
 * RPE-adjusted e1RM per session for one exercise (all rep ranges feed one
 * goal), oldest first. Only sessions where every working set has an RPE
 * count — same eligibility rule as the decision engine.
 */
export function e1rmSeries(history: readonly DprHistoryEntry[], exerciseId: string): E1rmPoint[] {
  const byDate = new Map<number, number>();
  for (const entry of history) {
    if (entry.exerciseId !== exerciseId) continue;
    const working = entry.sets.filter((set) => set.kind === "working" && set.weight && set.reps);
    if (working.length === 0 || working.some((set) => set.rpe === null)) continue;
    const e1rm = sessionE1rm(entry.sets);
    const t = entry.date.getTime();
    byDate.set(t, Math.max(byDate.get(t) ?? 0, e1rm));
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, e1rm]) => ({ date: new Date(t), e1rm }));
}
