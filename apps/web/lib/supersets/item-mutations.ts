import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type SyncTableRowMap, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type SupersetChange,
  applyItemOrder,
  formSuperset,
  nextSupersetGroup,
  normalizeSupersets,
} from "@jim/core";

/**
 * The exercise lists the workout and the routine editor both edit the same
 * way (issue #550): one copy of adding, superset grouping and reordering,
 * parameterized by table.
 */
export type ExerciseItemTable = "sessionExercises" | "routineExercises";
type ItemRow<T extends ExerciseItemTable> = SyncTableRowMap[T];

/** Writes each change's new `supersetGroup`; ids not in `items` are skipped. */
export async function applySupersetChanges<T extends ExerciseItemTable>(
  table: T,
  items: readonly ItemRow<T>[],
  changes: readonly SupersetChange[],
  database: JimDatabase = db,
): Promise<void> {
  if (changes.length === 0) return;
  const deviceId = await getDeviceId(database);
  const now = new Date();
  for (const change of changes) {
    const original = items.find((item) => item.id === change.id);
    if (!original) continue;
    await mutate(
      table,
      { ...original, supersetGroup: change.supersetGroup, updatedAt: now, deviceId },
      database,
    );
  }
}

/**
 * The superset card's picks become one superset, moved together (issue
 * #360). The items reuse their own positions, so anything outside `items`
 * (a workout's warm-ups) stays put.
 */
export async function formSupersetIn<T extends ExerciseItemTable>(
  table: T,
  items: readonly ItemRow<T>[],
  selectedIds: readonly string[],
  editingIds: readonly string[],
  database: JimDatabase = db,
): Promise<void> {
  const positions = items.map((item) => item.position);
  const formed = formSuperset(items, selectedIds, editingIds);
  const deviceId = await getDeviceId(database);
  const now = new Date();
  for (const [index, item] of formed.entries()) {
    const original = items.find((other) => other.id === item.id);
    const position = positions[index] ?? item.position;
    if (!original) continue;
    if (original.position === position && original.supersetGroup === item.supersetGroup) continue;
    await mutate(
      table,
      { ...original, position, supersetGroup: item.supersetGroup, updatedAt: now, deviceId },
      database,
    );
  }
}

/**
 * Saves `items` in the order `orderedIds` lists them (issue #658). The items
 * reuse their own positions, so anything outside `items` (a workout's
 * warm-ups) stays put, and a move that splits or strands a superset cleans
 * it up (issue #228). Only rows whose position or group changed are written.
 */
export async function reorderItemsIn<T extends ExerciseItemTable>(
  table: T,
  items: readonly ItemRow<T>[],
  orderedIds: readonly string[],
  database: JimDatabase = db,
): Promise<void> {
  const reordered = applyItemOrder(items, orderedIds);
  const groups = new Map(
    normalizeSupersets(reordered).map((change) => [change.id, change.supersetGroup]),
  );
  const deviceId = await getDeviceId(database);
  const now = new Date();
  for (const item of reordered) {
    const original = items.find((other) => other.id === item.id);
    if (!original) continue;
    const supersetGroup = groups.has(item.id)
      ? (groups.get(item.id) ?? null)
      : original.supersetGroup;
    if (original.position === item.position && original.supersetGroup === supersetGroup) continue;
    await mutate(
      table,
      { ...original, position: item.position, supersetGroup, updatedAt: now, deviceId },
      database,
    );
  }
}

/**
 * Appends the picked exercises after `count` existing ones. Picking several
 * at once adds them as one superset (issue #269). `build` fills in the
 * table's own columns.
 */
export async function addExerciseItems<T extends ExerciseItemTable>(
  table: T,
  items: readonly ItemRow<T>[],
  count: number,
  exerciseIds: readonly string[],
  build: (fields: {
    exerciseId: string;
    position: number;
    supersetGroup: number | null;
    now: Date;
    deviceId: string;
  }) => ItemRow<T>,
  database: JimDatabase = db,
): Promise<void> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const supersetGroup = exerciseIds.length > 1 ? nextSupersetGroup(items) : null;
  for (const [offset, exerciseId] of exerciseIds.entries()) {
    await mutate(
      table,
      build({ exerciseId, position: count + offset, supersetGroup, now, deviceId }),
      database,
    );
  }
}
