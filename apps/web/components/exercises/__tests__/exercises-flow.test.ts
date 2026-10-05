import {
  type CatalogExercise,
  applyExerciseEdit,
  buildExerciseUsage,
  filterExercises,
  preferOwnedExercises,
  resolveCurrentRows,
  searchExercises,
  sortExercisesByUsage,
  uuidv7,
} from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mutate } from "../../../lib/db/mutate";
import {
  type ExerciseRow,
  type SessionExerciseRow,
  type SessionRow,
  type SetRow,
  createTestDb,
} from "../../../lib/db/schema";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: ReturnType<typeof createTestDb>;

beforeEach(() => {
  testDb = createTestDb(`jim-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function exercise(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: uuidv7(),
    ownerId: null,
    slug: "barbell-bench-press-medium-grip",
    name: "Barbell Bench Press - Medium Grip",
    aliases: ["bench press", "bench"],
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
    videoUrl: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId: "device-a",
    serverSeq: 0,
    ...overrides,
  };
}

/** Mirrors exercises-list.tsx's read pipeline: live query -> dedupe -> filter -> search. */
function runListPipeline(rows: CatalogExercise[], userId: string, query: string) {
  const owned = preferOwnedExercises(rows, userId);
  const filtered = filterExercises(owned, {});
  return searchExercises(filtered, query);
}

describe("exercises list read pipeline (against Dexie)", () => {
  it("ranks a synced global exercise the same way the component's pipeline would", async () => {
    await mutate("exercises", exercise(), testDb);

    const rows = await testDb.exercises.toArray();
    const results = runListPipeline(rows, USER_ID, "bench");

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Barbell Bench Press - Medium Grip");
  });

  it("prefers a user's own clone over the global row it was cloned from, after both land in Dexie", async () => {
    const global = exercise();
    await mutate("exercises", global, testDb);

    // Copy-on-write clone (ADR-008), as exercise-form.tsx would produce it.
    const { action, entity: cloned } = applyExerciseEdit(
      global,
      { name: "My Bench Variant" },
      USER_ID,
      uuidv7,
    );
    expect(action).toBe("clone");
    await mutate("exercises", { ...cloned, deviceId: "device-a" } as ExerciseRow, testDb);

    const rows = await testDb.exercises.toArray();
    expect(rows).toHaveLength(2);

    const results = runListPipeline(rows, USER_ID, "");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("My Bench Variant");
    expect(results[0]?.ownerId).toBe(USER_ID);
  });

  it("a custom exercise created offline is immediately visible in the local pipeline, with no network", async () => {
    const custom = exercise({
      id: uuidv7(),
      ownerId: USER_ID,
      slug: "my-custom-curl",
      name: "My Custom Curl",
      aliases: [],
      primaryMuscles: ["biceps"],
    });
    await mutate("exercises", custom, testDb);

    const rows = await testDb.exercises.toArray();
    const results = runListPipeline(rows, USER_ID, "curl");
    expect(results.map((r) => r.name)).toEqual(["My Custom Curl"]);

    const outbox = await testDb.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "exercises", entity: { id: custom.id } });
  });
});

function sessionExercise(overrides: Partial<SessionExerciseRow> = {}): SessionExerciseRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    sessionId: uuidv7(),
    exerciseId: uuidv7(),
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
    ...overrides,
  };
}

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    routineId: null,
    name: null,
    startedAt: new Date(),
    endedAt: new Date(),
    notes: null,
    bodyweight: null,
    intensity: null,
    deviceId: "device-a",
    updatedAt: new Date(),
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

/** Mirrors exercises-list.tsx's usageRows live query. */
async function loadUsageRows(db: ReturnType<typeof createTestDb>) {
  const sessionExercises = (await db.sessionExercises.toArray()).filter((se) => !se.deletedAt);
  if (sessionExercises.length === 0) return [];

  const sessionIds = [...new Set(sessionExercises.map((se) => se.sessionId))];
  const sessions = await db.sessions.bulkGet(sessionIds);
  const sessionById = new Map(sessions.filter((s) => s != null).map((s) => [s.id, s]));

  return sessionExercises.flatMap((se) => {
    const found = sessionById.get(se.sessionId);
    if (!found || found.deletedAt) return [];
    return [{ exerciseId: se.exerciseId, sessionId: se.sessionId, startedAt: found.startedAt }];
  });
}

describe("exercises list frequency + ordering (against Dexie)", () => {
  it("shows how many sessions trained each exercise and orders by frequency", async () => {
    const bench = exercise({ id: uuidv7(), slug: "bench", name: "Bench Press" });
    const squat = exercise({ id: uuidv7(), slug: "squat", name: "Squat" });
    await mutate("exercises", bench, testDb);
    await mutate("exercises", squat, testDb);

    // Bench trained in two sessions, squat in one.
    const s1 = session({ startedAt: new Date("2026-01-01") });
    const s2 = session({ startedAt: new Date("2026-01-08") });
    await testDb.sessions.bulkAdd([s1, s2]);
    await testDb.sessionExercises.bulkAdd([
      sessionExercise({ sessionId: s1.id, exerciseId: bench.id }),
      sessionExercise({ sessionId: s2.id, exerciseId: bench.id }),
      sessionExercise({ sessionId: s1.id, exerciseId: squat.id }),
    ]);

    const rows = await testDb.exercises.toArray();
    const usageRows = await loadUsageRows(testDb);
    const usage = buildExerciseUsage(usageRows);

    expect(usage.get(bench.id)).toEqual({ lastPerformedAt: s2.startedAt, frequency: 2 });
    expect(usage.get(squat.id)).toEqual({ lastPerformedAt: s1.startedAt, frequency: 1 });

    const owned = preferOwnedExercises(rows, USER_ID);
    const sorted = sortExercisesByUsage(owned, usage, "frequency");
    expect(sorted.map((e) => e.name)).toEqual(["Bench Press", "Squat"]);
  });

  it("leaves a never-performed exercise out of usage and last in lastPerformed order", async () => {
    const bench = exercise({ id: uuidv7(), slug: "bench", name: "Bench Press" });
    const curl = exercise({ id: uuidv7(), slug: "curl", name: "Curl" });
    await mutate("exercises", bench, testDb);
    await mutate("exercises", curl, testDb);

    const s1 = session({ startedAt: new Date("2026-01-01") });
    await testDb.sessions.add(s1);
    await testDb.sessionExercises.add(sessionExercise({ sessionId: s1.id, exerciseId: bench.id }));

    const rows = await testDb.exercises.toArray();
    const usage = buildExerciseUsage(await loadUsageRows(testDb));
    expect(usage.has(curl.id)).toBe(false);

    const owned = preferOwnedExercises(rows, USER_ID);
    const sorted = sortExercisesByUsage(owned, usage, "lastPerformed");
    expect(sorted.map((e) => e.name)).toEqual(["Bench Press", "Curl"]);
  });
});

function set(overrides: Partial<SetRow> = {}): SetRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    sessionExerciseId: uuidv7(),
    setIndex: 0,
    kind: "working",
    weight: "135.00",
    reps: 8,
    durationSeconds: null,
    distance: null,
    rpe: null,
    rir: null,
    restSeconds: null,
    restTargetSeconds: null,
    completedAt: new Date(),
    supersedesId: null,
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

/** Mirrors exercise-detail.tsx's "your history" query. */
async function loadHistory(db: ReturnType<typeof createTestDb>, exerciseId: string) {
  const relatedSessionExercises = await db.sessionExercises
    .where("exerciseId")
    .equals(exerciseId)
    .toArray();
  const sessionExerciseIds = relatedSessionExercises.map((se) => se.id);
  if (sessionExerciseIds.length === 0) return [];

  const allSets = await db.sets.where("sessionExerciseId").anyOf(sessionExerciseIds).toArray();
  return resolveCurrentRows(allSets)
    .filter((s) => !s.deletedAt)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
}

describe("exercise detail history query (against Dexie)", () => {
  it("resolves only the current (non-superseded) set for an exercise's history", async () => {
    const exerciseId = uuidv7();
    const se = sessionExercise({ exerciseId });
    await testDb.sessionExercises.add(se);

    const original = set({ sessionExerciseId: se.id, weight: "135.00", reps: 8 });
    await testDb.sets.add(original);
    const correction = set({
      sessionExerciseId: se.id,
      weight: "140.00",
      reps: 8,
      supersedesId: original.id,
    });
    await testDb.sets.add(correction);

    const history = await loadHistory(testDb, exerciseId);
    expect(history).toHaveLength(1);
    expect(history[0]?.weight).toBe("140.00");
  });

  it("is empty for an exercise with no logged sets", async () => {
    const history = await loadHistory(testDb, uuidv7());
    expect(history).toEqual([]);
  });
});
