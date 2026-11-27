import { resetTestDb } from "@/lib/test/test-db";
import { uuidv7 } from "@jim/core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

let claimsSub: string = USER_A;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: claimsSub } } }) },
  }),
}));

const { GET } = await import("../pull/route");
const { POST } = await import("../push/route");

function push(mutations: unknown[]) {
  return POST(
    new Request("http://localhost/api/sync/push", {
      method: "POST",
      body: JSON.stringify({ mutations }),
    }),
  );
}

async function pulledCards(): Promise<{ id: string; code: string }[]> {
  const response = await GET(new Request("http://localhost/api/sync/pull?since=0"));
  return (await response.json()).changes.gymCards;
}

function card(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: uuidv7(),
    userId: USER_A,
    gymId: null,
    name: "Iron Temple",
    format: "code39",
    code: "00048213",
    color: "#b3261e",
    position: 0,
    createdAt: now,
    updatedAt: now,
    deviceId: "device-a",
    deletedAt: null,
    ...overrides,
  };
}

// Gym card codes are door credentials (issue #878, ADR-026): sealed before
// they reach Postgres, opened only for their owner on pull.
describe.skipIf(!process.env.TEST_DATABASE_URL)("gym card sync (#878)", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.GYM_CARD_KEY = "test-gym-card-key-0123456789";
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
  }, 30_000);

  afterAll(async () => {
    process.env.GYM_CARD_KEY = undefined;
    await admin.end();
  });

  it("stores the code sealed and pulls it back opened, for the owner only", async () => {
    claimsSub = USER_A;
    const entity = card();
    const body = await (await push([{ id: uuidv7(), table: "gymCards", entity }])).json();
    expect(body.results[0].status).toBe("applied");

    const [row] = await admin<
      { code: string }[]
    >`SELECT code FROM gym_cards WHERE id = ${entity.id}`;
    expect(row?.code).toMatch(/^gc1\./);
    expect(row?.code).not.toContain("00048213");

    expect((await pulledCards()).find((pulled) => pulled.id === entity.id)?.code).toBe("00048213");
    claimsSub = USER_B;
    expect(await pulledCards()).toEqual([]);
  });

  it("leaves out a row whose code won't open, so the phone keeps its copy", async () => {
    claimsSub = USER_A;
    const entity = card();
    await push([{ id: uuidv7(), table: "gymCards", entity }]);
    // Copying another card's sealed code onto this row doesn't open: the id is bound in.
    await admin`UPDATE gym_cards SET code = (SELECT code FROM gym_cards WHERE id <> ${entity.id} LIMIT 1) WHERE id = ${entity.id}`;
    expect((await pulledCards()).some((pulled) => pulled.id === entity.id)).toBe(false);
  });

  it("rejects a card it can't seal or that the app couldn't have written", async () => {
    claimsSub = USER_A;
    const unknownFormat = card({ format: "maxicode" });
    const badColor = card({ color: "red" });
    const body = await (
      await push([
        { id: uuidv7(), table: "gymCards", entity: unknownFormat },
        { id: uuidv7(), table: "gymCards", entity: badColor },
      ])
    ).json();
    expect(body.results.map((r: { status: string }) => r.status)).toEqual(["error", "error"]);

    const saved = process.env.GYM_CARD_KEY;
    process.env.GYM_CARD_KEY = undefined;
    const noKey = await (await push([{ id: uuidv7(), table: "gymCards", entity: card() }])).json();
    process.env.GYM_CARD_KEY = saved;
    expect(noKey.results[0].status).toBe("error");
  });
});
