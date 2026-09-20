import { sql } from "drizzle-orm";
import { createDb } from "../client";
import { exercises } from "../schema";
import { fetchCatalogSeed } from "./free-exercise-db";

const BATCH_SIZE = 100;

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
            instructions: sql`excluded.instructions`,
            imageUrls: sql`excluded.image_urls`,
            updatedAt: sql`now()`,
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
