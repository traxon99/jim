import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ExerciseRow, type JimDatabase, type SetRow, createTestDb } from "../../db/schema";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { buildJsonExport, buildStrongCsvExport } from "../export";
import { commitWorkoutImport, previewWorkoutImport, suggestExercise } from "../import";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const STRONG = [
  "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
  "2024-01-15 07:05:12,Push Day,1h,Bench Press (Barbell),W,60,10,0,0,,,",
  "2024-01-15 07:05:12,Push Day,1h,Bench Press (Barbell),1,100,5,0,0,,,8",
  "2024-01-15 07:05:12,Push Day,1h,Bench Press (Barbell),2,100,6,0,0,,,9",
  "2024-01-15 07:05:12,Push Day,1h,Zercher Carry,1,50,0,20,0,,,",
  "2024-01-17 18:00:00,Push Day,45m,Bench Press (Barbell),1,105,5,0,0,,Heavy,",
].join("\n");

function catalogExercise(
  overrides: Partial<ExerciseRow> & { id: string; name: string },
): ExerciseRow {
  return {
    ownerId: null,
    slug: overrides.id,
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: null,
    mechanic: null,
    force: null,
    level: null,
    trackingType: "weight_reps",
    category: "strength",
    instructions: [],
    imageUrls: [],
    isArchived: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deviceId: "",
    serverSeq: 1,
    ...overrides,
  };
}

let testDb: JimDatabase;

beforeEach(async () => {
  testDb = createTestDb(`jim-data-transfer-test-${crypto.randomUUID()}`);
  await testDb.exercises.bulkPut([
    catalogExercise({
      id: "bench",
      name: "Barbell Bench Press - Medium Grip",
      aliases: ["bench press"],
    }),
    catalogExercise({ id: "squat", name: "Barbell Squat" }),
  ]);
  await testDb.settings.put({ ...DEFAULT_SETTINGS, units: "lb" });
});

afterEach(async () => {
  await testDb.delete();
});

async function sessionsByStart() {
  return (await testDb.sessions.toArray()).sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );
}

async function importFile(text: string, fileUnit: "kg" | "lb" = "kg") {
  const preview = await previewWorkoutImport(text, USER_ID, testDb);
  const mapping = Object.fromEntries(
    preview.exercises.map((exercise) => [exercise.name, exercise.suggestedExerciseId]),
  );
  const result = await commitWorkoutImport(
    { userId: USER_ID, workouts: preview.workouts, mapping, fileUnit },
    testDb,
  );
  return { preview, result };
}

describe("previewWorkoutImport", () => {
  it("summarises the file and suggests catalog matches", async () => {
    const preview = await previewWorkoutImport(STRONG, USER_ID, testDb);
    expect(preview.format).toBe("strong");
    expect(preview.workouts).toHaveLength(2);
    expect(preview.setCount).toBe(5);
    expect(preview.needsUnit).toBe(true);
    expect(preview.duplicateCount).toBe(0);
    expect(preview.firstDate).toEqual(new Date(2024, 0, 15, 7, 5, 12));
    expect(preview.exercises).toEqual([
      { name: "Bench Press (Barbell)", setCount: 4, suggestedExerciseId: "bench" },
      { name: "Zercher Carry", setCount: 1, suggestedExerciseId: null },
    ]);
  });

  it("suggests by exact alias before fuzzy search", async () => {
    const catalog = await testDb.exercises.toArray();
    expect(suggestExercise(catalog, "Squat (Barbell)")?.id).toBe("squat");
    expect(suggestExercise(catalog, "Bench Press")?.id).toBe("bench");
  });
});

describe("commitWorkoutImport", () => {
  it("writes sessions, sets and custom exercises through the outbox, parents first", async () => {
    const { result } = await importFile(STRONG);
    expect(result).toMatchObject({
      sessions: 2,
      sets: 5,
      createdExercises: 1,
      skippedDuplicates: 0,
    });

    const sessions = await sessionsByStart();
    expect(sessions.map((s) => s.startedAt)).toEqual([
      new Date(2024, 0, 15, 7, 5, 12),
      new Date(2024, 0, 17, 18, 0, 0),
    ]);
    expect(sessions[0]?.endedAt).toEqual(new Date(2024, 0, 15, 8, 5, 12));
    expect(sessions[1]?.notes).toBe("Heavy");

    const custom = await testDb.exercises.where("ownerId").equals(USER_ID).toArray();
    expect(custom).toMatchObject([{ name: "Zercher Carry", trackingType: "weight_reps" }]);

    // Every written row is queued, and each row's parent is queued before it.
    const outbox = await testDb.outbox.orderBy("id").toArray();
    const queued = new Set<string>();
    for (const entry of outbox) {
      const entity = entry.entity as {
        id: string;
        sessionId?: string;
        sessionExerciseId?: string;
        exerciseId?: string;
      };
      for (const parent of [entity.sessionId, entity.sessionExerciseId]) {
        if (parent) expect(queued.has(parent)).toBe(true);
      }
      if (entity.exerciseId && entity.exerciseId !== "bench") {
        expect(queued.has(entity.exerciseId)).toBe(true);
      }
      queued.add(entity.id);
    }
    expect(outbox.filter((entry) => entry.table === "sets")).toHaveLength(5);
  });

  it("converts the file's weights into the user's units and keeps set kinds and RPE", async () => {
    await importFile(STRONG, "kg");
    const sets = (await testDb.sets.toArray()).sort(
      (a, b) => a.completedAt.getTime() - b.completedAt.getTime(),
    );
    expect(sets.slice(0, 3).map((s) => [s.kind, s.weight, s.reps, s.rpe])).toEqual([
      ["warmup", "132.28", 10, null],
      ["working", "220.46", 5, "8"],
      ["working", "220.46", 6, "9"],
    ]);
    const carry = sets.find((s) => s.distance != null);
    expect(carry?.distance).toBe("20");
    // Sets are spread over the workout's recorded hour, in order.
    expect(sets[3]?.completedAt).toEqual(new Date(2024, 0, 15, 8, 5, 12));
  });

  it("records the PRs the imported history sets, in date order", async () => {
    const { result } = await importFile(STRONG, "lb");
    const prs = await testDb.personalRecords.toArray();
    expect(result.personalRecords).toBe(prs.length);
    const weightPrs = prs
      .filter((pr) => pr.exerciseId === "bench" && pr.kind === "weight")
      .map((pr) => Number(pr.value))
      .sort((a, b) => a - b);
    expect(weightPrs).toEqual([60, 100, 105]);
  });

  it("adds nothing when the same file is imported again", async () => {
    await importFile(STRONG);
    const counts = async () => [await testDb.sessions.count(), await testDb.sets.count()];
    const before = await counts();

    const { preview, result } = await importFile(STRONG);
    expect(preview.duplicateCount).toBe(2);
    expect(preview.workouts).toHaveLength(0);
    expect(result.sessions).toBe(0);
    expect(await counts()).toEqual(before);
  });
});

