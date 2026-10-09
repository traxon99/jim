import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { createGym, deleteGym } from "../gyms.js";
import { searchExercisesTool } from "../search-exercises.js";
import { upsertExercise } from "../upsert-exercise.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("exercise machine details (#450)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let globalId: string;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    const [row] = await admin<{ id: string }[]>`
      INSERT INTO exercises (slug, name, tracking_type, category, primary_muscles, equipment)
      VALUES ('lat-pulldown', 'Lat Pulldown', 'weight_reps', 'strength', '{lats}', 'cable')
      RETURNING id
    `;
    // biome-ignore lint/style/noNonNullAssertion: just inserted
    globalId = row!.id;
    await createGym(context, { name: "Iron Temple" });
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  it("clones a catalog exercise with make, model, pulley and gym", async () => {
    const result = await upsertExercise(context, {
      id: globalId,
      machineBrand: " Life Fitness ",
      machineModel: "Signature Pulldown",
      pulleyType: "double",
      gym: "iron temple",
    });
    expect(result.action).toBe("cloned");

    const [found] = await searchExercisesTool(context, { query: "lat pulldown" });
    expect(found).toMatchObject({
      id: result.id,
      machine: "Life Fitness Signature Pulldown",
      pulleyType: "double",
      gym: "Iron Temple",
    });
  });

  it("clears fields, and hides a deleted gym", async () => {
    const [clone] = await searchExercisesTool(context, { query: "lat pulldown" });
    await upsertExercise(context, { id: clone?.id, machineModel: "", pulleyType: "none" });
    await deleteGym(context, { gym: "Iron Temple", dryRun: false });
    const [after] = await searchExercisesTool(context, { query: "lat pulldown" });
    expect(after).toMatchObject({ machine: "Life Fitness" });
    expect(after).not.toHaveProperty("pulleyType");
    expect(after).not.toHaveProperty("gym");
  });

  it("rejects an unknown gym", async () => {
    await expect(
      upsertExercise(context, { name: "Cable Row", trackingType: "weight_reps", gym: "Nowhere" }),
    ).rejects.toThrow(/list_gyms/);
  });
});
