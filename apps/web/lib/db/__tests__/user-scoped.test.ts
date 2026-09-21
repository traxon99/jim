import { resetTestDb } from "@/lib/test/test-db";
import { routines } from "@jim/db";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

let claimsSub: string | null = USER_A;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () =>
        claimsSub ? { data: { claims: { sub: claimsSub } } } : { data: null },
    },
  }),
}));

const { withUserDb, UnauthenticatedError } = await import("../user-scoped");

describe.skipIf(!process.env.TEST_DATABASE_URL)("withUserDb", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();

    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO routines (user_id, name, device_id) VALUES (${USER_A}, 'Push Day', 'device-a')`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  beforeEach(() => {
    claimsSub = USER_A;
  });

  it("scopes queries to the impersonated user via RLS", async () => {
    const ownRows = await withUserDb((tx) => tx.select().from(routines));
    expect(ownRows).toHaveLength(1);

    claimsSub = USER_B;
    const otherRows = await withUserDb((tx) => tx.select().from(routines));
    expect(otherRows).toHaveLength(0);
  });

  it("commits writes made inside the transaction", async () => {
    const id = await withUserDb(async (tx, userId) => {
      const [row] = await tx
        .insert(routines)
        .values({ userId, name: "Leg Day", deviceId: "device-a" })
        .returning({ id: routines.id });
      return row?.id;
    });

    const [persisted] = await admin<{ name: string }[]>`SELECT name FROM routines WHERE id = ${id}`;
    expect(persisted?.name).toBe("Leg Day");
  });

  it("throws UnauthenticatedError when there is no session", async () => {
    claimsSub = null;
    await expect(withUserDb(async (tx) => tx)).rejects.toThrow(UnauthenticatedError);
  });
});
