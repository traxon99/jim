import { dayKey } from "@jim/core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { deleteInjury, healInjury, listInjuries, logPain, reportInjury } from "../injuries.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("injury tools (#627)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let otherContext: UserContext;
  const today = dayKey(new Date(), "UTC");

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

  it("reports an injury with today's pain and lists it with a suggestion", async () => {
    const preview = await reportInjury(context, {
      area: "Knee",
      side: "left",
      painLevel: 5,
      note: "tweaked it",
      dryRun: true,
    });
    expect(preview).toMatchObject({ label: "Left knee", todaysPain: 5, dryRun: true });
    expect(await admin`SELECT id FROM injuries`).toHaveLength(0);

    const injury = await reportInjury(context, { area: "knee", side: "left", painLevel: 5 });
    expect(injury).toMatchObject({ open: true, startedOn: today, suggestion: "swap" });

    const listed = await listInjuries(context, {});
    expect(listed.open.map((row) => row.label)).toEqual(["Left knee"]);
    expect(listed.healedCount).toBe(0);
    // Private: another user sees nothing.
    expect((await listInjuries(otherContext, {})).open).toEqual([]);
  });

  it("asks for a side on paired areas and rejects unknown areas and future days", async () => {
    await expect(reportInjury(context, { area: "elbow", painLevel: 2 })).rejects.toThrow("side");
    await expect(
      reportInjury(context, { area: "toe", side: "left", painLevel: 2 }),
    ).rejects.toThrow("isn't an injury area");
    await expect(
      reportInjury(context, { area: "neck", startedOn: "2999-01-01", painLevel: 2 }),
    ).rejects.toThrow("future");
  });

  it("replaces the same day's check-in, then heals and deletes", async () => {
    const logged = await logPain(context, { injury: "left knee", painLevel: 2 });
    expect(logged).toMatchObject({ todaysPain: 2, replacedSameDay: true, suggestion: "light" });
    const rows = await admin`SELECT pain_level FROM pain_checkins WHERE deleted_at IS NULL`;
    expect(rows.map((row) => row.pain_level)).toEqual([2]);

    const healed = await healInjury(context, { injury: "knee" });
    expect(healed).toMatchObject({ open: false, healedOn: today });
    const listed = await listInjuries(context, { includeHealed: true });
    expect(listed.open).toEqual([]);
    expect(listed.healed?.map((row) => row.label)).toEqual(["Left knee"]);

    const id = listed.healed?.[0]?.id ?? "";
    const preview = await deleteInjury(context, { injury: id, dryRun: true });
    expect(preview).toMatchObject({ deleted: true, dryRun: true });
    const deleted = await deleteInjury(context, { injury: id });
    expect(deleted).toMatchObject({ deleted: true, checkinsDeleted: 1 });
    expect((await listInjuries(context, { includeHealed: true })).healed).toEqual([]);
  });
});
