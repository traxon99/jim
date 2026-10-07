import { sessions } from "@jim/db";
import { eq, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";

/**
 * Deletes a finished workout from history, the same tombstone the phone's
 * "Delete workout" writes. A workout still in progress is refused: no tool
 * can change the phone's active session (ADR-007).
 */
export async function deleteWorkout(
  context: UserContext,
  input: { sessionId: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, input.sessionId));
    if (!session || session.deletedAt) {
      throw new Error(`No workout found with id ${input.sessionId}. Try list_workouts.`);
    }
    if (!session.endedAt) {
      throw new Error(
        "That workout is still in progress on the phone. Finish or cancel it there instead.",
      );
    }
    const now = new Date();
    await tx
      .update(sessions)
      .set({
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(sessions.id, session.id));
    return {
      id: session.id,
      name: session.name,
      startedAt: session.startedAt.toISOString(),
      deleted: true,
    };
  });
}
