import { deleteSession, finalizeSession } from "@/lib/sessions/finalize-session";
import { completeSet } from "@/lib/sessions/set-actions";
import { startEmptySession } from "@/lib/sessions/start-session";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import {
  buildTrainingCalendar,
  currentPersonalRecords,
  estimatedOneRepMaxSeries,
  resolveCurrentRows,
  uuidv7,
  weeklyVolumeByMuscle,
} from "@jim/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ExerciseRow,
  type JimDatabase,
  type SessionExerciseRow,
  createTestDb,
} from "../../db/schema";
import { buildAchievementData } from "../achievement-data";
import { buildMuscleVolumeSets } from "../muscle-volume-data";
import { toPersonalRecordEntries } from "../pr-data";
import { buildSessionDetailExercises } from "../session-detail-entries";
import { buildSessionListEntries } from "../session-list-entries";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BENCH_ID = "22222222-2222-2222-2222-222222222222";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-history-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function bench(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: BENCH_ID,
    ownerId: null,
    slug: "barbell-bench-press",
    name: "Barbell Bench Press",
    aliases: [],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps"],
    equipment: "barbell",
    mechanic: "compound",
    force: "push",
    level: "intermediate",
    trackingType: "weight_reps",
    category: "strength",
    instructions: [],
    imageUrls: [],
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId: "device-a",
    serverSeq: 0,
    ...overrides,
  };
}

const NOOP_FETCH = vi
  .fn()
  .mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ results: [], cursor: 0, changes: {} }))),
  );

async function makeSessionExercise(sessionId: string): Promise<SessionExerciseRow> {
  const sessionExercise: SessionExerciseRow = {
    id: uuidv7(),
    userId: USER_ID,
    sessionId,
    exerciseId: BENCH_ID,
    position: 0,
    supersetGroup: null,
    notes: null,
    stickyNote: null,
    restSeconds: null,
    warmupSets: null,
    updatedAt: new Date(),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
  };
  await testDb.sessionExercises.put(sessionExercise);
  return sessionExercise;
}

/** Runs a full session end to end — start, log one set, finalize — and returns its id. */
async function loggedAndFinishedSession(weight: number, reps: number): Promise<string> {
  const sessionId = await startEmptySession(USER_ID, testDb);
  const sessionExercise = await makeSessionExercise(sessionId);
  await completeSet(
    {
      userId: USER_ID,
      sessionExerciseId: sessionExercise.id,
      exerciseId: BENCH_ID,
      setIndex: 0,
      kind: "working",
      weight,
      reps,
    },
    testDb,
  );
  const session = await testDb.sessions.get(sessionId);
  if (!session) throw new Error("session missing");
  await finalizeSession(session, testDb, NOOP_FETCH as unknown as typeof fetch);
  return sessionId;
}

async function achievementsNow() {
  return buildAchievementData(
    {
      sessions: await testDb.sessions.toArray(),
      sessionExercises: await testDb.sessionExercises.toArray(),
      exercises: await testDb.exercises.toArray(),
      sets: await testDb.sets.toArray(),
      personalRecords: await testDb.personalRecords.toArray(),
      programs: await testDb.programs.toArray(),
      programRoutines: await testDb.programRoutines.toArray(),
    },
    { ...DEFAULT_SETTINGS, units: "lb" },
    new Date(),
  );
}

describe("achievements (against Dexie)", () => {
  it("shows nothing before any workout is finished", async () => {
    await testDb.exercises.put(bench());
    const data = await achievementsNow();
    expect(data.achievements).toEqual([]);
    expect(data.streak.current).toBe(0);
  });

  it("derives milestones and the streak from finished workouts, and recalculates on delete", async () => {
    await testDb.exercises.put(bench());
    await loggedAndFinishedSession(95, 5);
    const plateSessionId = await loggedAndFinishedSession(135, 5);

    const before = await achievementsNow();
    const earned = (data: typeof before, id: string) =>
      data.achievements.find((achievement) => achievement.id === id);
    expect(earned(before, "workouts-1")?.achievedAt).not.toBeNull();
    expect(earned(before, "plates-1")?.sessionId).toBe(plateSessionId);
    expect(before.streak).toMatchObject({ current: 1, thisWeek: 2, weeklyTarget: 1 });

    const session = await testDb.sessions.get(plateSessionId);
    if (!session) throw new Error("session missing");
    await deleteSession(session, testDb);

    const after = await achievementsNow();
    expect(earned(after, "plates-1")?.achievedAt).toBeNull();
    expect(after.streak.thisWeek).toBe(1);
  });
});

