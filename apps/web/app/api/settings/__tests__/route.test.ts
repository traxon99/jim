import { resetTestDb } from "@/lib/test/test-db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";

const claims = { sub: USER_A, email: "a@example.com" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims } }) },
  }),
}));

const { GET, PATCH } = await import("../route");

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("GET/PATCH /api/settings", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    // public.users.id FKs to auth.users.id (a real Supabase project populates
    // this via its own signup trigger) — the stub schema doesn't, so tests
    // driving the route as an already-authenticated user seed it themselves.
    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com')`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("creates the user's row on first read and returns the schema defaults", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      units: "lb",
      defaultBarWeight: "45.00",
      availablePlates: ["45.00", "35.00", "25.00", "10.00", "5.00", "2.50"],
      defaultRestSeconds: 90,
      weekStart: 0,
      colorScheme: "system",
    });

    const rows = await admin`SELECT id, email FROM public.users WHERE id = ${USER_A}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("a@example.com");
  });

  it("rejects an invalid patch", async () => {
    const response = await patch({ units: "stone" });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid color scheme", async () => {
    const response = await patch({ colorScheme: "sepia" });
    expect(response.status).toBe(400);
  });

  it("persists a valid patch and reflects it on the next read", async () => {
    const response = await patch({
      defaultBarWeight: 20,
      availablePlates: [20, 15, 10, 5, 2.5, 1.25],
      defaultRestSeconds: 120,
      colorScheme: "dark",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.defaultBarWeight).toBe("20.00");
    expect(body.defaultRestSeconds).toBe(120);
    expect(body.colorScheme).toBe("dark");

    const again = await (await GET()).json();
    expect(again.defaultRestSeconds).toBe(120);
    expect(again.colorScheme).toBe("dark");
  });
});
