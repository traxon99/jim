import { sql } from "drizzle-orm";
import { createDb } from "../client";
import { exercises } from "../schema";
import { fetchCatalogSeed } from "./free-exercise-db";

const BATCH_SIZE = 100;

const SEEDED_COLUMNS = [
  "name",
  "aliases",
  "primary_muscles",
  "secondary_muscles",
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

export async function seedCatalog(databaseUrl: string): Promise<{ count: number }> {
  const db = createDb(databaseUrl);
  try {
    const rows = await fetchCatalogSeed();

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
