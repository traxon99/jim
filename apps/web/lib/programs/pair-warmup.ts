import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type RoutineRow, db } from "@/lib/db/schema";
import { addWarmupTemplate } from "@/lib/routines/warmup-templates";
import { getDeviceId } from "@/lib/sync/engine";
import { WARMUP_TEMPLATES } from "@jim/core";

/**
 * Pairs a warm-up with a program's routine (issue #139) by setting the
 * routine's own warm-up link — the same one the routine form edits, so the
 * warm-up runs whenever that routine is started. `choice` uses the routine
 * form's encoding: "" = none, "routine:<id>" = one of the user's warm-up
 * routines, "template:<key>" = a built-in template, added as a routine first.
 */
export async function pairWarmup(
  userId: string,
  routine: RoutineRow,
  choice: string,
  database: JimDatabase = db,
): Promise<string | null> {
  let warmupRoutineId: string | null = null;
  if (choice.startsWith("routine:")) {
    warmupRoutineId = choice.slice("routine:".length);
  } else if (choice.startsWith("template:")) {
    const template = WARMUP_TEMPLATES.find((t) => t.key === choice.slice("template:".length));
    if (template) warmupRoutineId = (await addWarmupTemplate(userId, template, database)).routineId;
  }

  if (warmupRoutineId === (routine.warmupRoutineId ?? null)) return warmupRoutineId;

  const deviceId = await getDeviceId(database);
  await mutate(
    "routines",
    { ...routine, warmupRoutineId, updatedAt: new Date(), deviceId },
    database,
  );
  return warmupRoutineId;
}
