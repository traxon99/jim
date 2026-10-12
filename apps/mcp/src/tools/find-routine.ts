import { pickDefaultRoutineIcon } from "@jim/core";
import { type DbOrTx, routines } from "@jim/db";
import { and, eq, isNull } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RoutineLookupError extends Error {}

export type RoutineRow = typeof routines.$inferSelect;

/**
 * Resolves a live routine from an id or its exact name (case-insensitive),
 * the way `get_routine` always has (#370). Shared by every tool that takes a
 * routine, so a name works anywhere an id does and an ambiguous name fails
 * the same way everywhere.
 */
export async function findRoutine(tx: DbOrTx, key: string): Promise<RoutineRow> {
  const live = isNull(routines.deletedAt);
  const trimmed = key.trim();
  let candidates = UUID_RE.test(trimmed)
    ? await tx
        .select()
        .from(routines)
        .where(and(live, eq(routines.id, trimmed)))
    : [];
  if (candidates.length === 0) {
    const all = await tx.select().from(routines).where(live);
    candidates = all.filter((routine) => routine.name.toLowerCase() === trimmed.toLowerCase());
  }

  const [routine, ...others] = candidates;
  if (!routine) {
    throw new RoutineLookupError(
      `No routine matches "${key}". Try list_routines to see what exists.`,
    );
  }
  if (others.length > 0) {
    throw new RoutineLookupError(
      `${candidates.length} routines are named "${key}" (${candidates.map((r) => r.id).join(", ")}). Pass one of those ids instead.`,
    );
  }
  return routine;
}

/** `findRoutine`, but only a warm-up routine (`kind: "warmup"`) will do. */
export async function findWarmupRoutine(tx: DbOrTx, key: string): Promise<RoutineRow> {
  const routine = await findRoutine(tx, key);
  if (routine.kind !== "warmup") {
    throw new RoutineLookupError(
      `"${routine.name}" is a strength routine, not a warm-up. Create one with create_warmup, or pick one list_routines shows with kind "warmup".`,
    );
  }
  return routine;
}

/** A new routine's default icon, picked against the user's existing routines like the phone does (issue #152). */
export async function nextRoutineIcon(tx: DbOrTx) {
  const existing = await tx.select().from(routines).where(isNull(routines.deletedAt));
  return pickDefaultRoutineIcon(
    existing
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({ iconShape: r.iconShape, iconColor: r.iconColor })),
  );
}

/** The next `position` at the end of the user's routine list. */
export async function nextRoutinePosition(tx: DbOrTx): Promise<number> {
  const existing = await tx.select({ position: routines.position }).from(routines);
  return existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.position)) + 1;
}
