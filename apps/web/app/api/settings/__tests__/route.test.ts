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
      accentColor: "zinc",
      fontFamily: "sans",
      cardStyle: "plain",
      showPaceTracker: true,
      sex: null,
      birthdate: null,
      heightCm: null,
      bodyweight: null,
      dprEnabled: false,
      dprAggressiveness: "moderate",
      dprExperience: null,
      dprEquipmentIncrements: {},
      dprDefaultRepLow: 6,
      dprDefaultRepHigh: 10,
      dprPromptDismissedAt: null,
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

  it("rejects an invalid accent color", async () => {
    const response = await patch({ accentColor: "chartreuse" });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid font family", async () => {
    const response = await patch({ fontFamily: "comic-sans" });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid card style", async () => {
    const response = await patch({ cardStyle: "neon" });
    expect(response.status).toBe(400);
  });

  it("rejects a non-boolean pace tracker toggle", async () => {
    const response = await patch({ showPaceTracker: "no" });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid sex", async () => {
    const response = await patch({ sex: "other" });
    expect(response.status).toBe(400);
  });

  it("rejects a malformed birthdate", async () => {
    const response = await patch({ birthdate: "not-a-date" });
    expect(response.status).toBe(400);
  });

  it("accepts plates sent as numeric strings and rejects non-numeric ones", async () => {
    expect((await patch({ availablePlates: ["45", "2.5"] })).status).toBe(200);
    expect((await patch({ availablePlates: ["heavy"] })).status).toBe(400);
  });

  it("rejects a non-positive height or bodyweight", async () => {
    expect((await patch({ heightCm: -5 })).status).toBe(400);
    expect((await patch({ bodyweight: 0 })).status).toBe(400);
  });

  it("rejects invalid PRP settings", async () => {
    expect((await patch({ dprEnabled: "yes" })).status).toBe(400);
    expect((await patch({ dprAggressiveness: "reckless" })).status).toBe(400);
    expect((await patch({ dprExperience: "elite" })).status).toBe(400);
    expect((await patch({ dprEquipmentIncrements: { anvil: { lb: 5 } } })).status).toBe(400);
    expect((await patch({ dprEquipmentIncrements: { barbell: { lb: -1 } } })).status).toBe(400);
    expect((await patch({ dprDefaultRepLow: 0 })).status).toBe(400);
    expect((await patch({ dprDefaultRepLow: 12, dprDefaultRepHigh: 8 })).status).toBe(400);
    expect((await patch({ dprPromptDismissedAt: "soon" })).status).toBe(400);
  });

  it("round-trips every PRP setting", async () => {
    const dismissedAt = "2026-09-20T12:00:00.000Z";
    const fields = {
      dprEnabled: true,
      dprAggressiveness: "aggressive",
      dprExperience: "intermediate",
      dprEquipmentIncrements: { barbell: { lb: 5 }, dumbbell: { kg: 2.5 } },
      dprDefaultRepLow: 5,
      dprDefaultRepHigh: 8,
      dprPromptDismissedAt: dismissedAt,
    };
    const response = await patch(fields);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(fields);
    expect(await (await GET()).json()).toMatchObject(fields);

    const cleared = await (await patch({ dprExperience: null, dprPromptDismissedAt: null })).json();
    expect(cleared.dprExperience).toBeNull();
    expect(cleared.dprPromptDismissedAt).toBeNull();
  });

  it("persists a valid patch and reflects it on the next read", async () => {
    const response = await patch({
      defaultBarWeight: 20,
      availablePlates: [20, 15, 10, 5, 2.5, 1.25],
      defaultRestSeconds: 120,
      colorScheme: "dark",
      accentColor: "blue",
      fontFamily: "serif",
      cardStyle: "glass",
      showPaceTracker: false,
      sex: "female",
      birthdate: "1990-06-15",
      heightCm: 170,
      bodyweight: 145,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.defaultBarWeight).toBe("20.00");
    expect(body.defaultRestSeconds).toBe(120);
    expect(body.colorScheme).toBe("dark");
    expect(body.accentColor).toBe("blue");
    expect(body.fontFamily).toBe("serif");
    expect(body.cardStyle).toBe("glass");
    expect(body.showPaceTracker).toBe(false);
    expect(body.sex).toBe("female");
    expect(body.birthdate).toBe("1990-06-15");
    expect(body.heightCm).toBe("170.0");
    expect(body.bodyweight).toBe("145.00");

    const again = await (await GET()).json();
    expect(again.defaultRestSeconds).toBe(120);
    expect(again.colorScheme).toBe("dark");
    expect(again.accentColor).toBe("blue");
    expect(again.fontFamily).toBe("serif");
    expect(again.cardStyle).toBe("glass");
    expect(again.showPaceTracker).toBe(false);
    expect(again.sex).toBe("female");
    expect(again.birthdate).toBe("1990-06-15");
    expect(again.heightCm).toBe("170.0");
    expect(again.bodyweight).toBe("145.00");
  });

  it("clears sex, birthdate, height and bodyweight when patched with null", async () => {
    await patch({ sex: "female", birthdate: "1990-06-15", heightCm: 170, bodyweight: 145 });

    const response = await patch({ sex: null, birthdate: null, heightCm: null, bodyweight: null });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sex).toBeNull();
    expect(body.birthdate).toBeNull();
    expect(body.heightCm).toBeNull();
    expect(body.bodyweight).toBeNull();
  });
});
