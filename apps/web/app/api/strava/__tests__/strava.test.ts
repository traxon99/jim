import { decryptToken, encryptToken, signState } from "@/lib/strava/crypto";
import { resetTestDb } from "@/lib/test/test-db";
import { uuidv7 } from "@jim/core";
import type postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const KEY = "test-token-key";
const ATHLETE = 424242;

let claimsSub: string | null = USER_A;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: claimsSub ? { claims: { sub: claimsSub } } : null }),
    },
  }),
}));

const published: { url: string; body: unknown; delay?: number }[] = [];
let signatureValid = true;
vi.mock("@upstash/qstash", () => ({
  Client: class {
    async publishJSON(request: { url: string; body: unknown; delay?: number }) {
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

// A fake Strava at the network boundary: nothing here ever reaches strava.com.
interface FakeStrava {
  calls: { method: string; path: string; token: string | null; body: URLSearchParams }[];
  activities: Record<string, string>[];
  /** Access tokens Strava currently accepts. */
  validTokens: Set<string>;
  createStatus: number;
  deauthorized: number;
  tokenCounter: number;
}
let strava: FakeStrava;

function resetStrava() {
  strava = {
    calls: [],
    activities: [],
    validTokens: new Set(["access-1"]),
    createStatus: 201,
    deauthorized: 0,
    tokenCounter: 1,
  };
}

function fakeFetch(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  if (url.hostname !== "www.strava.com") throw new Error(`Unexpected host ${url.hostname}`);
  const method = init?.method ?? "GET";
  const auth = (init?.headers as Record<string, string> | undefined)?.authorization ?? null;
  const token = auth?.replace("Bearer ", "") ?? null;
  const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
  strava.calls.push({ method, path: url.pathname, token, body });
  const json = (value: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(value), { status }));

  if (url.pathname === "/oauth/token") {
    if (body.get("grant_type") === "authorization_code") {
      if (body.get("code") !== "good-code") return json({ message: "bad" }, 400);
      strava.validTokens.add("access-1");
      return json({
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_at: Math.floor(Date.now() / 1000) + 21600,
        athlete: { id: ATHLETE, firstname: "Sam", lastname: "Lifter" },
      });
    }
    strava.tokenCounter++;
    const access = `access-${strava.tokenCounter}`;
    strava.validTokens.add(access);
    return json({
      access_token: access,
      refresh_token: `refresh-${strava.tokenCounter}`,
      expires_at: Math.floor(Date.now() / 1000) + 21600,
    });
  }
  if (!token || !strava.validTokens.has(token))
    return json({ message: "Authorization Error" }, 401);
  if (url.pathname === "/oauth/deauthorize") {
    strava.deauthorized++;
    return json({ access_token: token });
  }
  if (url.pathname === "/api/v3/athlete") return json({ id: ATHLETE });
  if (url.pathname === "/api/v3/activities" && method === "POST") {
    if (strava.createStatus !== 201) return json({ message: "nope" }, strava.createStatus);
    strava.activities.push(Object.fromEntries(body.entries()));
    return json({ id: 9000 + strava.activities.length }, 201);
  }
  return json({}, 404);
}

const connectRoute = await import("../connect/route");
const callbackRoute = await import("../callback/route");
const connectionRoute = await import("../connection/route");
const webhookRoute = await import("../webhook/route");
const postRoute = await import("../post/route");
const activitiesRoute = await import("../activities/route");
const retryRoute = await import("../retry/route");
const syncPush = await import("../../sync/push/route");

const ORIGIN = "https://jim.example";
const SESSION = uuidv7();

function configure() {
  process.env.STRAVA_CLIENT_ID = "client-id";
  process.env.STRAVA_CLIENT_SECRET = "client-secret";
  process.env.STRAVA_TOKEN_KEY = KEY;
  process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = "verify-me";
  process.env.QSTASH_TOKEN = "token";
  process.env.QSTASH_CURRENT_SIGNING_KEY = "current";
  process.env.QSTASH_NEXT_SIGNING_KEY = "next";
}

function unconfigure() {
  for (const name of [
    "STRAVA_CLIENT_ID",
    "STRAVA_CLIENT_SECRET",
    "STRAVA_TOKEN_KEY",
    "STRAVA_WEBHOOK_VERIFY_TOKEN",
  ]) {
    delete process.env[name];
  }
}

function postJob(body: unknown, signature: string | null = "sig") {
  const headers = new Headers();
  if (signature) headers.set("upstash-signature", signature);
  return postRoute.POST(
    new Request(`${ORIGIN}/api/strava/post`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe("Strava without credentials", () => {
  beforeEach(() => {
    unconfigure();
    claimsSub = USER_A;
  });

  it("reports Strava as not set up, and won't start a connection", async () => {
    const status = await connectionRoute.GET();
    expect(await status.json()).toMatchObject({ configured: false, connected: false });
    const connect = await connectRoute.GET(new Request(`${ORIGIN}/api/strava/connect`));
    expect(connect.status).toBe(503);
    expect(await connect.text()).not.toMatch(/STRAVA_/);
  });

  it("answers 401 JSON when signed out", async () => {
    claimsSub = null;
    configure();
    expect((await connectionRoute.GET()).status).toBe(401);
    expect((await connectRoute.GET(new Request(`${ORIGIN}/api/strava/connect`))).status).toBe(401);
  });
});

describe("Strava token crypto", () => {
  it("round-trips and refuses another key or a tampered value", () => {
    const sealed = encryptToken("secret-token", KEY);
    expect(sealed).not.toContain("secret-token");
    expect(decryptToken(sealed, KEY)).toBe("secret-token");
    expect(decryptToken(sealed, "other-key")).toBeNull();
    expect(decryptToken(sealed.replace(/\.[^.]*$/, ".AAAA"), KEY)).toBeNull();
    expect(encryptToken("secret-token", KEY)).not.toBe(sealed);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("Strava sync", () => {
  let admin: postgres.Sql;
  let exerciseId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO public.users (id, email, time_zone) VALUES (${USER_A}, 'a@example.com', 'America/Denver'), (${USER_B}, 'b@example.com', NULL)`;
    const [exercise] = await admin<{ id: string }[]>`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
      VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}')
      RETURNING id
    `;
    // biome-ignore lint/style/noNonNullAssertion: just inserted
    exerciseId = exercise!.id;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  beforeEach(async () => {
    configure();
    resetStrava();
    vi.stubGlobal("fetch", fakeFetch);
    claimsSub = USER_A;
    signatureValid = true;
    published.length = 0;
    await admin`DELETE FROM strava_activities`;
    await admin`DELETE FROM strava_connections`;
    await admin`DELETE FROM sessions`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function connect(
    overrides: { expiresInMs?: number; autoPost?: boolean; createdAt?: Date } = {},
  ) {
    const expires = new Date(Date.now() + (overrides.expiresInMs ?? 3_600_000)).toISOString();
    await admin`
      INSERT INTO strava_connections
        (user_id, athlete_id, athlete_name, access_token_enc, refresh_token_enc, expires_at, auto_post, created_at)
      VALUES (${USER_A}, ${String(ATHLETE)}, 'Sam Lifter',
        ${encryptToken("access-1", KEY)}, ${encryptToken("refresh-1", KEY)}, ${expires},
        ${overrides.autoPost ?? true}, ${(overrides.createdAt ?? new Date(Date.now() - 86_400_000)).toISOString()})
    `;
  }

  async function finishedSession(
    id: string,
    options: { endedAt?: Date; stravaPost?: boolean | null } = {},
  ) {
    const startedAt = new Date(Date.now() - 3_600_000).toISOString();
    await admin`
      INSERT INTO sessions (id, user_id, name, started_at, ended_at, strava_post, device_id)
      VALUES (${id}, ${USER_A}, 'Push Day', ${startedAt}, ${(options.endedAt ?? new Date()).toISOString()}, ${options.stravaPost ?? null}, 'd')
    `;
    const seId = uuidv7();
    await admin`
      INSERT INTO session_exercises (id, user_id, session_id, exercise_id, position, device_id)
      VALUES (${seId}, ${USER_A}, ${id}, ${exerciseId}, 0, 'd')
    `;
    await admin`
      INSERT INTO sets (id, user_id, session_exercise_id, set_index, kind, weight, reps)
      VALUES (${uuidv7()}, ${USER_A}, ${seId}, 0, 'warmup', 95, 10),
             (${uuidv7()}, ${USER_A}, ${seId}, 1, 'working', 185, 5)
    `;
  }

  async function queue(sessionId: string) {
    await admin`INSERT INTO strava_activities (session_id, user_id) VALUES (${sessionId}, ${USER_A})`;
  }

  describe("connecting", () => {
    it("sends the user to Strava's own sign-in with a signed state", async () => {
      const response = await connectRoute.GET(new Request(`${ORIGIN}/api/strava/connect`));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location") ?? "");
      expect(location.origin + location.pathname).toBe("https://www.strava.com/oauth/authorize");
      expect(location.searchParams.get("scope")).toBe("activity:write");
      expect(location.searchParams.get("client_id")).toBe("client-id");
      expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/strava/callback`);
      expect(location.searchParams.get("state")).toContain(USER_A);
    });

    it("stores an encrypted connection from the callback", async () => {
      const state = signState(USER_A, KEY);
      const response = await callbackRoute.GET(
        new Request(
          `${ORIGIN}/api/strava/callback?code=good-code&scope=read,activity:write&state=${state}`,
        ),
      );
      expect(response.headers.get("location")).toBe(
        `${ORIGIN}/profile/settings/account?strava=connected`,
      );
      const [row] = await admin<
        {
          athlete_id: string;
          athlete_name: string;
          access_token_enc: string;
          refresh_token_enc: string;
          auto_post: boolean;
        }[]
      >`SELECT * FROM strava_connections WHERE user_id = ${USER_A}`;
      expect(row?.athlete_id).toBe(String(ATHLETE));
      expect(row?.athlete_name).toBe("Sam Lifter");
      expect(row?.auto_post).toBe(true);
      expect(row?.access_token_enc).not.toContain("access-1");
      expect(decryptToken(row?.access_token_enc ?? "", KEY)).toBe("access-1");
      expect(decryptToken(row?.refresh_token_enc ?? "", KEY)).toBe("refresh-1");

      expect(await (await connectionRoute.GET()).json()).toEqual({
        configured: true,
        connected: true,
        athleteName: "Sam Lifter",
        autoPost: true,
      });
    });

    it("refuses a state signed for another user, a missing scope and a denied sign-in", async () => {
      const forged = signState(USER_B, KEY);
      const cb = (query: string) =>
        callbackRoute.GET(new Request(`${ORIGIN}/api/strava/callback?${query}`));
      expect(
        (await cb(`code=good-code&scope=activity:write&state=${forged}`)).headers.get("location"),
      ).toContain("strava=error");
      const state = signState(USER_A, KEY);
      expect(
        (await cb(`code=good-code&scope=read&state=${state}`)).headers.get("location"),
      ).toContain("strava=denied");
      expect((await cb("error=access_denied")).headers.get("location")).toContain("strava=denied");
      expect(
        (await cb(`code=bad-code&scope=activity:write&state=${state}`)).headers.get("location"),
      ).toContain("strava=error");
      const rows = await admin`SELECT 1 FROM strava_connections`;
      expect(rows).toHaveLength(0);
    });
  });

  describe("settings", () => {
    it("switches auto-post and disconnects, telling Strava", async () => {
      await connect();
      const patch = await connectionRoute.PATCH(
        new Request(`${ORIGIN}/api/strava/connection`, {
          method: "PATCH",
          body: JSON.stringify({ autoPost: false }),
        }),
      );
      expect(patch.status).toBe(204);
      expect((await (await connectionRoute.GET()).json()).autoPost).toBe(false);

      expect((await connectionRoute.DELETE()).status).toBe(204);
      expect(strava.deauthorized).toBe(1);
      expect((await (await connectionRoute.GET()).json()).connected).toBe(false);
      expect(await admin`SELECT 1 FROM strava_connections`).toHaveLength(0);
    });

    it("forgets the tokens even when Strava can't be reached", async () => {
      await connect();
      vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
      expect((await connectionRoute.DELETE()).status).toBe(204);
      expect(await admin`SELECT 1 FROM strava_connections`).toHaveLength(0);
    });
  });

  describe("posting a finished workout", () => {
    it("posts once and records the activity, with warm-ups left out", async () => {
      await connect();
      await finishedSession(SESSION);
      await queue(SESSION);

      expect((await postJob({ userId: USER_A, sessionId: SESSION })).status).toBe(204);
      expect(strava.activities).toHaveLength(1);
      expect(strava.activities[0]).toMatchObject({
        name: "Push Day",
        sport_type: "WeightTraining",
      });
      expect(strava.activities[0]?.description).toContain("Bench Press: 185×5");
      expect(strava.activities[0]?.description).not.toContain("95");
      expect(strava.calls.find((c) => c.path === "/api/v3/activities")?.token).toBe("access-1");

      const [row] = await admin<{ status: string; strava_activity_id: string }[]>`
        SELECT status, strava_activity_id FROM strava_activities WHERE session_id = ${SESSION}`;
      expect(row).toEqual({ status: "posted", strava_activity_id: "9001" });

      // A redelivery posts nothing more.
      expect((await postJob({ userId: USER_A, sessionId: SESSION })).status).toBe(204);
      expect(strava.activities).toHaveLength(1);
    });

    it("posts once even when deliveries arrive together", async () => {
      await connect();
      await finishedSession(SESSION);
      await queue(SESSION);
      await Promise.all([1, 2, 3].map(() => postJob({ userId: USER_A, sessionId: SESSION })));
      expect(strava.activities).toHaveLength(1);
    });

    it("refreshes an expiring token before posting and stores the new one", async () => {
      await connect({ expiresInMs: 60_000 });
      await finishedSession(SESSION);
      await queue(SESSION);
      await postJob({ userId: USER_A, sessionId: SESSION });
      expect(strava.calls.some((c) => c.path === "/oauth/token")).toBe(true);
      expect(strava.calls.find((c) => c.path === "/api/v3/activities")?.token).toBe("access-2");
      const [row] = await admin<{ access_token_enc: string; expires_at: string }[]>`
        SELECT access_token_enc, expires_at FROM strava_connections WHERE user_id = ${USER_A}`;
      expect(decryptToken(row?.access_token_enc ?? "", KEY)).toBe("access-2");
      expect(new Date(row?.expires_at ?? 0).getTime() - Date.now()).toBeGreaterThan(3_600_000);
    });

    it("rejects an unsigned or invalidly signed call", async () => {
      await connect();
      await finishedSession(SESSION);
      await queue(SESSION);
      expect((await postJob({ userId: USER_A, sessionId: SESSION }, null)).status).toBe(401);
      signatureValid = false;
      expect((await postJob({ userId: USER_A, sessionId: SESSION })).status).toBe(401);
      expect(strava.activities).toHaveLength(0);
      expect((await admin`SELECT status FROM strava_activities`)[0]?.status).toBe("queued");
    });

    it("skips a workout the lifter turned off after it was queued", async () => {
      await connect();
      await finishedSession(SESSION, { stravaPost: false });
      await queue(SESSION);
      expect((await postJob({ userId: USER_A, sessionId: SESSION })).status).toBe(204);
      expect(strava.activities).toHaveLength(0);
      expect(await admin`SELECT 1 FROM strava_activities`).toHaveLength(0);
    });

    it("leaves a rate-limited post failed and asks QStash to retry, then posts on the retry", async () => {
      await connect();
      await finishedSession(SESSION);
      await queue(SESSION);
      strava.createStatus = 429;
      expect((await postJob({ userId: USER_A, sessionId: SESSION })).status).toBe(503);
      expect((await admin`SELECT status FROM strava_activities`)[0]?.status).toBe("failed");

      strava.createStatus = 201;
      expect((await postJob({ userId: USER_A, sessionId: SESSION })).status).toBe(204);
      expect(strava.activities).toHaveLength(1);
      expect((await admin`SELECT status FROM strava_activities`)[0]?.status).toBe("posted");
    });

    it("disconnects when Strava says access was revoked", async () => {
      await connect();
      await finishedSession(SESSION);
      await queue(SESSION);
      strava.validTokens.clear();
      expect((await postJob({ userId: USER_A, sessionId: SESSION })).status).toBe(204);
      expect(await admin`SELECT 1 FROM strava_connections`).toHaveLength(0);
      expect((await admin`SELECT status FROM strava_activities`)[0]?.status).toBe("failed");
    });

    it("retries a failed post from the phone", async () => {
      await connect();
      await finishedSession(SESSION);
      await queue(SESSION);
      await admin`UPDATE strava_activities SET status = 'failed', error = 'x'`;
      const retry = await retryRoute.POST(
        new Request(`${ORIGIN}/api/strava/retry`, {
          method: "POST",
          body: JSON.stringify({ sessionId: SESSION }),
        }),
      );
      expect(retry.status).toBe(204);
      expect(published).toHaveLength(1);
      expect(published[0]?.body).toEqual({ userId: USER_A, sessionId: SESSION });
      expect((await admin`SELECT status FROM strava_activities`)[0]?.status).toBe("queued");
      // Only a failed post can be retried.
      const again = await retryRoute.POST(
        new Request(`${ORIGIN}/api/strava/retry`, {
          method: "POST",
          body: JSON.stringify({ sessionId: SESSION }),
        }),
      );
      expect(again.status).toBe(404);
    });
  });

  describe("webhook", () => {
    function event(body: unknown) {
      return webhookRoute.POST(
        new Request(`${ORIGIN}/api/strava/webhook`, { method: "POST", body: JSON.stringify(body) }),
      );
    }
    const deauth = {
      object_type: "athlete",
      aspect_type: "update",
      owner_id: ATHLETE,
      updates: { authorized: "false" },
    };

    it("answers Strava's handshake only with the verify token", async () => {
      const handshake = (token: string) =>
        webhookRoute.GET(
          new Request(
            `${ORIGIN}/api/strava/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=abc`,
          ),
        );
      const ok = await handshake("verify-me");
      expect(await ok.json()).toEqual({ "hub.challenge": "abc" });
      expect((await handshake("wrong")).status).toBe(403);
    });

    it("deletes the connection when the athlete revoked access", async () => {
      await connect();
      strava.validTokens.clear();
      expect((await event(deauth)).status).toBe(200);
      expect(await admin`SELECT 1 FROM strava_connections`).toHaveLength(0);
    });

    it("ignores a deauthorization event Strava doesn't back up", async () => {
      await connect();
      expect((await event(deauth)).status).toBe(200);
      expect(await admin`SELECT 1 FROM strava_connections`).toHaveLength(1);
      expect((await event({ ...deauth, object_type: "activity" })).status).toBe(200);
      expect((await event("not an object")).status).toBe(200);
      expect(await admin`SELECT 1 FROM strava_connections`).toHaveLength(1);
    });
  });

  describe("queueing from sync", () => {
    function pushSession(id: string, fields: Record<string, unknown> = {}) {
      const now = new Date().toISOString();
      return syncPush.POST(
        new Request(`${ORIGIN}/api/sync/push`, {
          method: "POST",
          body: JSON.stringify({
            mutations: [
              {
                id: uuidv7(),
                table: "sessions",
                entity: {
                  id,
                  name: "Push Day",
                  startedAt: new Date(Date.now() - 3_600_000).toISOString(),
                  endedAt: now,
                  updatedAt: now,
                  deviceId: "d",
                  deletedAt: null,
                  ...fields,
                },
              },
            ],
          }),
        }),
      );
    }

    it("queues and publishes a finished workout once, however often it syncs", async () => {
      await connect();
      expect((await pushSession(SESSION)).status).toBe(200);
      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({
        url: `${ORIGIN}/api/strava/post`,
        body: { userId: USER_A, sessionId: SESSION },
      });
      expect(published[0]?.delay).toBeGreaterThan(0);
      expect((await admin`SELECT status FROM strava_activities`)[0]?.status).toBe("queued");

      await pushSession(SESSION, { notes: "edited" });
      expect(published).toHaveLength(1);
    });

    it("queues nothing for an unfinished or deleted workout, or without a connection", async () => {
      await pushSession(uuidv7());
      expect(published).toHaveLength(0);

      await connect();
      await pushSession(uuidv7(), { endedAt: null });
      await pushSession(uuidv7(), { deletedAt: new Date().toISOString() });
      expect(published).toHaveLength(0);
      expect(await admin`SELECT 1 FROM strava_activities`).toHaveLength(0);
    });

    it("doesn't back-post workouts that ended before connecting", async () => {
      await connect({ createdAt: new Date(Date.now() + 60_000) });
      await pushSession(SESSION);
      expect(published).toHaveLength(0);
    });

    it("follows the Settings switch and the workout's own choice", async () => {
      await connect({ autoPost: false });
      await pushSession(SESSION);
      expect(published).toHaveLength(0);

      const manual = uuidv7();
      await pushSession(manual, { stravaPost: true });
      expect(published).toHaveLength(1);

      await admin`UPDATE strava_connections SET auto_post = true`;
      const skipped = uuidv7();
      await pushSession(skipped, { stravaPost: false });
      expect(published).toHaveLength(1);
    });

    it("never posts without Strava configured", async () => {
      await connect();
      unconfigure();
      await pushSession(SESSION);
      expect(published).toHaveLength(0);
    });

    it("keeps the row after deletion so a restore doesn't post again", async () => {
      await connect();
      await pushSession(SESSION);
      await admin`UPDATE strava_activities SET status = 'posted', strava_activity_id = '9001'`;
      await pushSession(SESSION, { deletedAt: new Date().toISOString() });
      await pushSession(SESSION, {
        deletedAt: null,
        updatedAt: new Date(Date.now() + 5000).toISOString(),
      });
      expect(published).toHaveLength(1);
      expect((await admin`SELECT status FROM strava_activities`)[0]?.status).toBe("posted");
    });

    it("reports post status for the workouts on screen", async () => {
      await connect();
      await pushSession(SESSION);
      const response = await activitiesRoute.GET(
        new Request(`${ORIGIN}/api/strava/activities?session_ids=${SESSION},${uuidv7()}`),
      );
      expect(await response.json()).toEqual({
        activities: { [SESSION]: { status: "queued", activityId: null } },
      });
      expect(
        (await activitiesRoute.GET(new Request(`${ORIGIN}/api/strava/activities?session_ids=nope`)))
          .status,
      ).toBe(400);
      claimsSub = USER_B;
      const other = await activitiesRoute.GET(
        new Request(`${ORIGIN}/api/strava/activities?session_ids=${SESSION}`),
      );
      expect(await other.json()).toEqual({ activities: {} });
    });
  });
});
