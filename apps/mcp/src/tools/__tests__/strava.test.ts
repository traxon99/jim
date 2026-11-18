import type postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { logPastWorkout } from "../log-past-workout.js";
import { getStravaStatus, postWorkoutToStrava } from "../strava.js";
import { upsertExercise } from "../upsert-exercise.js";

const published: { url: string; headers: Record<string, string>; body: unknown }[] = [];

describe.skipIf(!process.env.TEST_DATABASE_URL)("Strava tools (#836)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let otherContext: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    otherContext = testContext(USER_B);
    await upsertExercise(context, {
      name: "Strava Press",
      trackingType: "weight_reps",
      primaryMuscles: ["chest"],
    } as never);
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
    await otherContext.db.$client.end();
  });

  beforeEach(async () => {
    published.length = 0;
    vi.stubEnv("QSTASH_TOKEN", "token");
    vi.stubEnv("JIM_WEB_URL", "https://jim.example");
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      published.push({
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)),
      });
      return new Response("{}", { status: 200 });
    });
    await admin`DELETE FROM strava_activities`;
    await admin`DELETE FROM strava_connections`;
    await admin`DELETE FROM sessions`;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function connect(autoPost = true) {
    await admin`
      INSERT INTO strava_connections (user_id, athlete_id, athlete_name, access_token_enc, refresh_token_enc, expires_at, auto_post)
      VALUES (${USER_A}, '1', 'Sam Lifter', 'a', 'r', now() + interval '1 hour', ${autoPost})`;
  }

  const workout = {
    startedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    durationMinutes: 45,
    exercises: [{ exercise: "Strava Press", sets: [{ weight: 100, reps: 5 }] }],
  };

  it("queues a workout logged through Claude, even one from last week", async () => {
    await connect();
    const logged = await logPastWorkout(context, workout);
    expect(published).toHaveLength(1);
    expect(published[0]?.url).toBe(
      "https://qstash.upstash.io/v2/publish/https://jim.example/api/strava/post",
    );
    expect(published[0]?.body).toEqual({ userId: USER_A, sessionId: logged.id });
    expect(published[0]?.headers.authorization).toBe("Bearer token");
    const rows = await admin`SELECT status FROM strava_activities WHERE session_id = ${logged.id}`;
    expect(rows[0]?.status).toBe("queued");
  });

  it("posts nothing for a preview, without a connection, or with auto-post off", async () => {
    await logPastWorkout(context, workout);
    expect(published).toHaveLength(0);

    await connect();
    await logPastWorkout(context, { ...workout, dryRun: true });
    expect(published).toHaveLength(0);

    await admin`UPDATE strava_connections SET auto_post = false`;
    await logPastWorkout(context, workout);
    expect(published).toHaveLength(0);
    expect(await admin`SELECT 1 FROM strava_activities`).toHaveLength(0);
  });

  it("never lets a Strava problem fail the log", async () => {
    await connect();
    vi.stubGlobal("fetch", async () => new Response("no", { status: 500 }));
    const logged = await logPastWorkout(context, workout);
    expect(logged.id).toBeTruthy();
  });

  it("reports the connection and a workout's post status", async () => {
    expect(await getStravaStatus(context, {})).toMatchObject({ connected: false, autoPost: false });
    await connect();
    const logged = await logPastWorkout(context, workout);
    await admin`UPDATE strava_activities SET status = 'posted', strava_activity_id = '9001'`;
    const status = await getStravaStatus(context, { workoutId: logged.id });
    expect(status).toMatchObject({
      connected: true,
      athleteName: "Sam Lifter",
      autoPost: true,
      workout: { status: "posted", url: "https://www.strava.com/activities/9001" },
    });
    expect((await getStravaStatus(otherContext, { workoutId: logged.id })).workout?.status).toBe(
      "not_posted",
    );
  });

  it("posts a workout by hand: previews first, then queues once", async () => {
    await connect(false);
    const logged = await logPastWorkout(context, workout);
    expect(published).toHaveLength(0);

    const preview = await postWorkoutToStrava(context, { workoutId: logged.id });
    expect(preview).toMatchObject({ dryRun: true, queued: false });
    expect(published).toHaveLength(0);
    const [untouched] = await admin`SELECT strava_post FROM sessions WHERE id = ${logged.id}`;
    expect(untouched?.strava_post).toBeNull();

    const sent = await postWorkoutToStrava(context, { workoutId: logged.id, dryRun: false });
    expect(sent).toMatchObject({ queued: true, alreadyOnStrava: false });
    expect(published).toHaveLength(1);
    const [marked] = await admin`SELECT strava_post FROM sessions WHERE id = ${logged.id}`;
    expect(marked?.strava_post).toBe(true);

    const again = await postWorkoutToStrava(context, { workoutId: logged.id, dryRun: false });
    expect(again.queued).toBe(false);
    expect(published).toHaveLength(1);
  });

  it("explains when Strava isn't connected", async () => {
    const logged = await logPastWorkout(context, workout);
    await expect(postWorkoutToStrava(context, { workoutId: logged.id })).rejects.toThrow(
      /isn't connected/,
    );
  });
});
