import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { deleteGymCard, listGymCards } from "../gym-cards.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("gym card tools (#878)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let otherContext: UserContext;
  const CARD = "0190a000-0000-7000-8000-000000000001";

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    otherContext = testContext(USER_B);
    await admin`
      INSERT INTO gyms (id, user_id, name) VALUES ('0190a000-0000-7000-8000-0000000000aa', ${USER_A}, 'Iron Temple')`;
    await admin`
      INSERT INTO gym_cards (id, user_id, gym_id, name, format, code, color)
      VALUES (${CARD}, ${USER_A}, '0190a000-0000-7000-8000-0000000000aa', 'Iron Temple', 'code39', 'gc1.sealed.code.here', '#b3261e')`;
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
    await otherContext.db.$client.end();
  });

  it("lists cards with their gym and format, never the code", async () => {
    const cards = await listGymCards(context);
    expect(cards).toEqual([
      { id: CARD, name: "Iron Temple", format: "Code 39", color: "#b3261e", gym: "Iron Temple" },
    ]);
    expect(JSON.stringify(cards)).not.toContain("gc1.");
    // Private: another user sees nothing.
    expect(await listGymCards(otherContext)).toEqual([]);
  });

  it("previews a delete by default, then deletes by name", async () => {
    const preview = await deleteGymCard(context, { card: "iron temple" });
    expect(preview).toMatchObject({ deleted: "Iron Temple", dryRun: true });
    expect(await listGymCards(context)).toHaveLength(1);

    await deleteGymCard(context, { card: CARD, dryRun: false });
    expect(await listGymCards(context)).toEqual([]);
    const [row] = await admin`SELECT deleted_at, device_id FROM gym_cards WHERE id = ${CARD}`;
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.device_id).toBe("mcp-server");
  });

  it("can't delete another user's card", async () => {
    await expect(deleteGymCard(otherContext, { card: CARD, dryRun: false })).rejects.toThrow(
      /No gym card/,
    );
  });
});
