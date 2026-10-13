import { resetTestDb } from "@/lib/test/test-db";
import { createDb, feedbackSubmissions, runAsUser } from "@jim/db";
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

const { FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS, claimFeedbackSlot } = await import("../rate-limit");

describe.skipIf(!process.env.TEST_DATABASE_URL)("claimFeedbackSlot", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("allows FEEDBACK_LIMIT submissions per user per window, even sent at once", async () => {
    const now = new Date("2026-10-13T12:00:00Z");
    claimsSub = USER_A;
    const results = await Promise.all(
      Array.from({ length: FEEDBACK_LIMIT + 2 }, () => claimFeedbackSlot(now)),
    );
    expect(results.filter(Boolean)).toHaveLength(FEEDBACK_LIMIT);

    // Another account has its own allowance.
    claimsSub = USER_B;
    expect(await claimFeedbackSlot(now)).toBe(true);

    // Once the window has passed, the first account can send again.
    claimsSub = USER_A;
    expect(await claimFeedbackSlot(new Date(now.getTime() + FEEDBACK_WINDOW_MS + 1))).toBe(true);
  });

  it("doesn't let a user delete their own submissions to reset the limit", async () => {
    const db = createDb(process.env.TEST_DATABASE_URL as string);
    const deleted = await runAsUser(db, USER_A, (tx) =>
      tx.delete(feedbackSubmissions).returning({ id: feedbackSubmissions.id }),
    );
    expect(deleted).toHaveLength(0);
    const [{ remaining }] = await admin`
      SELECT count(*)::int AS remaining FROM feedback_submissions WHERE user_id = ${USER_A}
    `;
    expect(remaining).toBeGreaterThan(0);
  });
});
