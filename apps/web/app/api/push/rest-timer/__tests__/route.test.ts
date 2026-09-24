import { resetTestDb } from "@/lib/test/test-db";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const ENDPOINT = "https://push.example/device-1";

let claims: { sub: string; email: string } | null = { sub: USER_A, email: "a@example.com" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  }),
}));

const published: { url: string; body: unknown; notBefore: number }[] = [];
let signatureValid = true;
vi.mock("@upstash/qstash", () => ({
  Client: class {
    async publishJSON(request: { url: string; body: unknown; notBefore: number }) {
      published.push(request);
      return { messageId: `msg_${published.length}` };
    }
  },
  Receiver: class {
    async verify() {
      if (!signatureValid) throw new Error("bad signature");
      return true;
    }
  },
}));

const sent: { endpoint: string; payload: string }[] = [];
let sendError: { statusCode: number } | null = null;
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (sendError) throw sendError;
      sent.push({ endpoint: sub.endpoint, payload });
    },
  },
}));

const { POST, DELETE } = await import("../route");
const { POST: FIRE } = await import("../fire/route");

function start(body: unknown) {
  return POST(
    new Request("https://jim.example/api/push/rest-timer", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function fire(body: unknown, signature: string | null = "sig") {
  const headers = new Headers();
  if (signature) headers.set("upstash-signature", signature);
  return FIRE(
    new Request("https://jim.example/api/push/rest-timer/fire", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function inSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function configure() {
  process.env.QSTASH_TOKEN = "token";
  process.env.QSTASH_CURRENT_SIGNING_KEY = "current";
  process.env.QSTASH_NEXT_SIGNING_KEY = "next";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
}

describe("POST /api/push/rest-timer validation", () => {
  it("rejects malformed bodies before anything else", async () => {
    expect((await start("{")).status).toBe(400);
    expect((await start({ endsAt: inSeconds(90) })).status).toBe(400);
    expect((await start({ endsAt: inSeconds(-600), endpoint: ENDPOINT })).status).toBe(400);
  });

  it("503s when QStash isn't configured, so the client falls back", async () => {
    process.env.QSTASH_TOKEN = "";
    expect((await start({ endsAt: inSeconds(90), endpoint: ENDPOINT })).status).toBe(503);
  });
});

describe("POST /api/push/rest-timer/fire authentication", () => {
  beforeEach(configure);

  it("rejects a missing or invalid QStash signature", async () => {
    expect((await fire({ userId: USER_A, endsAt: inSeconds(0) }, null)).status).toBe(401);
    signatureValid = false;
    expect((await fire({ userId: USER_A, endsAt: inSeconds(0) })).status).toBe(401);
    signatureValid = true;
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("rest timer push scheduling", () => {
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

  beforeEach(() => {
    configure();
    claims = { sub: USER_A, email: "a@example.com" };
    published.length = 0;
    sent.length = 0;
    sendError = null;
  });

  it("401s without a session", async () => {
    claims = null;
    expect((await start({ endsAt: inSeconds(90), endpoint: ENDPOINT })).status).toBe(401);
  });

  it("404s for an endpoint that isn't one of the user's subscriptions", async () => {
    const other = { endsAt: inSeconds(90), endpoint: "https://push.example/b" };
    expect((await start(other)).status).toBe(404);
    expect(published).toHaveLength(0);
  });

  it("schedules a QStash callback for the rest's end and pushes to that device when it fires", async () => {
    const endsAt = inSeconds(90);
    expect((await start({ endsAt, endpoint: ENDPOINT })).status).toBe(204);

    expect(published).toHaveLength(1);
    expect(published[0].url).toBe("https://jim.example/api/push/rest-timer/fire");
    expect(published[0].notBefore).toBe(Math.ceil(new Date(endsAt).getTime() / 1000));
    expect(published[0].body).toEqual({ userId: USER_A, endsAt });

    expect((await fire(published[0].body)).status).toBe(204);
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe(ENDPOINT);
    expect(JSON.parse(sent[0].payload)).toMatchObject({ title: "Rest complete" });

    // Consumed: a QStash redelivery doesn't push twice.
    expect((await fire(published[0].body)).status).toBe(204);
    expect(sent).toHaveLength(1);
  });

  it("sends nothing for a rest that was restarted", async () => {
    await start({ endsAt: inSeconds(60), endpoint: ENDPOINT });
    await start({ endsAt: inSeconds(120), endpoint: ENDPOINT });
    const [stale, current] = published;

    expect((await fire(stale.body)).status).toBe(204);
    expect(sent).toHaveLength(0);
    expect((await fire(current.body)).status).toBe(204);
    expect(sent).toHaveLength(1);
  });

  it("sends nothing for a rest that was skipped", async () => {
    await start({ endsAt: inSeconds(60), endpoint: ENDPOINT });
    expect((await DELETE()).status).toBe(204);
    expect((await fire(published[0].body)).status).toBe(204);
    expect(sent).toHaveLength(0);
  });

  it("can't cancel or fire another user's rest", async () => {
    await start({ endsAt: inSeconds(60), endpoint: ENDPOINT });
    claims = { sub: USER_B, email: "b@example.com" };
    await DELETE();
    const forged = { ...(published[0].body as object), userId: USER_B };
    expect((await fire(forged)).status).toBe(204);
    expect(sent).toHaveLength(0);
    expect((await fire(published[0].body)).status).toBe(204);
    expect(sent).toHaveLength(1);
  });

  it("forgets a subscription the push service says is gone", async () => {
    await start({ endsAt: inSeconds(60), endpoint: ENDPOINT });
    sendError = { statusCode: 410 };
    expect((await fire(published[0].body)).status).toBe(204);
    const rows = await admin`SELECT 1 FROM push_subscriptions WHERE endpoint = ${ENDPOINT}`;
    expect(rows).toHaveLength(0);
  });
});
