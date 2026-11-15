import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { createRoutine } from "../create-routine.js";
import { getRoutine } from "../get-routine.js";
import { listRoutines } from "../list-routines.js";
import { listOneOffWorkouts, saveOneOffAsRoutine } from "../one-off.js";
import { createProgram } from "../programs.js";
import { scheduleWorkout } from "../schedule-workout.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("one-off workouts (#798)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let otherContext: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    otherContext = testContext(USER_B);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, category, primary_muscles) VALUES
        ('squat', 'Squat', 'weight_reps', 'strength', '{quadriceps}')
    `;
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
    await otherContext.db.$client.end();
  });

  const oneOff = (name: string, lifetime: Parameters<typeof createRoutine>[1]["oneOff"]) =>
    createRoutine(context, { name, oneOff: lifetime, exercises: [{ exercise: "Squat" }] });

  it("keeps a one-off out of list_routines and lists it with its lifetime", async () => {
    const before = Date.now();
    const created = await oneOff("Full Body Return", "24h");
    const expiresAt = new Date(created.oneOff?.expiresAt ?? 0).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(24 * 3_600_000 - 1000);
    expect(expiresAt - before).toBeLessThanOrEqual(24 * 3_600_000 + 5000);

    expect(await listRoutines(context, {})).toEqual([]);
    const listed = await listOneOffWorkouts(context);
    expect(listed).toMatchObject([
      { id: created.id, lifetime: "24h", status: "live", exerciseCount: 1 },
    ]);
    expect((await getRoutine(context, { routine: created.id })).oneOff).toMatchObject({
      day: null,
    });
    expect(await listOneOffWorkouts(otherContext)).toEqual([]);
  });

  it("replaces an older unstarted one, but keeps day one-offs side by side", async () => {
    const saturday = await oneOff("Saturday", { day: "2099-01-03" });
    const next = await oneOff("Next time", "until_done");
    expect(next.oneOff?.replaced.map((r) => r.name)).toEqual(["Full Body Return"]);
    const listed = await listOneOffWorkouts(context);
    expect(listed.map((r) => [r.name, r.lifetime, r.status])).toEqual([
      ["Saturday", "day", "upcoming"],
      ["Next time", "until_done", "live"],
    ]);
    expect(saturday.oneOff?.day).toBe("2099-01-03");
  });

  it("ends a one-off when a workout from it is finished", async () => {
    const [row] = await admin`SELECT id FROM routines WHERE name = 'Next time'`;
    await admin`
      INSERT INTO sessions (user_id, routine_id, name, started_at, ended_at, device_id)
      VALUES (${USER_A}, ${row?.id}, 'Next time', now() - interval '1 hour', now(), 'phone')
    `;
    expect((await listOneOffWorkouts(context)).map((r) => r.name)).toEqual(["Saturday"]);
  });

  it("won't schedule a one-off or put it in a program", async () => {
    await expect(
      scheduleWorkout(context, { routineId: "Saturday", date: "2099-01-03" }),
    ).rejects.toThrow("one-off");
    await expect(
      createProgram(context, { name: "P", entries: [{ routine: "Saturday" }] }),
    ).rejects.toThrow("one-off");
  });

  it("saves a one-off as a routine", async () => {
    const preview = await saveOneOffAsRoutine(context, { routine: "Saturday", dryRun: true });
    expect(preview).toMatchObject({ saved: true, dryRun: true });
    expect(await listRoutines(context, {})).toEqual([]);

    await saveOneOffAsRoutine(context, { routine: "Saturday" });
    expect((await listRoutines(context, {})).map((r) => r.name)).toEqual(["Saturday"]);
    expect(await listOneOffWorkouts(context)).toEqual([]);
    await expect(saveOneOffAsRoutine(context, { routine: "Saturday" })).rejects.toThrow(
      "already a routine",
    );
  });
});
