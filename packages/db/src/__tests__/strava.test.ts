import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, resetTestDb } from "./test-db";

const USER_A = "11111111-1111-1111-1111-111111111111";
const SESSION = "0192f3a0-0000-7000-8000-000000000001";

describe.skipIf(!process.env.TEST_DATABASE_URL)("Strava tables are server-only (#836)", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com')`;
    await admin`INSERT INTO sessions (id, user_id, device_id) VALUES (${SESSION}, ${USER_A}, 'd')`;
    await admin`
      INSERT INTO strava_connections (user_id, athlete_id, access_token_enc, refresh_token_enc, expires_at)
      VALUES (${USER_A}, '1', 'a', 'r', now())`;
    await admin`INSERT INTO strava_activities (session_id, user_id) VALUES (${SESSION}, ${USER_A})`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("hides connections and activities from the account's own signed-in role", async () => {
    for (const table of ["strava_connections", "strava_activities"] as const) {
      const rows = await asUser(admin, USER_A, (tx) => tx.unsafe(`SELECT * FROM ${table}`));
      expect(rows, `${table} must be unreadable as authenticated`).toHaveLength(0);
    }
  });

  it("won't let the signed-in role write them either", async () => {
    await expect(
      asUser(
        admin,
        USER_A,
        (tx) =>
          tx`INSERT INTO strava_connections (user_id, athlete_id, access_token_enc, refresh_token_enc, expires_at)
            VALUES (${USER_A}, '2', 'a', 'r', now())`,
      ),
    ).rejects.toThrow();
    const updated = await asUser(
      admin,
      USER_A,
      (tx) => tx`UPDATE strava_activities SET status = 'posted'`,
    );
    expect(updated.count).toBe(0);
  });

  it("rejects an unknown post status", async () => {
    await expect(admin`UPDATE strava_activities SET status = 'bogus'`).rejects.toThrow();
  });
});
