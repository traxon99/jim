import type { ProgramQuestionnaire } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ExerciseRow, type JimDatabase, createTestDb } from "../../db/schema";
import { generateProgramFromDb, saveGeneratedProgram } from "../generate";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-generate-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function exercise(
  slug: string,
  equipment: string,
  primaryMuscles: string[],
  mechanic: "compound" | "isolation",
  ownerId: string | null = null,
): ExerciseRow {
  return {
    id: `ex-${slug}${ownerId ? "-mine" : ""}`,
    ownerId,
    slug,
    name: slug,
    aliases: [],
    primaryMuscles: primaryMuscles as ExerciseRow["primaryMuscles"],
    secondaryMuscles: [],
    equipment,
    mechanic,
    force: null,
    level: "beginner",
    trackingType: equipment === "body only" ? "bodyweight" : "weight_reps",
    category: "strength",
    instructions: [],
    imageUrls: [],
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId: "",
    serverSeq: 0,
  };
}

const CATALOG = [
  exercise("barbell-squat", "barbell", ["quadriceps"], "compound"),
  exercise("dumbbell-squat", "dumbbell", ["quadriceps"], "compound"),
  exercise("barbell-deadlift", "barbell", ["lower back"], "compound"),
  exercise("barbell-bench-press-medium-grip", "barbell", ["chest"], "compound"),
  exercise("dumbbell-bench-press", "dumbbell", ["chest"], "compound"),
  exercise("standing-military-press", "barbell", ["shoulders"], "compound"),
  exercise("bent-over-barbell-row", "barbell", ["middle back"], "compound"),
  exercise("pullups", "body only", ["lats"], "compound"),
  exercise("side-lateral-raise", "dumbbell", ["shoulders"], "isolation"),
  exercise("barbell-curl", "barbell", ["biceps"], "isolation"),
  exercise("crunches", "body only", ["abdominals"], "isolation"),
  // A user's own copy is never a candidate — saving resolves global slugs.
  exercise("mine-squat", "barbell", ["quadriceps"], "compound", USER_ID),
];

const ANSWERS: ProgramQuestionnaire = {
  goal: "strength",
  daysPerWeek: 3,
  sessionMinutes: 45,
  equipment: ["barbell", "body only"],
  experience: "novice",
  focusLifts: ["squat", "bench"],
};

const okPatch = vi.fn(async () => ({ ok: true as const }));

describe("generateProgramFromDb", () => {
  it("builds from global exercises with the chosen equipment only", async () => {
    await testDb.exercises.bulkPut(CATALOG);
    const generated = await generateProgramFromDb(ANSWERS, testDb);
    const slugs = generated.template.days.flatMap((d) => d.routine.items.map((i) => i.slug));
    expect(slugs.length).toBeGreaterThan(0);
    expect(slugs).not.toContain("mine-squat");
    expect(slugs).not.toContain("dumbbell-squat");
    expect(slugs).not.toContain("side-lateral-raise");
    expect(generated.focusSlugs).toEqual(["barbell-squat", "barbell-bench-press-medium-grip"]);
  });
});

describe("saveGeneratedProgram", () => {
  it("saves an ordinary, active weekly program with its routines", async () => {
    await testDb.exercises.bulkPut(CATALOG);
    const generated = await generateProgramFromDb(ANSWERS, testDb);
    const result = await saveGeneratedProgram(
      USER_ID,
      generated,
      { dprFocusSlugs: [], answers: ANSWERS },
      testDb,
      okPatch,
    );

    expect(result.missingSlugs).toEqual([]);
    const program = await testDb.programs.get(result.programId);
    expect(program).toMatchObject({
      name: generated.template.name,
      mode: "weekly",
      isActive: true,
    });

    const entries = await testDb.programRoutines
      .where("programId")
      .equals(result.programId)
      .sortBy("position");
    expect(entries.map((e) => e.weekday)).toEqual(generated.template.days.map((d) => d.weekday));
    const routines = await testDb.routines.toArray();
    expect(routines.map((r) => r.folder)).toEqual(routines.map(() => generated.template.name));
    expect(await testDb.dprBlocks.count()).toBe(0);
    expect(okPatch).not.toHaveBeenCalled();
  });

  it("starts a DPR block on the picked focus lifts, tied to the program", async () => {
    await testDb.exercises.bulkPut(CATALOG);
    const generated = await generateProgramFromDb(ANSWERS, testDb);
    const patch = vi.fn(async () => ({ ok: true as const }));
    const result = await saveGeneratedProgram(
      USER_ID,
      generated,
      { dprFocusSlugs: generated.focusSlugs, answers: ANSWERS },
      testDb,
      patch,
    );

    expect(result.dprError).toBeNull();
    const [block] = await testDb.dprBlocks.toArray();
    expect(block).toMatchObject({
      programId: result.programId,
      status: "active",
      experience: "novice",
    });
    const lifts = await testDb.dprBlockLifts.toArray();
    expect(lifts.map((l) => l.exerciseId).sort()).toEqual(
      ["ex-barbell-bench-press-medium-grip", "ex-barbell-squat"].sort(),
    );
    expect(patch).toHaveBeenCalledWith({ dprEnabled: true, dprExperience: "novice" }, testDb);
  });

  it("reports, but doesn't fail on, a settings patch that can't reach the server", async () => {
    await testDb.exercises.bulkPut(CATALOG);
    const generated = await generateProgramFromDb(ANSWERS, testDb);
    const result = await saveGeneratedProgram(
      USER_ID,
      generated,
      { dprFocusSlugs: generated.focusSlugs, answers: ANSWERS },
      testDb,
      async () => ({ ok: false as const, error: "offline" }),
    );
    expect(result.dprError).toContain("offline");
    expect(await testDb.programs.get(result.programId)).toBeDefined();
    expect(await testDb.dprBlocks.count()).toBe(1);
  });
});
