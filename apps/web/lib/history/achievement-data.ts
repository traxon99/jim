import { bodyweightOnDate, bodyweightSeries } from "@/lib/bodyweight/series";
import type {
  BodyMeasurementRow,
  ExerciseRow,
  PersonalRecordRow,
  ProgramRoutineRow,
  ProgramRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
  SettingsRow,
} from "@/lib/db/schema";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import {
  type Achievement,
  type AchievementSet,
  type AchievementStrengthRecord,
  type TrainingStreak,
  deletedSessionExerciseIds,
  deriveAchievements,
  isStrengthExercise,
  resolveCurrentRows,
  standardLiftForSlug,
  trainingStreak,
  weeklyStreakTarget,
  withoutDeletedSessionRecords,
} from "@jim/core";

export interface AchievementTables {
  sessions: readonly SessionRow[];
  sessionExercises: readonly SessionExerciseRow[];
  exercises: readonly Pick<ExerciseRow, "id" | "slug" | "equipment" | "category">[];
  sets: readonly SetRow[];
  personalRecords: readonly PersonalRecordRow[];
  programs: readonly ProgramRow[];
  programRoutines: readonly ProgramRoutineRow[];
  /** Weigh-in history, so badges use the bodyweight on each lift's date (issue #247). */
  bodyMeasurements?: readonly BodyMeasurementRow[];
}

export interface AchievementData {
  achievements: Achievement[];
  streak: TrainingStreak;
}

/**
 * Joins Dexie's raw tables into `deriveAchievements`/`trainingStreak`
 * input (issue #253). Only finished, non-deleted workouts count, and only
 * their working sets — warm-up sets and warm-up exercises aren't lifts
 * worth a badge — so deleting a workout simply drops it out of the next read.
 */
export function buildAchievementData(
  tables: AchievementTables,
  settings: SettingsRow,
  now: Date,
): AchievementData {
  const finished = tables.sessions.filter((session) => session.endedAt && !session.deletedAt);
  const finishedIds = new Set(finished.map((session) => session.id));
  const deleted = deletedSessionExerciseIds(tables.sessions, tables.sessionExercises);
  const exerciseById = new Map(tables.exercises.map((exercise) => [exercise.id, exercise]));
  const sessionExerciseById = new Map(tables.sessionExercises.map((se) => [se.id, se]));

  const sets: AchievementSet[] = [];
  for (const set of resolveCurrentRows(tables.sets)) {
    if (set.deletedAt || set.kind === "warmup") continue;
    const sessionExercise = sessionExerciseById.get(set.sessionExerciseId);
    if (!sessionExercise || deleted.has(sessionExercise.id)) continue;
    if (!finishedIds.has(sessionExercise.sessionId)) continue;
    const exercise = exerciseById.get(sessionExercise.exerciseId);
    if (!exercise || !isStrengthExercise(exercise)) continue;
    sets.push({
      sessionId: sessionExercise.sessionId,
      completedAt: set.completedAt,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      barbell: exercise.equipment === "barbell",
    });
  }

  // A PR row points at the set as first logged; map it back to its workout.
  const sessionIdBySetId = new Map<string, string>();
  for (const set of tables.sets) {
    const sessionExercise = sessionExerciseById.get(set.sessionExerciseId);
    if (sessionExercise) sessionIdBySetId.set(set.id, sessionExercise.sessionId);
  }
  const strengthRecords: AchievementStrengthRecord[] = [];
  for (const record of withoutDeletedSessionRecords(
    tables.personalRecords.filter((pr) => !pr.deletedAt && pr.kind === "1rm"),
    tables.sets,
    deleted,
  )) {
    const lift = standardLiftForSlug(exerciseById.get(record.exerciseId)?.slug);
    if (!lift) continue;
    strengthRecords.push({
      lift,
      oneRepMax: Number(record.value),
      achievedAt: record.achievedAt,
      sessionId: record.setId ? (sessionIdBySetId.get(record.setId) ?? null) : null,
    });
  }

  const bodyweight = settings.bodyweight == null ? null : Number(settings.bodyweight);
  const achievements = deriveAchievements({
    workouts: finished.map((session) => ({
      sessionId: session.id,
      endedAt: session.endedAt as Date,
    })),
    sets,
    units: settings.units,
    bodyweight: bodyweight != null && Number.isFinite(bodyweight) ? bodyweight : null,
    strengthProfile: strengthProfileFromSettings(settings, now),
    bodyweightOn: bodyweightOnDate(bodyweightSeries(tables.bodyMeasurements ?? [], settings.units)),
    strengthRecords,
  });

  const activeProgram = tables.programs.find((program) => program.isActive && !program.deletedAt);
  const streakTarget = weeklyStreakTarget(
    activeProgram
      ? {
          mode: activeProgram.mode,
          items: tables.programRoutines.filter((item) => item.programId === activeProgram.id),
        }
      : null,
  );
  const streak = trainingStreak(
    finished.map((session) => session.startedAt),
    streakTarget,
    settings.weekStart,
    now,
  );

  return { achievements, streak };
}
