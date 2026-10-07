import {
  FIVE_BY_FIVE,
  PROGRAM_TEMPLATES,
  PUSH_PULL_LEGS,
  type RoutineTemplate,
  routineTemplateSlugs,
} from "@jim/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ExerciseRow, type JimDatabase, createTestDb } from "../../db/schema";
import { addExploreProgram, addProgramTemplate, addRoutineTemplate } from "../add-template";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-explore-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function exercise(slug: string, ownerId: string | null = null): ExerciseRow {
  return {
    id: `ex-${slug}${ownerId ? "-clone" : ""}`,
    ownerId,
    slug,
    name: slug,
    aliases: [],
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: [],
    equipment: "body only",
    mechanic: null,
    force: null,
    level: null,
    trackingType: "weight_reps",
    category: slug.startsWith("warmup-") ? "warmup" : "strength",
    instructions: [],
    imageUrls: [],
    videoUrl: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId: "",
    serverSeq: 0,
  };
}

/** Every slug any Explore template references, seeded as a global row. */
async function seedAllTemplateSlugs() {
  const slugs = new Set([
    ...PROGRAM_TEMPLATES.flatMap((p) => [
      ...p.days.flatMap((d) => routineTemplateSlugs(d.routine)),
      ...p.extraRoutines.flatMap(routineTemplateSlugs),
      ...p.warmups.flatMap((w) => w.items.map((i) => i.slug)),
    ]),
  ]);
  await testDb.exercises.bulkPut([...slugs].map((slug) => exercise(slug)));
}

const WITH_WARMUP: RoutineTemplate = {
  key: "test-legs",
  name: "Test Legs",
  notes: "n",
  warmup: {
    key: "test-legs-warmup",
    name: "Test Legs Warm-up",
    notes: "w",
    minutes: 5,
    items: [{ slug: "warmup-sumo-squat", sets: 1, reps: 10 }],
  },
  items: [
    { slug: "barbell-squat", sets: 3, reps: 5, superset: 1 },
    { slug: "leg-extensions", sets: 3, reps: 8, repsHigh: 12, superset: 1 },
    { slug: "lying-leg-curls", sets: 3, reps: 10 },
  ],
};

describe("addRoutineTemplate (against Dexie)", () => {
  it("creates the routine, its linked warm-up, and keeps supersets/rep ranges/notes", async () => {
    await testDb.exercises.bulkPut(routineTemplateSlugs(WITH_WARMUP).map((s) => exercise(s)));

    const { routineId, missingSlugs } = await addRoutineTemplate(
      USER_ID,
      WITH_WARMUP,
      { folder: "Split" },
      testDb,
    );
    expect(missingSlugs).toEqual([]);

    const routine = await testDb.routines.get(routineId);
    expect(routine).toMatchObject({ name: "Test Legs", kind: "strength", folder: "Split" });
    const warmup = await testDb.routines.get(routine?.warmupRoutineId ?? "");
    expect(warmup).toMatchObject({ name: "Test Legs Warm-up", kind: "warmup" });

    const items = (
      await testDb.routineExercises.where("routineId").equals(routineId).toArray()
    ).sort((a, b) => a.position - b.position);
    expect(items.map((i) => i.exerciseId)).toEqual(WITH_WARMUP.items.map((i) => `ex-${i.slug}`));
    expect(items[0].supersetGroup).toBe(1);
    expect(items[1]).toMatchObject({ targetRepsLow: 8, targetRepsHigh: 12, targetSets: 3 });
  });

  it("skips and reports exercises not synced to this device, ignoring user clones", async () => {
    const template = PUSH_PULL_LEGS.days[0].routine;
    await testDb.exercises.bulkPut([
      exercise(template.items[0].slug),
      exercise(template.items[1].slug, USER_ID),
    ]);

    const { routineId, missingSlugs } = await addRoutineTemplate(USER_ID, template, {}, testDb);
    expect(missingSlugs).toEqual(template.items.slice(1).map((i) => i.slug));
    expect(await testDb.routineExercises.where("routineId").equals(routineId).count()).toBe(1);
  });
});