describe("export", () => {
  it("leaves out deleted workouts and superseded or deleted sets", async () => {
    await importFile(STRONG, "lb");
    const [first, second] = await sessionsByStart();
    if (!first || !second) throw new Error("expected two sessions");
    await testDb.sessions.put({ ...second, deletedAt: new Date() });

    const items = await testDb.sessionExercises.where("sessionId").equals(first.id).toArray();
    const benchItem = items.find((item) => item.exerciseId === "bench");
    const benchSets = (await testDb.sets.toArray())
      .filter((set) => set.sessionExerciseId === benchItem?.id)
      .sort((a, b) => a.setIndex - b.setIndex);
    const [warmup, top] = benchSets as [SetRow, SetRow];
    await testDb.sets.bulkPut([
      { ...warmup, id: crypto.randomUUID(), supersedesId: warmup.id, deletedAt: new Date() },
      { ...top, id: crypto.randomUUID(), supersedesId: top.id, weight: "102.5" },
    ]);

    const csv = await buildStrongCsvExport(testDb);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
    );
    expect(lines.slice(1)).toEqual([
      "2024-01-15 07:05:12,Push Day,1h,Barbell Bench Press - Medium Grip,1,102.5,5,0,0,,,8",
      "2024-01-15 07:05:12,Push Day,1h,Barbell Bench Press - Medium Grip,2,100,6,0,0,,,9",
      "2024-01-15 07:05:12,Push Day,1h,Zercher Carry,1,50,0,20,0,,,",
    ]);

    const json = JSON.parse(await buildJsonExport(testDb));
    expect(json.app).toBe("jim");
    expect(json.sessions).toHaveLength(1);
    expect(json.sets).toHaveLength(3);
    expect(json.sets[0]).not.toHaveProperty("serverSeq");
    expect(json.customExercises.map((e: ExerciseRow) => e.name)).toEqual(["Zercher Carry"]);
    expect(json.settings.units).toBe("lb");
    expect(
      json.sessionExercises.map((item: { exerciseName: string }) => item.exerciseName),
    ).toEqual(expect.arrayContaining(["Barbell Bench Press - Medium Grip", "Zercher Carry"]));
  });

  it("round-trips through the Strong import", async () => {
    await importFile(STRONG, "lb");
    const csv = await buildStrongCsvExport(testDb);

    // Into the same account: everything is already there.
    const again = await previewWorkoutImport(csv, USER_ID, testDb);
    expect(again.workouts).toHaveLength(0);
    expect(again.duplicateCount).toBe(2);

    // Into a fresh one: the same workouts and sets come back.
    const fresh = createTestDb(`jim-data-transfer-fresh-${crypto.randomUUID()}`);
    try {
      await fresh.exercises.bulkPut(await testDb.exercises.toArray());
      await fresh.settings.put({ ...DEFAULT_SETTINGS, units: "lb" });
      const preview = await previewWorkoutImport(csv, USER_ID, fresh);
      expect(preview.workouts).toHaveLength(2);
      expect(preview.setCount).toBe(5);
      expect(preview.exercises.map((e) => e.suggestedExerciseId)).not.toContain(null);
      const mapping = Object.fromEntries(
        preview.exercises.map((e) => [e.name, e.suggestedExerciseId]),
      );
      await commitWorkoutImport(
        { userId: USER_ID, workouts: preview.workouts, mapping, fileUnit: "lb" },
        fresh,
      );
      const weights = (await fresh.sets.toArray()).map((s) => s.weight).sort();
      const original = (await testDb.sets.toArray()).map((s) => s.weight).sort();
      expect(weights).toEqual(original);
    } finally {
      await fresh.delete();
    }
  });
});
