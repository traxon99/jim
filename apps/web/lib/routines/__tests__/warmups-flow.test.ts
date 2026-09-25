import { buildMuscleVolumeSets } from "@/lib/history/muscle-volume-data";
import { completeSet } from "@/lib/sessions/set-actions";
import { startSessionFromRoutine } from "@/lib/sessions/start-session";
import { WARMUP_TEMPLATES, uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ExerciseRow,
  type JimDatabase,
  type RoutineExerciseRow,
  type RoutineRow,
  createTestDb,
} from "../../db/schema";
import { addWarmupTemplate } from "../warmup-templates";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-warmups-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function exercise(overrides: Partial<ExerciseRow> & { id: string; slug: string }): ExerciseRow {
  return {
    ownerId: null,
    name: overrides.slug,
    aliases: [],
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: [],
    equipment: "body only",
    mechanic: null,
    force: null,
    level: null,
    trackingType: "weight_reps",
    category: "strength",
    instructions: [],
    imageUrls: [],
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId: "",
    serverSeq: 0,
    ...overrides,
  };
}

function routine(overrides: Partial<RoutineRow> & { id: string }): RoutineRow {
  return {
    userId: USER_ID,
    name: "Routine",
    notes: null,
    position: 0,
    folder: null,
    kind: "strength",
    warmupRoutineId: null,
    warmupMinutes: null,
    iconShape: "square",
    iconColor: "blue",
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

function routineExercise(
  overrides: Partial<RoutineExerciseRow> & { routineId: string; exerciseId: string },
): RoutineExerciseRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    position: 0,
    supersetGroup: null,
    targetSets: null,
    targetRepsLow: null,
    targetRepsHigh: null,
    targetRestSeconds: null,
    targetDurationSeconds: null,
    targetWeight: null,
    progressionIncrement: null,
    progressionStartedAt: null,
    notes: null,
    updatedAt: new Date(),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

describe("adding a warm-up template (against Dexie)", () => {
  it("creates a user-owned warm-up routine from the global catalog, skipping stretches not synced yet", async () => {
    const template = WARMUP_TEMPLATES.find((t) => t.key === "legs");
    if (!template) throw new Error("legs template missing");
    const [first, second, ...rest] = template.items;
    await testDb.exercises.bulkPut([
      exercise({ id: "ex-1", slug: first.slug, category: "warmup" }),
      exercise({ id: "ex-2", slug: second.slug, category: "warmup" }),
      // A user's own clone of a slug must not be picked over the global row.
      exercise({ id: "clone", slug: rest[0].slug, ownerId: USER_ID, category: "warmup" }),
    ]);

    const { routineId, missingSlugs } = await addWarmupTemplate(USER_ID, template, testDb);

    const created = await testDb.routines.get(routineId);
    expect(created).toMatchObject({
      name: template.name,
      kind: "warmup",
      warmupMinutes: template.minutes,
      userId: USER_ID,
    });
    const items = (await testDb.routineExercises.where("routineId").equals(routineId).toArray())
      .sort((a, b) => a.position - b.position)
      .map((item) => [item.exerciseId, item.position, item.targetSets]);
    expect(items).toEqual([
      ["ex-1", 0, first.sets],
      ["ex-2", 1, second.sets],
    ]);
    expect(missingSlugs).toEqual(rest.map((item) => item.slug));

    const outboxTables = (await testDb.outbox.toArray()).map((entry) => entry.table);
    expect(outboxTables[0]).toBe("routines");
    expect(outboxTables.filter((t) => t === "routineExercises")).toHaveLength(2);
  });
});

describe("starting a routine with a warm-up (against Dexie)", () => {
  it("prepends the linked warm-up routine and groups the routine's own warm-ups before the lifts", async () => {
    await testDb.exercises.bulkPut([
      exercise({ id: "squat", slug: "squat" }),
      exercise({ id: "hip-circles", slug: "hip-circles", category: "warmup" }),
      exercise({ id: "pigeon", slug: "pigeon", category: "warmup", trackingType: "time" }),
      exercise({ id: "calf", slug: "calf", category: "warmup", trackingType: "time" }),
    ]);
    await testDb.routines.bulkPut([
      routine({ id: "warm", kind: "warmup", name: "Leg warm-up" }),
      routine({ id: "legs", name: "Leg day", warmupRoutineId: "warm" }),
    ]);
    const warmupItems = [
      routineExercise({ routineId: "warm", exerciseId: "pigeon", position: 1 }),
      routineExercise({ routineId: "warm", exerciseId: "hip-circles", position: 0 }),
    ];
    await testDb.routineExercises.bulkPut(warmupItems);
    const legItems = [
      routineExercise({ routineId: "legs", exerciseId: "squat", position: 0 }),
      routineExercise({ routineId: "legs", exerciseId: "calf", position: 1 }),
    ];

    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: "legs", name: "Leg day", warmupRoutineId: "warm" },
      legItems,
      testDb,
    );

    const order = (await testDb.sessionExercises.where("sessionId").equals(sessionId).toArray())
      .sort((a, b) => a.position - b.position)
      .map((se) => se.exerciseId);
    expect(order).toEqual(["hip-circles", "pigeon", "calf", "squat"]);
  });

  it("ignores a linked warm-up routine that has since been deleted", async () => {
    await testDb.exercises.bulkPut([
      exercise({ id: "squat", slug: "squat" }),
      exercise({ id: "pigeon", slug: "pigeon", category: "warmup" }),
    ]);
    await testDb.routines.put(routine({ id: "warm", kind: "warmup", deletedAt: new Date() }));
    await testDb.routineExercises.put(routineExercise({ routineId: "warm", exerciseId: "pigeon" }));

    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: "legs", name: "Leg day", warmupRoutineId: "warm" },
      [routineExercise({ routineId: "legs", exerciseId: "squat" })],
      testDb,
    );

    const exerciseIds = (
      await testDb.sessionExercises.where("sessionId").equals(sessionId).toArray()
    ).map((se) => se.exerciseId);
    expect(exerciseIds).toEqual(["squat"]);
  });
});

