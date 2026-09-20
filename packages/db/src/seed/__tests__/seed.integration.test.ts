import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { first, resetTestDb } from "../../__tests__/test-db";
import { seedCatalog } from "../index";

// Hits the network (free-exercise-db on GitHub) as well as the database.
describe.skipIf(!process.env.TEST_DATABASE_URL)("seedCatalog", () => {
  let admin: postgres.Sql;
  const url = process.env.TEST_DATABASE_URL as string;

  beforeAll(async () => {
    admin = await resetTestDb();
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("seeds roughly 800 global exercises with tracking_type and a primary muscle set", async () => {
    const { count } = await seedCatalog(url);
    expect(count).toBeGreaterThan(700);

    const row = first(
      await admin<{ total: string; global: string; incomplete: string }[]>`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE owner_id IS NULL) AS global,
        count(*) FILTER (
          WHERE tracking_type IS NULL OR cardinality(primary_muscles) = 0
        ) AS incomplete
      FROM exercises
    `,
    );
    expect(Number(row.total)).toBe(count);
    expect(Number(row.global)).toBe(count);
    expect(Number(row.incomplete)).toBe(0);
  }, 30_000);

  it("is idempotent: rerunning produces no duplicate global rows", async () => {
    const firstRun = await seedCatalog(url);
    const secondRun = await seedCatalog(url);
    expect(secondRun.count).toBe(firstRun.count);

    const row = first(await admin<{ total: string }[]>`SELECT count(*) AS total FROM exercises`);
    expect(Number(row.total)).toBe(firstRun.count);
  }, 30_000);

  it("does not clobber a user-owned row sharing a global row's slug", async () => {
    await seedCatalog(url);

    const user = first(
      await admin<{ id: string }[]>`
      INSERT INTO auth.users (email) VALUES ('clone-owner@example.com') RETURNING id
    `,
    );
    await admin`INSERT INTO public.users (id, email) VALUES (${user.id}, 'clone-owner@example.com')`;

    const globalRow = first(
      await admin<{ slug: string; name: string }[]>`
      SELECT slug, name FROM exercises WHERE owner_id IS NULL LIMIT 1
    `,
    );
    await admin`
      INSERT INTO exercises (owner_id, slug, name, tracking_type, primary_muscles)
      VALUES (${user.id}, ${globalRow.slug}, 'My Custom Clone', 'weight_reps', '{chest}')
    `;

    await seedCatalog(url);

    const clone = first(
      await admin<{ name: string }[]>`
      SELECT name FROM exercises WHERE owner_id = ${user.id} AND slug = ${globalRow.slug}
    `,
    );
    expect(clone.name).toBe("My Custom Clone");

    const row = first(
      await admin<{ count: string }[]>`
      SELECT count(*) FROM exercises WHERE slug = ${globalRow.slug}
    `,
    );
    expect(Number(row.count)).toBe(2); // the global row and the clone, no duplicate of either
  }, 30_000);
});
