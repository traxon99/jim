import { sql } from "drizzle-orm";
import { createDb } from "../client";
import { exercises } from "../schema";
import { type RetaggedSeed, fetchCatalogSeedWithOrigins } from "./free-exercise-db";

const BATCH_SIZE = 100;

const SEEDED_COLUMNS = [
  "name",
  "aliases",
  "primary_muscles",
  "secondary_muscles",
  "primary_targets",
  "secondary_targets",
  "equipment",
  "mechanic",
  "force",
  "level",
  "tracking_type",
  "category",
  "instructions",
  "image_urls",
] as const;

const changedColumns = sql.raw(
  `(${SEEDED_COLUMNS.map((c) => `"exercises"."${c}"`).join(", ")}) IS DISTINCT FROM (${SEEDED_COLUMNS.map((c) => `excluded."${c}"`).join(", ")})`,
);

const sorted = (values: readonly string[]) => [...values].sort();

/** A Postgres array literal: drizzle would spread a JS array into a param list. */
const pgArray = (values: readonly string[]) =>
  `{${values.map((value) => `"${value.replace(/["\\]/g, "\\$&")}"`).join(",")}}`;

/**
 * A user's copy of a seed row (copy-on-write keeps the slug, ADR-008) that
 * has no muscle tree tags and still carries exactly upstream's group tags
 * never had its muscles edited, so it moves onto the seed's new tags too
 * (issue #874). Copies whose muscles the user changed are left alone. Runs
 * every seed; once a copy has tags it no longer matches.
 */
async function backfillUserCopies(
  db: ReturnType<typeof createDb>,
  retagged: readonly RetaggedSeed[],
): Promise<void> {
  for (let i = 0; i < retagged.length; i += BATCH_SIZE) {
    const values = retagged
      .slice(i, i + BATCH_SIZE)
      .map(
        ({ row, upstreamPrimary, upstreamSecondary }) =>
          sql`(${row.slug}, ${pgArray(sorted(upstreamPrimary))}::text[], ${pgArray(sorted(upstreamSecondary))}::text[], ${pgArray(row.primaryTargets ?? [])}::text[], ${pgArray(row.secondaryTargets ?? [])}::text[], ${pgArray(row.primaryMuscles ?? [])}::text[], ${pgArray(row.secondaryMuscles ?? [])}::text[])`,
      );
    await db.execute(sql`
      UPDATE exercises e SET
        primary_targets = v.pt::muscle_target[],
        secondary_targets = v.st::muscle_target[],
        primary_muscles = v.pm::muscle[],
        secondary_muscles = v.sm::muscle[],
        updated_at = now(),
        server_seq = nextval('sync_seq')
      FROM (VALUES ${sql.join(values, sql`, `)}) AS v(slug, up, us, pt, st, pm, sm)
      WHERE e.slug = v.slug
        AND e.owner_id IS NOT NULL
        AND cardinality(e.primary_targets) = 0
        AND cardinality(e.secondary_targets) = 0
        AND ARRAY(SELECT m::text FROM unnest(e.primary_muscles) m ORDER BY m::text COLLATE "C") = v.up
        AND ARRAY(SELECT m::text FROM unnest(e.secondary_muscles) m ORDER BY m::text COLLATE "C") = v.us
    `);
  }
}

export async function seedCatalog(databaseUrl: string): Promise<{ count: number }> {
  const db = createDb(databaseUrl);
  try {
    const { rows, retagged } = await fetchCatalogSeedWithOrigins();

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await db
        .insert(exercises)
        .values(batch)
        .onConflictDoUpdate({
          target: exercises.slug,
          targetWhere: sql`${exercises.ownerId} IS NULL`,
          set: {
            name: sql`excluded.name`,
            aliases: sql`excluded.aliases`,
            primaryMuscles: sql`excluded.primary_muscles`,
            secondaryMuscles: sql`excluded.secondary_muscles`,
            primaryTargets: sql`excluded.primary_targets`,
            secondaryTargets: sql`excluded.secondary_targets`,
            equipment: sql`excluded.equipment`,
            mechanic: sql`excluded.mechanic`,
            force: sql`excluded.force`,
            level: sql`excluded.level`,
            trackingType: sql`excluded.tracking_type`,
            category: sql`excluded.category`,
            instructions: sql`excluded.instructions`,
            imageUrls: sql`excluded.image_urls`,
            updatedAt: sql`now()`,
            // Clients pull by server_seq, so a reseed that actually changes a
            // global row (e.g. reclassifying stretches as warm-ups, issue #59)
            // has to bump it or devices that already pulled the row never see
            // the change. Unchanged rows keep theirs, so a routine deploy
            // doesn't make every device re-pull the whole catalog.
            serverSeq: sql`CASE WHEN ${changedColumns} THEN nextval('sync_seq') ELSE ${exercises.serverSeq} END`,
          },
        });
    }

    await backfillUserCopies(db, retagged);

    return { count: rows.length };
  } finally {
    await db.$client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (see packages/db/.env.example)");
  }
  const { count } = await seedCatalog(databaseUrl);
  console.log(`Seeded ${count} exercises.`);
  process.exit(0);
}