describe("logging warm-ups (against Dexie)", () => {
  it("records a held time and never produces a PR", async () => {
    await testDb.exercises.put(
      exercise({ id: "pigeon", slug: "pigeon", category: "warmup", trackingType: "time" }),
    );

    const { set, prs } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: "se-1",
        exerciseId: "pigeon",
        setIndex: 0,
        kind: "warmup",
        weight: null,
        reps: null,
        durationSeconds: 30,
      },
      testDb,
    );

    expect(set.durationSeconds).toBe(30);
    expect(prs).toEqual([]);
    expect(await testDb.personalRecords.count()).toBe(0);
  });

  it("leaves warm-ups out of muscle volume", () => {
    const when = new Date();
    const sets = buildMuscleVolumeSets(
      [],
      [
        {
          id: "se-lift",
          userId: USER_ID,
          sessionId: "s",
          exerciseId: "squat",
          position: 1,
          supersetGroup: null,
          notes: null,
          updatedAt: when,
          deviceId: "d",
          deletedAt: null,
          serverSeq: 0,
        },
        {
          id: "se-warm",
          userId: USER_ID,
          sessionId: "s",
          exerciseId: "squats-warm",
          position: 0,
          supersetGroup: null,
          notes: null,
          updatedAt: when,
          deviceId: "d",
          deletedAt: null,
          serverSeq: 0,
        },
      ],
      [
        exercise({ id: "squat", slug: "squat" }),
        exercise({ id: "squats-warm", slug: "bw-squat", category: "warmup" }),
      ],
      ["se-lift", "se-warm"].map((sessionExerciseId, i) => ({
        id: `set-${i}`,
        userId: USER_ID,
        sessionExerciseId,
        setIndex: 0,
        kind: "working" as const,
        weight: "100",
        reps: 5,
        durationSeconds: null,
        distance: null,
        rpe: null,
        rir: null,
        completedAt: when,
        supersedesId: null,
        deletedAt: null,
        serverSeq: 0,
      })),
    );

    expect(sets).toHaveLength(1);
  });
});