describe("addProgramTemplate (against Dexie)", () => {
  it("adds a weekly program with each day on its weekday", async () => {
    await seedAllTemplateSlugs();

    const { programId, missingSlugs } = await addProgramTemplate(USER_ID, PUSH_PULL_LEGS, testDb);
    expect(missingSlugs).toEqual([]);

    const program = await testDb.programs.get(programId);
    expect(program).toMatchObject({ name: "Push / Pull / Legs", mode: "weekly", isActive: false });

    const entries = (
      await testDb.programRoutines.where("programId").equals(programId).toArray()
    ).sort((a, b) => a.position - b.position);
    const routines = await testDb.routines.bulkGet(entries.map((e) => e.routineId ?? ""));
    expect(entries.map((e, i) => [e.weekday, routines[i]?.name])).toEqual(
      PUSH_PULL_LEGS.days.map((d) => [d.weekday, d.routine.name]),
    );
    const all = await testDb.routines.toArray();
    expect(all).toHaveLength(6);
    expect(new Set(all.map((r) => r.folder))).toEqual(new Set(["Push / Pull / Legs"]));
  });

  it("adds a sequence program in order with no weekdays", async () => {
    await seedAllTemplateSlugs();

    const { programId } = await addProgramTemplate(USER_ID, FIVE_BY_FIVE, testDb);
    expect(await testDb.programs.get(programId)).toMatchObject({ mode: "sequence" });
    const entries = (
      await testDb.programRoutines.where("programId").equals(programId).toArray()
    ).sort((a, b) => a.position - b.position);
    const routines = await testDb.routines.bulkGet(entries.map((e) => e.routineId ?? ""));
    expect(entries.map((e, i) => [e.weekday, routines[i]?.name])).toEqual([
      [null, "5×5 Workout A"],
      [null, "5×5 Workout B"],
    ]);
  });
});

describe("addExploreProgram (against Dexie)", () => {
  it("can make the program active and start PRP at the program's preset", async () => {
    await seedAllTemplateSlugs();
    const patch = vi.fn(async () => ({ ok: true as const }));

    const result = await addExploreProgram(
      USER_ID,
      FIVE_BY_FIVE,
      { activate: true, startDpr: true },
      testDb,
      patch,
    );

    expect(result.dprError).toBeNull();
    expect(await testDb.programs.get(result.programId)).toMatchObject({ isActive: true });
    const [block] = await testDb.dprBlocks.toArray();
    expect(block).toMatchObject({
      programId: result.programId,
      status: "active",
      aggressiveness: "aggressive",
      experience: "novice",
    });
    const lifts = await testDb.dprBlockLifts.toArray();
    expect(lifts.map((l) => l.exerciseId).sort()).toEqual(
      FIVE_BY_FIVE.info.dpr?.focusSlugs.map((s) => `ex-${s}`).sort(),
    );
    expect(patch).toHaveBeenCalledWith(
      { dprEnabled: true, dprExperience: "novice", dprAggressiveness: "aggressive" },
      testDb,
    );
  });

  it("leaves the active program and PRP alone when both are switched off", async () => {
    await seedAllTemplateSlugs();
    const patch = vi.fn(async () => ({ ok: true as const }));

    const result = await addExploreProgram(
      USER_ID,
      PUSH_PULL_LEGS,
      { activate: false, startDpr: false },
      testDb,
      patch,
    );

    expect(await testDb.programs.get(result.programId)).toMatchObject({ isActive: false });
    expect(await testDb.dprBlocks.count()).toBe(0);
    expect(patch).not.toHaveBeenCalled();
  });

  it("doesn't start a second PRP block", async () => {
    await seedAllTemplateSlugs();
    const patch = vi.fn(async () => ({ ok: true as const }));
    await addExploreProgram(
      USER_ID,
      FIVE_BY_FIVE,
      { activate: true, startDpr: true },
      testDb,
      patch,
    );

    const second = await addExploreProgram(
      USER_ID,
      PUSH_PULL_LEGS,
      { activate: true, startDpr: true },
      testDb,
      patch,
    );
    expect(second.dprError).toContain("already have");
    expect(await testDb.dprBlocks.count()).toBe(1);
  });
});