describe("history read pipeline (against Dexie)", () => {
  it("builds a session list entry with volume, set count and PR count", async () => {
    await testDb.exercises.put(bench());
    const sessionId = await loggedAndFinishedSession(135, 5);

    const entries = buildSessionListEntries(
      await testDb.sessions.toArray(),
      await testDb.sessionExercises.toArray(),
      await testDb.exercises.toArray(),
      await testDb.sets.toArray(),
      await testDb.personalRecords.toArray(),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: sessionId,
      totalVolume: 135 * 5,
      setCount: 1,
      // First-ever set records 1rm, weight and volume PRs, but only e1RM shows
      // outside the PR page (issue #389).
      prCount: 1,
    });
    expect((await testDb.personalRecords.toArray()).map((pr) => pr.kind).sort()).toEqual(
      ["1rm", "volume", "weight"].sort(),
    );
  });

  it("excludes an in-progress (not yet finalized) session from the list", async () => {
    await testDb.exercises.put(bench());
    await startEmptySession(USER_ID, testDb);

    const entries = buildSessionListEntries(
      await testDb.sessions.toArray(),
      await testDb.sessionExercises.toArray(),
      await testDb.exercises.toArray(),
      await testDb.sets.toArray(),
      await testDb.personalRecords.toArray(),
    );
    expect(entries).toEqual([]);
  });

  it("deleting a finished session soft-deletes it and excludes it from the list, leaving its sets untouched", async () => {
    await testDb.exercises.put(bench());
    const sessionId = await loggedAndFinishedSession(135, 5);

    const session = await testDb.sessions.get(sessionId);
    if (!session) throw new Error("session missing");
    await deleteSession(session, testDb);

    const stillThere = await testDb.sessions.get(sessionId);
    expect(stillThere).toBeDefined();
    expect(stillThere?.deletedAt).not.toBeNull();

    const entries = buildSessionListEntries(
      await testDb.sessions.toArray(),
      await testDb.sessionExercises.toArray(),
      await testDb.exercises.toArray(),
      await testDb.sets.toArray(),
      await testDb.personalRecords.toArray(),
    );
    expect(entries).toEqual([]);

    const sets = await testDb.sets.toArray();
    expect(sets.every((set) => !set.deletedAt)).toBe(true);
  });

  it("tags a completed set with only its e1RM PR in the session detail view", async () => {
    await testDb.exercises.put(bench());
    const sessionId = await loggedAndFinishedSession(135, 5);

    const groups = buildSessionDetailExercises(
      sessionId,
      await testDb.sessionExercises.toArray(),
      await testDb.exercises.toArray(),
      await testDb.sets.toArray(),
      await testDb.personalRecords.toArray(),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.exerciseName).toBe("Barbell Bench Press");
    expect(groups[0]?.sets).toHaveLength(1);
    // Weight and volume PRs are recorded too, but only e1RM shows (issue #389).
    expect(groups[0]?.sets[0]?.prKinds).toEqual(["1rm"]);
  });

  it("attributes weekly volume to the exercise's primary and secondary muscles", async () => {
    await testDb.exercises.put(bench());
    await loggedAndFinishedSession(135, 5);

    const volumeSets = buildMuscleVolumeSets(
      await testDb.sessions.toArray(),
      await testDb.sessionExercises.toArray(),
      await testDb.exercises.toArray(),
      await testDb.sets.toArray(),
    );
    const [week] = weeklyVolumeByMuscle(volumeSets, 0);

    expect(week?.volumeByMuscle.chest).toBe(135 * 5);
    expect(week?.volumeByMuscle.triceps).toBe((135 * 5) / 2);
  });

  it("resolves the current PR per exercise and kind from raw personal_records rows", async () => {
    await testDb.exercises.put(bench());
    await loggedAndFinishedSession(135, 5);
    // A second, heavier session beats the 1rm/weight/volume PRs again.
    await loggedAndFinishedSession(185, 5);

    const current = currentPersonalRecords(
      toPersonalRecordEntries(
        await testDb.personalRecords.toArray(),
        await testDb.sessions.toArray(),
        await testDb.sessionExercises.toArray(),
        await testDb.sets.toArray(),
      ),
    );
    const weightPr = current.find((pr) => pr.kind === "weight");
    expect(weightPr?.value).toBe(185);
  });

  it("drops a deleted workout's PRs so the previous best is current again (issue #200)", async () => {
    await testDb.exercises.put(bench());
    await loggedAndFinishedSession(135, 5);
    const heavierSessionId = await loggedAndFinishedSession(185, 5);

    const heavierSession = await testDb.sessions.get(heavierSessionId);
    if (!heavierSession) throw new Error("session missing");
    await deleteSession(heavierSession, testDb);

    const current = currentPersonalRecords(
      toPersonalRecordEntries(
        await testDb.personalRecords.toArray(),
        await testDb.sessions.toArray(),
        await testDb.sessionExercises.toArray(),
        await testDb.sets.toArray(),
      ),
    );
    expect(current.find((pr) => pr.kind === "weight")?.value).toBe(135);
  });

  it("doesn't make a new set beat a deleted workout's sets to count as a PR (issue #200)", async () => {
    await testDb.exercises.put(bench());
    const deletedSessionId = await loggedAndFinishedSession(225, 5);
    const deletedSession = await testDb.sessions.get(deletedSessionId);
    if (!deletedSession) throw new Error("session missing");
    await deleteSession(deletedSession, testDb);

    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId);
    const { prs } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );

    expect(prs.map((pr) => pr.kind).sort()).toEqual(["1rm", "volume", "weight"].sort());
  });

  it("leaves a deleted workout's sets out of weekly muscle volume (issue #200)", async () => {
    await testDb.exercises.put(bench());
    await loggedAndFinishedSession(135, 5);
    const deletedSessionId = await loggedAndFinishedSession(185, 5);

    const deletedSession = await testDb.sessions.get(deletedSessionId);
    if (!deletedSession) throw new Error("session missing");
    await deleteSession(deletedSession, testDb);

    const volumeSets = buildMuscleVolumeSets(
      await testDb.sessions.toArray(),
      await testDb.sessionExercises.toArray(),
      await testDb.exercises.toArray(),
      await testDb.sets.toArray(),
    );
    const [week] = weeklyVolumeByMuscle(volumeSets, 0);
    expect(week?.volumeByMuscle.chest).toBe(135 * 5);
  });

  it("plots one estimated-1RM point per session and marks each training day on the calendar", async () => {
    await testDb.exercises.put(bench());
    const sessionId = await loggedAndFinishedSession(135, 5);

    const sessionExercises = await testDb.sessionExercises.toArray();
    const sessionIdBySessionExerciseId = new Map(
      sessionExercises.map((se) => [se.id, se.sessionId]),
    );
    const resolvedSets = resolveCurrentRows(await testDb.sets.toArray()).filter(
      (set) => !set.deletedAt,
    );

    const points = estimatedOneRepMaxSeries(
      resolvedSets.map((set) => ({
        sessionId: sessionIdBySessionExerciseId.get(set.sessionExerciseId) ?? set.sessionExerciseId,
        completedAt: set.completedAt,
        weight: set.weight == null ? null : Number(set.weight),
        reps: set.reps,
      })),
    );
    expect(points).toHaveLength(1);
    expect(points[0]?.sessionId).toBe(sessionId);

    const entries = buildSessionListEntries(
      await testDb.sessions.toArray(),
      await testDb.sessionExercises.toArray(),
      await testDb.exercises.toArray(),
      await testDb.sets.toArray(),
      await testDb.personalRecords.toArray(),
    );
    const calendar = buildTrainingCalendar(entries);
    expect(calendar.size).toBe(1);
    expect([...calendar.values()][0]?.totalVolume).toBe(135 * 5);
  });
});
