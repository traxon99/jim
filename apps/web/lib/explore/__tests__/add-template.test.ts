import {
  MADDYS_WORKOUT_SPLIT,
  PROGRAM_TEMPLATES,
  ROUTINE_TEMPLATES,
  routineTemplateSlugs,
} from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ExerciseRow, type JimDatabase, createTestDb } from "../../db/schema";
import { addProgramTemplate, addRoutineTemplate } from "../add-template";

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

describe("addRoutineTemplate (against Dexie)", () => {
  it("creates the routine, its linked warm-up, and keeps supersets/rep ranges/notes", async () => {
    await seedAllTemplateSlugs();
    const template = ROUTINE_TEMPLATES.find((r) => r.key === "maddy-monday");
    if (!template?.warmup) throw new Error("monday template missing");

    const { routineId, missingSlugs } = await addRoutineTemplate(
      USER_ID,
      template,
      { folder: "Split" },
      testDb,
    );
    expect(missingSlugs).toEqual([]);

    const routine = await testDb.routines.get(routineId);
    expect(routine).toMatchObject({ name: template.name, kind: "strength", folder: "Split" });
    const warmup = await testDb.routines.get(routine?.warmupRoutineId ?? "");
    expect(warmup).toMatchObject({ name: template.warmup.name, kind: "warmup" });

    const items = (
      await testDb.routineExercises.where("routineId").equals(routineId).toArray()
    ).sort((a, b) => a.position - b.position);
    expect(items.map((i) => i.exerciseId)).toEqual(template.items.map((i) => `ex-${i.slug}`));
    expect(items[0].supersetGroup).toBe(1);
    const backExtension = items.find((i) => i.exerciseId === "ex-hyperextensions-back-extensions");
    expect(backExtension).toMatchObject({ targetRepsLow: 8, targetRepsHigh: 12, targetSets: 3 });
  });

  it("skips and reports exercises not synced to this device, ignoring user clones", async () => {
    const template = ROUTINE_TEMPLATES.find((r) => r.key === "maddy-abs");
    if (!template) throw new Error("abs template missing");
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
  it("adds Maddy's Workout Split as a weekly program with each day on its weekday", async () => {
    await seedAllTemplateSlugs();

    const { programId, missingSlugs } = await addProgramTemplate(
      USER_ID,
      MADDYS_WORKOUT_SPLIT,
      testDb,
    );
    expect(missingSlugs).toEqual([]);

    const program = await testDb.programs.get(programId);
    expect(program).toMatchObject({
      name: "Maddy's Workout Split",
      mode: "weekly",
      isActive: false,
    });

    const entries = (
      await testDb.programRoutines.where("programId").equals(programId).toArray()
    ).sort((a, b) => a.position - b.position);
    const routines = await testDb.routines.bulkGet(entries.map((e) => e.routineId));
    expect(entries.map((e, i) => [e.weekday, routines[i]?.name])).toEqual(
      MADDYS_WORKOUT_SPLIT.days.map((d) => [d.weekday, d.routine.name]),
    );

    const all = await testDb.routines.toArray();
    const strength = all.filter((r) => r.kind === "strength");
    // Six scheduled days plus the abs routine, all filed under the program's folder.
    expect(strength).toHaveLength(7);
    expect(new Set(strength.map((r) => r.folder))).toEqual(new Set(["Maddy's Workout Split"]));
    // Six per-day warm-ups plus the daily stretch.
    expect(all.filter((r) => r.kind === "warmup")).toHaveLength(7);
    expect(all.some((r) => r.name === "Maddy's Daily Stretch")).toBe(true);
  });
});
