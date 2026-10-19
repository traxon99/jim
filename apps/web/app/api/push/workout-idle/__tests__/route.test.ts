import { resetTestDb } from "@/lib/test/test-db";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const ENDPOINT = "https://push.example/device-1";
const SESSION = "0192f3a0-0000-7000-8000-000000000001";

let claims: { sub: string; email: string } | null = { sub: USER_A, email: "a@example.com" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  }),
}));

const published: { url: string; body: unknown; notBefore: number }[] = [];
let signatureValid = true;
const verified: { url?: string }[] = [];
vi.mock("@upstash/qstash", () => ({
  Client: class {
    async publishJSON(request: { url: string; body: unknown; notBefore: number }) {
      published.push(request);
      return { messageId: `msg_${published.length}` };
    }
  },
  Receiver: class {
    async verify(request: { url?: string }) {
      verified.push(request);
      if (!signatureValid) throw new Error("bad signature");
      return true;
    }
  },
}));

const sent: { endpoint: string; payload: string }[] = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      sent.push({ endpoint: sub.endpoint, payload });
    },
  },
}));

const { POST, DELETE } = await import("../route");
const { POST: FIRE } = await import("../fire/route");

function start(body: unknown) {
  return POST(
    new Request("https://jim.example/api/push/workout-idle", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function fire(body: unknown, signature: string | null = "sig") {
  const headers = new Headers();
  if (signature) headers.set("upstash-signature", signature);
  return FIRE(
    new Request("https://jim.example/api/push/workout-idle/fire", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function activity(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION,
    lastActivityAt: minutesAgo(1),
    autoEndMinutes: 60,
    endpoint: ENDPOINT,
    ...overrides,
  };
}

function configure() {
  process.env.QSTASH_TOKEN = "token";
  process.env.QSTASH_CURRENT_SIGNING_KEY = "current";
  process.env.QSTASH_NEXT_SIGNING_KEY = "next";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
}

function sentTitles(): string[] {
  return sent.map((s) => (JSON.parse(s.payload) as { title: string }).title);
}

describe("POST /api/push/workout-idle validation", () => {
  it("rejects malformed bodies before anything else", async () => {
    expect((await start("{")).status).toBe(400);
    expect((await start(activity({ endpoint: undefined }))).status).toBe(400);
    expect((await start(activity({ autoEndMinutes: 5 }))).status).toBe(400);
  });

  it("503s when QStash isn't configured", async () => {
    process.env.QSTASH_TOKEN = "";
    expect((await start(activity())).status).toBe(503);
  });
});

describe("POST /api/push/workout-idle/fire authentication", () => {
  beforeEach(configure);

  it("rejects a missing or invalid signature and binds it to the URL", async () => {
    const body = {
      userId: USER_A,
      sessionId: SESSION,
      lastActivityAt: minutesAgo(0),
      stage: "remind",
    };
    expect((await fire(body, null)).status).toBe(401);
    signatureValid = false;
    expect((await fire(body)).status).toBe(401);
    signatureValid = true;
    verified.length = 0;
    expect((await fire({})).status).toBe(400);
    expect(verified[0]?.url).toBe("https://jim.example/api/push/workout-idle/fire");
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("workout idle push scheduling", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (${USER_A}, ${ENDPOINT}, 'p', 'a'), (${USER_B}, 'https://push.example/b', 'p', 'a')
    `;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  beforeEach(async () => {
    configure();
    claims = { sub: USER_A, email: "a@example.com" };
    published.length = 0;
    sent.length = 0;
    await admin`DELETE FROM workout_idle_pushes`;
    await admin`DELETE FROM sessions`;
  });

  it("404s for an endpoint that isn't one of the user's subscriptions", async () => {
    expect((await start(activity({ endpoint: "https://push.example/b" }))).status).toBe(404);
    expect(published).toHaveLength(0);
  });

  it("reminds 10 minutes after the last activity, then says the workout ended", async () => {
    const lastActivityAt = minutesAgo(1);
    expect((await start(activity({ lastActivityAt }))).status).toBe(204);
    expect(published).toHaveLength(1);
    expect(published[0].url).toBe("https://jim.example/api/push/workout-idle/fire");
    const last = new Date(lastActivityAt).getTime();
    expect(published[0].notBefore).toBe(Math.ceil((last + 10 * 60_000) / 1000));
    expect(published[0].body).toEqual({
      userId: USER_A,
      sessionId: SESSION,
      lastActivityAt,
      stage: "remind",
    });

    expect((await fire(published[0].body)).status).toBe(204);
    expect(sentTitles()).toEqual(["Still working out?"]);
    expect(JSON.parse(sent[0].payload).url).toBe(`/workout/${SESSION}`);
    // The reminder schedules the "ended" push for the auto-end time.
    expect(published).toHaveLength(2);
    expect(published[1].notBefore).toBe(Math.ceil((last + 60 * 60_000) / 1000));
    expect(published[1].body).toMatchObject({ stage: "end" });

    expect((await fire(published[1].body)).status).toBe(204);
    expect(sentTitles()).toEqual(["Still working out?", "Workout ended"]);
    expect(JSON.parse(sent[1].payload).body).toContain("1 hr");

    // Consumed: a redelivery sends nothing more.
    expect((await fire(published[1].body)).status).toBe(204);
    expect(sent).toHaveLength(2);
  });

  it("doesn't queue the same schedule twice", async () => {
    const body = activity();
    expect((await start(body)).status).toBe(204);
    expect((await start(body)).status).toBe(204);
    expect(published).toHaveLength(1);
  });

  it("only reminds with auto-end off", async () => {
    await start(activity({ autoEndMinutes: null }));
    await fire(published[0].body);
    expect(sentTitles()).toEqual(["Still working out?"]);
    expect(published).toHaveLength(1);
  });

  it("sends nothing once a newer set has moved the last activity", async () => {
    await start(activity({ lastActivityAt: minutesAgo(3) }));
    await start(activity({ lastActivityAt: minutesAgo(1) }));
    const [stale, current] = published;
    expect((await fire(stale.body)).status).toBe(204);
    expect(sent).toHaveLength(0);
    expect((await fire(current.body)).status).toBe(204);
    expect(sent).toHaveLength(1);
  });

  it("sends nothing after the workout is finished", async () => {
    await start(activity());
    expect((await DELETE()).status).toBe(204);
    expect((await fire(published[0].body)).status).toBe(204);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing for a workout the server already has as ended", async () => {
    await start(activity());
    await admin`
      INSERT INTO sessions (id, user_id, started_at, ended_at, device_id)
      VALUES (${SESSION}, ${USER_A}, now() - interval '30 minutes', now(), 'phone')
    `;
    expect((await fire(published[0].body)).status).toBe(204);
    expect(sent).toHaveLength(0);
    const rows = await admin`SELECT 1 FROM workout_idle_pushes`;
    expect(rows).toHaveLength(0);
  });

  it("skips a reminder that's already late and goes straight to the end", async () => {
    await start(activity({ lastActivityAt: minutesAgo(30) }));
    expect(published).toHaveLength(1);
    expect(published[0].body).toMatchObject({ stage: "end" });
  });

  it("can't fire another user's pushes", async () => {
    await start(activity());
    claims = { sub: USER_B, email: "b@example.com" };
    await DELETE();
    const forged = { ...(published[0].body as object), userId: USER_B };
    expect((await fire(forged)).status).toBe(204);
    expect(sent).toHaveLength(0);
    expect((await fire(published[0].body)).status).toBe(204);
    expect(sent).toHaveLength(1);
  });
});
