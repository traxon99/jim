import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DrizzleQueryError } from "drizzle-orm";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserContext } from "../../context.js";
import { createMcpServer } from "../../server.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { GENERIC_TOOL_ERROR, toolErrorMessage } from "../../tool-error.js";
import { createRoutine } from "../create-routine.js";
import { RoutineLookupError } from "../find-routine.js";
import { logPastWorkout } from "../log-past-workout.js";
import { scheduleWorkout } from "../schedule-workout.js";

describe("toolErrorMessage (#514)", () => {
  it("keeps the tools' own messages", () => {
    expect(toolErrorMessage(new RoutineLookupError("No routine matches x."))).toBe(
      "No routine matches x.",
    );
    expect(toolErrorMessage(new Error("durationMinutes must be greater than 0"))).toBe(
      "durationMinutes must be greater than 0",
    );
  });

  it("replaces database errors with a generic message and logs the original", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const leaky = new DrizzleQueryError(
      'select * from "routines" where id = $1',
      ["Push Day"],
      new Error("boom"),
    );
    expect(toolErrorMessage(leaky)).toBe(GENERIC_TOOL_ERROR);
    expect(toolErrorMessage(new Error("wrapper", { cause: leaky }))).toBe(GENERIC_TOOL_ERROR);
    expect(toolErrorMessage("select 1")).toBe(GENERIC_TOOL_ERROR);
    expect(log).toHaveBeenCalledTimes(3);
    expect(GENERIC_TOOL_ERROR).not.toMatch(/select|routines/i);
    log.mockRestore();
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("routine names and muscles (#514)", () => {
  let admin: postgres.Sql;
  let context: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
      VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}')
    `;
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  it("schedule_workout and log_past_workout accept a routine name", async () => {
    const { id } = await createRoutine(context, { name: "Push Day", exercises: [] });
    const scheduled = await scheduleWorkout(context, {
      routineId: "push day",
      date: "2026-10-05T09:00:00.000Z",
    });
    expect(scheduled).toMatchObject({ routineId: id, routineName: "Push Day" });

    const logged = await logPastWorkout(context, {
      startedAt: "2026-09-10T17:00:00Z",
      routineId: "Push Day",
      exercises: [{ exercise: "bench press", sets: [{ weight: 100, reps: 5 }] }],
    });
    expect(logged).toMatchObject({ routineId: id, name: "Push Day" });
  });

  it("reports an unknown routine without leaking SQL, and rejects unknown muscles", async () => {
    const server = createMcpServer(context);
    const client = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const missing = await client.callTool({
      name: "schedule_workout",
      arguments: { routineId: "Nope Day", date: "2026-10-05T09:00:00.000Z" },
    });
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing.content)).toMatch(/No routine matches \\"Nope Day\\"/);
    expect(JSON.stringify(missing.content)).not.toMatch(/Failed query|select/i);

    const bad = await client.callTool({
      name: "upsert_exercise",
      arguments: { name: "Odd Lift", trackingType: "weight_reps", primaryMuscles: ["biceps-ish"] },
    });
    expect(bad.isError).toBe(true);

    await client.close();
    await server.close();
  });
});
