import { submitterTag } from "@/lib/feedback/submitter-tag";
import { resetTestDb } from "@/lib/test/test-db";
import { uuidv7 } from "@jim/core";
import { type Db, createDb } from "@jim/db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OVERVIEW_RANGES, TELEMETRY_RANGES, pickRange } from "../dashboard";
import { countNewFailureGroups, loadFailureDetail, loadFailures } from "../failures-data";
import { loadFeedback } from "../feedback-data";
import { loadHealth } from "../health-data";
import { loadOverview } from "../overview-data";
import { loadPerformance } from "../performance-data";

const MAYA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const THEO = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const NOW = new Date("2026-11-16T15:00:00Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe.skipIf(!process.env.TEST_DATABASE_URL)("admin dashboards (#810)", () => {
  let owner: postgres.Sql;
  let db: Db;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    owner = await resetTestDb();
    db = createDb(process.env.TEST_DATABASE_URL as string);
    for (const [id, email, created] of [
      [MAYA, "maya@example.com", ago(2 * DAY)],
      [THEO, "theo@example.com", ago(40 * DAY)],
    ] as const) {
      await owner`INSERT INTO auth.users (id, email) VALUES (${id}, ${email})`;
      await owner`INSERT INTO users (id, email, username, created_at)
        VALUES (${id}, ${email}, ${email.split("@")[0] ?? null}, ${created})`;
    }
    // Opens: Maya on v2 today and yesterday, Theo on v1 three days ago and
    // 10 days ago (the previous 7-day window).
    await owner`INSERT INTO app_opens (user_id, day, app_version) VALUES
      (${MAYA}, '2026-11-16', 'v2'), (${MAYA}, '2026-11-15', 'v1'),
      (${THEO}, '2026-11-13', 'v1'), (${THEO}, '2026-11-06', 'v1')`;

    const [exercise] = await owner<{ id: string }[]>`
      INSERT INTO exercises (slug, name, tracking_type) VALUES ('bench', 'Bench', 'weight_reps')
      RETURNING id`;
    const session = uuidv7();
    await owner`INSERT INTO sessions (id, user_id, device_id, started_at, ended_at)
      VALUES (${session}, ${MAYA}, 'phone', ${ago(DAY + 3_600_000)}, ${ago(DAY)})`;
    const deleted = uuidv7();
    await owner`INSERT INTO sessions (id, user_id, device_id, started_at, ended_at, deleted_at)
      VALUES (${deleted}, ${THEO}, 'phone', ${ago(DAY)}, ${ago(DAY)}, ${ago(DAY)})`;
    const sessionExercise = uuidv7();
    await owner`INSERT INTO session_exercises (id, user_id, session_id, exercise_id)
      VALUES (${sessionExercise}, ${MAYA}, ${session}, ${exercise?.id ?? ""})`;
    await owner`INSERT INTO sets (id, user_id, session_exercise_id, set_index, weight, reps, completed_at)
      VALUES (${uuidv7()}, ${MAYA}, ${sessionExercise}, 0, 100, 5, ${ago(DAY)})`;

    // Two failure groups: one Maya and Theo both hit for days, one new today.
    const telemetry = [
      [MAYA, "error", "TypeError", "old-group", ago(5 * DAY), "v1"],
      [THEO, "error", "TypeError", "old-group", ago(2 * DAY), "v1"],
      [MAYA, "error", "TypeError", "old-group", ago(3_600_000), "v2"],
      [MAYA, "sync_failure", "push 500", "new-group", ago(2 * 3_600_000), "v2"],
    ] as const;
    for (const [user, kind, name, fingerprint, at, version] of telemetry) {
      await owner`INSERT INTO telemetry_events
          (user_id, kind, name, message, fingerprint, app_version, created_at)
        VALUES (${user}, ${kind}, ${name}, ${`${name} happened`}, ${fingerprint}, ${version}, ${at})`;
    }
    for (const [name, value, version] of [
      ["LCP", 1000, "v1"],
      ["LCP", 3000, "v1"],
      ["LCP", 2000, "v2"],
    ] as const) {
      await owner`INSERT INTO telemetry_events (user_id, kind, name, value, app_version, created_at)
        VALUES (${MAYA}, 'vital', ${name}, ${value}, ${version}, ${ago(3_600_000)})`;
    }
    await owner`INSERT INTO telemetry_events (user_id, kind, name, value, app_version, created_at)
      VALUES (${THEO}, 'cold_start', 'workout', 1500, 'v1', ${ago(3_600_000)})`;
  }, 30_000);

  afterAll(async () => {
    await owner.end();
  });

  it("counts opened and trained users, signups and workouts against the window before", async () => {
    const overview = await loadOverview(pickRange(OVERVIEW_RANGES, "7d", "30d"), db, NOW);
    expect(overview.opened).toEqual({ current: 2, previous: 1 });
    expect(overview.trained).toEqual({ current: 1, previous: 0 });
    expect(overview.signups).toEqual({ current: 1, previous: 0 });
    expect(overview.workouts).toEqual({ current: 1, previous: 0 });
    expect(overview.days).toHaveLength(7);
    expect(overview.days.at(-1)).toBe("2026-11-16");
    expect(overview.dailyOpened).toEqual([0, 0, 0, 1, 0, 1, 1]);
    expect(overview.dailyTrained).toEqual([0, 0, 0, 0, 0, 1, 0]);
    expect(overview.dailyWorkouts).toEqual([0, 0, 0, 0, 0, 1, 0]);
    // Each account counts once, on the version it opened last.
    expect(overview.versions).toEqual([
      { version: "v1", users: 1, share: 50 },
      { version: "v2", users: 1, share: 50 },
    ]);
  });

  it("groups failures by fingerprint with users, buckets and new groups", async () => {
    const week = await loadFailures(pickRange(TELEMETRY_RANGES, "7d", "7d"), null, db, NOW);
    expect(week.events).toBe(4);
    expect(week.users).toBe(2);
    expect(week.openedUsers).toBe(2);
    expect(week.newGroups).toBe(1);
    const [old, fresh] = week.groups;
    expect(old).toMatchObject({ fingerprint: "old-group", events: 3, users: 2, isNew: false });
    expect(old?.buckets).toEqual([0, 1, 0, 0, 1, 0, 1]);
    expect(fresh).toMatchObject({ fingerprint: "new-group", kind: "sync_failure", isNew: true });

    const syncOnly = await loadFailures(pickRange(TELEMETRY_RANGES, "24h", "7d"), "sync", db, NOW);
    expect(syncOnly.groups.map((group) => group.fingerprint)).toEqual(["new-group"]);
    expect(syncOnly.groups[0]?.buckets).toHaveLength(24);
    expect(syncOnly.groups[0]?.buckets.at(-3)).toBe(1);
  });

  it("opens one group with its users and occurrences", async () => {
    const detail = await loadFailureDetail("old-group", db);
    expect(detail?.events).toBe(3);
    expect(detail?.users.map((user) => user.label)).toEqual(["maya", "theo"]);
    expect(detail?.recent).toHaveLength(3);
    expect(await loadFailureDetail("missing", db)).toBeNull();
    expect(await countNewFailureGroups(db)).toBeGreaterThanOrEqual(0);
  });

  it("works out p50 and p75 per version and overall", async () => {
    const { all, versions } = await loadPerformance(
      pickRange(TELEMETRY_RANGES, "7d", "7d"),
      db,
      NOW,
    );
    expect(all.metrics.LCP).toEqual({ p50: 2000, p75: 2500, samples: 3 });
    expect(all.metrics.cold_start?.p50).toBe(1500);
    const v1 = versions.find((version) => version.version === "v1");
    expect(v1?.metrics.LCP).toEqual({ p50: 2000, p75: 2500, samples: 2 });
    expect(v1?.metrics.cold_start?.samples).toBe(1);
  });

  it("matches feedback issues to their submitter by tag", async () => {
    vi.stubEnv("GITHUB_FEEDBACK_REPO", "owner/feedback");
    vi.stubEnv("GITHUB_FEEDBACK_TOKEN", "token");
    const fetchMock = vi.fn(async (_url: string | URL | Request) =>
      Response.json([
        {
          number: 7,
          title: "Timer stops",
          html_url: "https://github.com/owner/feedback/issues/7",
          state: "open",
          created_at: "2026-11-15T10:00:00Z",
          comments: 1,
          body: `Timer stops\n\n---\nSubmitted from Jim v3.41 by user ${submitterTag(MAYA)}.`,
          labels: [{ name: "feedback" }, { name: "bug" }],
        },
        {
          number: 8,
          title: "A PR",
          html_url: "",
          state: "open",
          created_at: "",
          comments: 0,
          body: null,
          labels: [],
          pull_request: {},
        },
      ]),
    );
    const result = await loadFeedback({ state: "open", type: "bug" }, db, fetchMock);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("labels=feedback%2Cbug");
    expect(result).toEqual({
      ok: true,
      items: [
        expect.objectContaining({
          number: 7,
          type: "bug",
          excerpt: "Timer stops",
          appVersion: "3.41",
          submitter: { id: MAYA, label: "maya" },
        }),
      ],
    });
    vi.unstubAllEnvs();
    expect(await loadFeedback({ state: "open", type: null }, db, fetchMock)).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  it("measures sync lag from the change's own UUIDv7 time", async () => {
    // Made on the phone 30 s before the server applied it.
    const made = Date.now() - 60_000;
    const id = uuidv7(made);
    await owner`INSERT INTO sync_mutations (id, user_id, applied_at)
      VALUES (${id}, ${MAYA}, ${new Date(made + 30_000).toISOString()})`;
    const health = await loadHealth(
      db,
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    expect(health.syncLag?.samples).toBe(1);
    expect(Math.round((health.syncLag?.p50 ?? 0) / 1000)).toBe(30);
    expect(health.databaseBytes).toBeGreaterThan(0);
    expect(health.connections?.max).toBeGreaterThan(0);
    expect(health.services.find((service) => service.name === "Postgres")?.state).not.toBe("down");
  });
});
