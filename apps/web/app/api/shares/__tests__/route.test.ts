import { resetTestDb } from "@/lib/test/test-db";
import { SHARE_SNAPSHOT_VERSION, type ShareSnapshot } from "@jim/core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

const claims = { sub: USER_A, email: "alice@example.com" };
function signInAs(userId: string, email: string) {
  claims.sub = userId;
  claims.email = email;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims } }) },
  }),
}));

const shares = await import("../route");
const share = await import("../[id]/route");

const snapshot: ShareSnapshot = {
  version: SHARE_SNAPSHOT_VERSION,
  kind: "routine",
  units: "lb",
  exercises: [
    {
      slug: "bench-press",
      name: "Bench Press",
      global: true,
      trackingType: "weight_reps",
      category: "strength",
      equipment: "barbell",
      mechanic: "compound",
      force: "push",
      level: "beginner",
      primaryMuscles: ["chest"],
      secondaryMuscles: [],
      instructions: [],
    },
  ],
  routines: [
    {
      name: "Push Day",
      notes: null,
      kind: "strength",
      iconShape: "star",
      iconColor: "teal",
      warmupMinutes: null,
      warmupRoutine: null,
      items: [
        {
          exercise: 0,
          supersetGroup: null,
          targetSets: 3,
          targetRepsLow: 5,
          targetRepsHigh: 5,
          targetRestSeconds: 180,
          targetDurationSeconds: null,
          targetWeight: 135,
          notes: null,
        },
      ],
    },
  ],
  program: null,
};

function post(body: unknown) {
  return shares.POST(
    new Request("http://localhost/api/shares", { method: "POST", body: JSON.stringify(body) }),
  );
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function open(id: string) {
  return share.GET(new Request(`http://localhost/api/shares/${id}`), context(id));
}

function revoke(id: string) {
  return share.DELETE(
    new Request(`http://localhost/api/shares/${id}`, { method: "DELETE" }),
    context(id),
  );
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/shares (issue #254)", () => {
  let admin: postgres.Sql;
  let linkId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com')`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("creates a link from a valid snapshot only", async () => {
    signInAs(USER_A, "alice@example.com");
    expect((await post({ snapshot: { ...snapshot, version: 99 } })).status).toBe(400);
    expect((await post({})).status).toBe(400);

    const created = await post({ snapshot });
    expect(created.status).toBe(200);
    linkId = (await created.json()).id;
    expect(linkId).toMatch(/^[0-9a-f-]{36}$/);

    const listed = await (await shares.GET()).json();
    expect(listed.links).toMatchObject([{ id: linkId, kind: "routine", name: "Push Day" }]);
  });

  it("opens for another user, who can't see or revoke the sharer's links", async () => {
    signInAs(USER_B, "bob@example.com");
    const opened = await open(linkId);
    expect(await opened.json()).toMatchObject({
      id: linkId,
      kind: "routine",
      name: "Push Day",
      username: "alice",
      isMine: false,
      snapshot,
    });
    expect((await (await shares.GET()).json()).links).toEqual([]);
    expect((await revoke(linkId)).status).toBe(404);
    expect((await open(linkId)).status).toBe(200);
  });

  it("stops working once the sharer revokes it", async () => {
    signInAs(USER_A, "alice@example.com");
    expect((await open(linkId)).status).toBe(200);
    expect((await revoke(linkId)).status).toBe(200);

    signInAs(USER_B, "bob@example.com");
    expect((await open(linkId)).status).toBe(404);
    expect((await open("not-a-uuid")).status).toBe(404);
  });
});
