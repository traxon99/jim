import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";

/**
 * Makes `programId` the one active program (or clears it with `null`),
 * deactivating any other — the "at most one active" rule lives here rather
 * than in a DB constraint (see packages/db's programs comment). Activating
 * stamps `activatedAt`, which "Week N of M" counts from.
 */
export async function setActiveProgram(
  programId: string | null,
  database: JimDatabase = db,
): Promise<void> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const all = await database.programs.toArray();
  for (const program of all) {
    if (program.deletedAt) continue;
    const shouldBeActive = program.id === programId;
    if (program.isActive === shouldBeActive) continue;
    await mutate(
      "programs",
      {
        ...program,
        isActive: shouldBeActive,
        activatedAt: shouldBeActive ? now : program.activatedAt,
        updatedAt: now,
        deviceId,
      },
      database,
    );
  }
}
