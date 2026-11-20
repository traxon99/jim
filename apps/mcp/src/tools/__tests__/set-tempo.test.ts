import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { createRoutine } from "../create-routine.js";
import { getRoutine } from "../get-routine.js";
import { createProgram } from "../programs.js";
import { setTempo } from "../tempo.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("set_tempo (#850)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let pushId: string;
  let legsId: string;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, category, primary_muscles) VALUES
        ('bench-press', 'Bench Press', 'weight_reps', 'strength', '{chest}'),
        ('overhead-press', 'Overhead Press', 'weight_reps', 'strength', '{shoulders}'),
        ('squat', 'Squat', 'weight_reps', 'strength', '{quadriceps}'),
        ('rowing', 'Rowing', 'time', 'cardio', '{lats}')
    `;
    ({ id: pushId } = await createRoutine(context, {
      name: "Push",
      exercises: [{ exercise: "bench press" }, { exercise: "overhead press" }],
    }));
    ({ id: legsId } = await createRoutine(context, {
      name: "Legs",
      exercises: [{ exercise: "squat" }, { exercise: "rowing" }],
    }));
    await createProgram(context, {
      name: "Split",
      mode: "sequence",
      entries: [{ routine: "Push" }, { routine: null }, { routine: "Legs" }, { routine: "Push" }],
    });
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  async function temposOf(routineId: string) {
    const routine = await getRoutine(context, { routine: routineId });
    return routine.exercises.map((item) => [item.exerciseName, item.tempo ?? null]);
  }

  it("sets one tempo on every lift in a routine, then one lift on its own", async () => {
    const result = await setTempo(context, {
      routine: "push",
      tempo: "311",
      exercises: [{ exercise: "Overhead Press", tempo: "2-0-x" }],
    });
    expect(result.changed).toBe(2);
    expect(await temposOf(pushId)).toEqual([
      ["Bench Press", "3-1-1"],
      ["Overhead Press", "2-0-X"],
    ]);
  });

  it("covers every routine in a program once, leaving cardio out", async () => {
    const result = await setTempo(context, { program: "Split", tempo: "4-0-1" });
    expect(result.routines.map((group) => group.routineName)).toEqual(["Push", "Legs"]);
    expect(result.routines[1]?.lifts).toEqual([{ exercise: "Squat", tempo: "4-0-1" }]);
    expect(await temposOf(legsId)).toEqual([
      ["Squat", "4-0-1"],
      ["Rowing", null],
    ]);
  });

  it("previews without saving", async () => {
    const result = await setTempo(context, { routine: "Legs", tempo: null, dryRun: true });
    expect(result.routines[0]?.lifts).toEqual([{ exercise: "Squat", tempo: null }]);
    expect(await temposOf(legsId)).toEqual([
      ["Squat", "4-0-1"],
      ["Rowing", null],
    ]);
  });

  it("rejects a bad tempo, a lift not in scope, and a missing scope", async () => {
    await expect(setTempo(context, { routine: "Legs", tempo: "3-X-1" })).rejects.toThrow(
      /isn't a tempo/,
    );
    await expect(
      setTempo(context, {
        routine: "Legs",
        exercises: [{ exercise: "Bench Press", tempo: "3-1-1" }],
      }),
    ).rejects.toThrow(/isn't a lift here/);
    await expect(setTempo(context, { tempo: "3-1-1" })).rejects.toThrow(/exactly one/);
  });
});
