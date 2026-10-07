import { routines } from "@jim/db";
import { eq, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { findRoutine } from "./find-routine.js";

/**
 * Deletes a routine or warm-up the way the phone's Delete button does: a
 * tombstone on the routine row, so past sessions built from it are
 * unaffected. A routine still linked to a deleted warm-up just starts
 * without it, as on the phone.
 */
export async function deleteRoutine(
  context: UserContext,
  input: { routine: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const routine = await findRoutine(tx, input.routine);
    const now = new Date();
    await tx
      .update(routines)
      .set({
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(routines.id, routine.id));
    return { id: routine.id, name: routine.name, kind: routine.kind, deleted: true };
  });
}
