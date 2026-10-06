import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { createMcpServer } from "../../server.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { deleteBodyMeasurement, logBodyMeasurement } from "../body-measurements-write.js";
import { createRoutine } from "../create-routine.js";
import { deleteRoutine } from "../delete-routine.js";
import { deleteWorkout } from "../delete-workout.js";
import { getRoutine } from "../get-routine.js";
import { listRoutines } from "../list-routines.js";
import { createProgram, deleteProgram, listPrograms, updateProgram } from "../programs.js";
import { scheduleWorkout } from "../schedule-workout.js";
import { cancelScheduledWorkout, listScheduledWorkouts } from "../scheduled-workouts.js";
import { getSettings, updateSettings } from "../settings.js";
import { updateRoutine } from "../update-routine.js";
import { createWarmup, listWarmupTemplates } from "../warmups.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("MCP parity with the app (#435)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let otherContext: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    otherContext = testContext(USER_B);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, category, primary_muscles) VALUES
        ('squat', 'Squat', 'weight_reps', 'strength', '{quadriceps}'),
        ('bench-press', 'Bench Press', 'weight_reps', 'strength', '{chest}'),
        ('warmup-arm-circles', 'Arm Circles', 'bodyweight', 'warmup', '{shoulders}'),
        ('warmup-band-pull-apart', 'Band Pull-Apart', 'bodyweight', 'warmup', '{shoulders}'),
        ('warmup-doorway-chest-stretch', 'Doorway Chest Stretch', 'time', 'warmup', '{chest}')
    `;
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
    await otherContext.db.$client.end();
  });

  describe("warm-ups", () => {
    it("lists the built-in templates with exercise names", async () => {
      const templates = await listWarmupTemplates(context);
      const upper = templates.find((t) => t.key === "upper");
      expect(upper).toMatchObject({ name: "Upper body warm-up", minutes: 8 });
      expect(upper?.exercises[0]).toEqual({ exercise: "Arm Circles", sets: 1, reps: 15 });
    });

    it("adds a template as a warm-up routine and attaches it to a strength routine", async () => {
      const push = await createRoutine(context, {
        name: "Push",
        exercises: [{ exercise: "bench press" }],
      });
      const warmup = await createWarmup(context, { template: "upper", attachTo: ["push"] });

      expect(warmup).toMatchObject({ kind: "warmup", name: "Upper body warm-up", minutes: 8 });
      expect(warmup.exercises.map((e) => e.exerciseName)).toEqual([
        "Arm Circles",
        "Band Pull-Apart",
        "Doorway Chest Stretch",
      ]);
      expect(warmup.exercises[2]).toMatchObject({ sets: 1, seconds: 30 });
      // Slugs the catalog doesn't have are reported, not fatal.
      expect(warmup.missingExercises).toContain("warmup-wrist-circles");

      const [row] = await admin`SELECT kind, warmup_minutes FROM routines WHERE id = ${warmup.id}`;
      expect(row).toMatchObject({ kind: "warmup", warmup_minutes: 8 });
      const routine = await getRoutine(context, { routine: push.id });
      expect(routine.warmupRoutineId).toBe(warmup.id);
    });

    it("builds a custom warm-up with reps and timed sets", async () => {
      const warmup = await createWarmup(context, {
        name: "Quick shoulders",
        minutes: 5,
        exercises: [
          { exercise: "arm circles", sets: 2, reps: 10 },
          { exercise: "doorway chest stretch", seconds: 45 },
        ],
      });
      const routine = await getRoutine(context, { routine: warmup.id });
      expect(routine.kind).toBe("warmup");
      expect(routine.warmupMinutes).toBe(5);
      expect(routine.exercises).toMatchObject([
        { exerciseName: "Arm Circles", targetSets: 2, targetRepsLow: 10, targetRepsHigh: 10 },
        { exerciseName: "Doorway Chest Stretch", targetSets: 1, targetDurationSeconds: 45 },
      ]);
    });

    it("rejects bad warm-up input", async () => {
      await expect(createWarmup(context, { template: "nope" })).rejects.toThrow(/Known keys/);
      await expect(createWarmup(context, { name: "x", exercises: [] })).rejects.toThrow(
        /at least one exercise/,
      );
      await expect(
        createWarmup(context, {
          name: "x",
          exercises: [{ exercise: "arm circles", reps: 5, seconds: 5 }],
        }),
      ).rejects.toThrow(/not both/);
      await expect(
        createWarmup(context, { template: "upper", attachTo: ["Quick shoulders"] }),
      ).rejects.toThrow(/itself a warm-up/);
    });

    it("links and unlinks a warm-up through create_routine and update_routine", async () => {
      const legs = await createRoutine(context, {
        name: "Legs",
        warmup: "Quick shoulders",
        warmupMinutes: 7,
        exercises: [{ exercise: "squat" }],
      });
      expect(legs.warmup?.name).toBe("Quick shoulders");
      expect(await getRoutine(context, { routine: "legs" })).toMatchObject({
        warmupMinutes: 7,
      });

      await updateRoutine(context, { routineId: "Legs", warmup: null, warmupMinutes: null });
      expect(await getRoutine(context, { routine: legs.id })).toMatchObject({
        warmupRoutineId: null,
        warmupMinutes: null,
      });

      await expect(
        createRoutine(context, { name: "Bad", warmup: "Push", exercises: [] }),
      ).rejects.toThrow(/strength routine, not a warm-up/);
      await expect(
        updateRoutine(context, { routineId: "Quick shoulders", warmup: "Upper body warm-up" }),
      ).rejects.toThrow(/itself a warm-up/);
    });
  });

  it("delete_routine tombstones the routine and previews by default", async () => {
    const { id } = await createRoutine(context, { name: "Temp", exercises: [] });
    const preview = await deleteRoutine(context, { routine: "Temp", dryRun: true });
    expect(preview).toMatchObject({ deleted: true, dryRun: true });
    expect((await listRoutines(context, {})).some((r) => r.id === id)).toBe(true);

    await deleteRoutine(context, { routine: id });
    expect((await listRoutines(context, {})).some((r) => r.id === id)).toBe(false);
  });

  describe("programs", () => {
    it("creates, activates, edits and deletes programs", async () => {
      const ppl = await createProgram(context, {
        name: "PPL",
        entries: [{ routine: "Push" }, { routine: null }, { routine: "Legs" }],
        activate: true,
      });
      expect(ppl.entries.map((e) => e.restDay)).toEqual([false, true, false]);

      const weekly = await createProgram(context, {
        name: "Weekly",
        mode: "weekly",
        durationWeeks: 8,
        entries: [
          { routine: "Push", weekday: 1 },
          { routine: "Legs", weekday: 4 },
        ],
      });
      await updateProgram(context, { program: "weekly", active: true });

      let list = await listPrograms(context);
      expect(list.find((p) => p.id === ppl.id)?.isActive).toBe(false);
      const active = list.find((p) => p.id === weekly.id);
      expect(active).toMatchObject({
        isActive: true,
        durationWeeks: 8,
        progress: { week: 1, total: 8, finished: false },
      });
      expect(active?.entries.map((e) => e.weekdayName)).toEqual(["Monday", "Thursday"]);

      await updateProgram(context, { program: ppl.id, entries: [{ routine: "Legs" }] });
      list = await listPrograms(context);
      expect(list.find((p) => p.id === ppl.id)?.entries.map((e) => e.routineName)).toEqual([
        "Legs",
      ]);

      await expect(
        createProgram(context, { name: "x", mode: "weekly", entries: [{ routine: "Push" }] }),
      ).rejects.toThrow(/weekday/);
      await expect(
        createProgram(context, { name: "x", entries: [{ routine: "Quick shoulders" }] }),
      ).rejects.toThrow(/is a warm-up/);
      await expect(updateProgram(context, { program: "PPL", mode: "weekly" })).rejects.toThrow(
        /pass the new entries/,
      );

      await deleteProgram(context, { program: "PPL" });
      expect((await listPrograms(context)).map((p) => p.name)).toEqual(["Weekly"]);
      expect(await listPrograms(otherContext)).toEqual([]);
    });
  });

  it("lists and cancels scheduled workouts", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { id } = await scheduleWorkout(context, {
      routineId: (await getRoutine(context, { routine: "Push" })).id,
      date: future,
    });
    await scheduleWorkout(context, {
      routineId: (await getRoutine(context, { routine: "Push" })).id,
      date: past,
    });

    expect((await listScheduledWorkouts(context, {})).map((s) => s.id)).toEqual([id]);
    expect(await listScheduledWorkouts(context, { includePast: true })).toHaveLength(2);
    expect((await listScheduledWorkouts(context, {}))[0]?.routineName).toBe("Push");

    await cancelScheduledWorkout(context, { id });
    expect(await listScheduledWorkouts(context, {})).toEqual([]);
  });

  it("delete_workout removes a finished workout but never one in progress", async () => {
    const [done] = await admin`
      INSERT INTO sessions (user_id, name, started_at, ended_at, device_id)
      VALUES (${USER_A}, 'Done', '2026-09-20T10:00:00Z', '2026-09-20T11:00:00Z', 'phone')
      RETURNING id
    `;
    const [live] = await admin`
      INSERT INTO sessions (user_id, name, started_at, device_id)
      VALUES (${USER_A}, 'Live', now(), 'phone')
      RETURNING id
    `;
    await expect(deleteWorkout(context, { sessionId: live?.id })).rejects.toThrow(/in progress/);
    await expect(deleteWorkout(otherContext, { sessionId: done?.id })).rejects.toThrow(
      /No workout/,
    );
    await deleteWorkout(context, { sessionId: done?.id });
    const [row] = await admin`SELECT deleted_at FROM sessions WHERE id = ${done?.id}`;
    expect(row?.deleted_at).not.toBeNull();
  });

  it("logs measurements once per day and keeps the profile bodyweight current", async () => {
    const first = await logBodyMeasurement(context, {
      kind: "bodyweight",
      value: 180,
      measuredAt: "2026-10-01T07:00:00-07:00",
    });
    expect(first).toMatchObject({ unit: "lb", replacedSameDay: false, currentBodyweight: 180 });

    // 22:00 local on the same day is the next day in UTC, but the same local day.
    const again = await logBodyMeasurement(context, {
      kind: "bodyweight",
      value: 179.4,
      measuredAt: "2026-10-01T22:00:00-07:00",
    });
    expect(again).toMatchObject({ id: first.id, replacedSameDay: true, currentBodyweight: 179.4 });

    await logBodyMeasurement(context, {
      kind: "bodyweight",
      value: 80,
      unit: "kg",
      measuredAt: "2026-10-03T07:00:00-07:00",
    });
    expect((await getSettings(context)).bodyweight).toBe(176.4);

    const waist = await logBodyMeasurement(context, { kind: "waist", value: 32 });
    expect(waist.unit).toBe("in");
    await expect(
      logBodyMeasurement(context, { kind: "waist", value: 32, unit: "kg" }),
    ).rejects.toThrow(/isn't a unit/);

    await deleteBodyMeasurement(context, { id: waist.id });
    const [row] = await admin`SELECT deleted_at FROM body_measurements WHERE id = ${waist.id}`;
    expect(row?.deleted_at).not.toBeNull();
  });

  it("reads and patches settings", async () => {
    expect(await getSettings(context)).toMatchObject({
      units: "lb",
      defaultBarWeight: 45,
      dprEnabled: false,
    });
    const preview = await updateSettings(context, { defaultRestSeconds: 120, dryRun: true });
    expect(preview.settings.defaultRestSeconds).toBe(120);
    expect((await getSettings(context)).defaultRestSeconds).toBe(90);

    const result = await updateSettings(context, {
      defaultRestSeconds: 120,
      availablePlates: [20, 10, 5, 2.5, 1.25],
      dprEnabled: true,
      sex: "male",
    });
    expect(result.changed.sort()).toEqual([
      "availablePlates",
      "defaultRestSeconds",
      "dprEnabled",
      "sex",
    ]);
    expect(await getSettings(context)).toMatchObject({
      defaultRestSeconds: 120,
      availablePlates: [20, 10, 5, 2.5, 1.25],
      dprEnabled: true,
      sex: "male",
    });
    await expect(updateSettings(context, { dprDefaultRepLow: 20 })).rejects.toThrow(/above/);
    await expect(updateSettings(context, {})).rejects.toThrow(/Nothing to change/);
  });

  it("registers every new tool on the server", async () => {
    const server = createMcpServer(context);
    const client = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "create_warmup",
        "list_warmup_templates",
        "delete_routine",
        "list_programs",
        "create_program",
        "update_program",
        "delete_program",
        "list_scheduled_workouts",
        "cancel_scheduled_workout",
        "delete_workout",
        "log_body_measurement",
        "delete_body_measurement",
        "get_settings",
        "update_settings",
      ]),
    );

    // Destructive deletes preview unless told otherwise.
    const result = await client.callTool({
      name: "delete_routine",
      arguments: { routine: "Push" },
    });
    expect(result.isError).toBeFalsy();
    expect((await listRoutines(context, {})).some((r) => r.name === "Push")).toBe(true);

    await client.close();
    await server.close();
  });
});
