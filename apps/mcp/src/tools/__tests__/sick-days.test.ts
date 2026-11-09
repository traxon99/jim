import { dayKey } from "@jim/core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { listSickDays, markSickDays, unmarkSickDays } from "../sick-days.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("sick day tools (#779)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let otherContext: UserContext;
  const today = dayKey(new Date(), "UTC");
  const daysAgo = (n: number) => dayKey(new Date(Date.now() - n * 86_400_000), "UTC");

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    otherContext = testContext(USER_B);
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
    await otherContext.db.$client.end();
  });

  it("marks today by default and previews without writing", async () => {
    const preview = await markSickDays(context, { dryRun: true });
    expect(preview).toMatchObject({ marked: [today], dryRun: true });
    expect(await admin`SELECT id FROM sick_days`).toHaveLength(0);

    await markSickDays(context, { note: " flu " });
    const listed = await listSickDays(context, {});
    expect(listed).toMatchObject({ sickToday: true, count: 1 });
    expect(listed.sickDays).toEqual([{ day: today, note: "flu" }]);
    // Private: another user sees nothing.
    expect((await listSickDays(otherContext, {})).count).toBe(0);
  });

  it("marks a range, keeping days already marked", async () => {
    const result = await markSickDays(context, { from: daysAgo(2), to: today });
    expect(result.marked).toEqual([daysAgo(2), daysAgo(1)]);
    expect(result.alreadySick).toEqual([today]);
    expect((await listSickDays(context, { to: daysAgo(1) })).count).toBe(2);
  });

  it("rejects future days, reversed and overlong ranges", async () => {
    const tomorrow = dayKey(new Date(Date.now() + 86_400_000), "UTC");
    await expect(markSickDays(context, { from: tomorrow })).rejects.toThrow("future");
    await expect(markSickDays(context, { from: today, to: daysAgo(1) })).rejects.toThrow(
      "on or after",
    );
    await expect(markSickDays(context, { from: daysAgo(40), to: today })).rejects.toThrow(
      "at most",
    );
  });

  it("unmarks as a dry run by default, then for real", async () => {
    const preview = await unmarkSickDays(context, { from: daysAgo(1), to: today });
    expect(preview).toMatchObject({ unmarked: [daysAgo(1), today], dryRun: true });
    expect((await listSickDays(context, {})).count).toBe(3);

    await unmarkSickDays(context, { from: daysAgo(1), to: today, dryRun: false });
    const listed = await listSickDays(context, {});
    expect(listed.sickDays.map((row) => row.day)).toEqual([daysAgo(2)]);
    expect(listed.sickToday).toBe(false);
  });
});
