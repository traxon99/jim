import { groupRoutinesByFolder, isWarmupRoutine } from "@jim/core";

interface LibraryRoutine {
  id: string;
  name: string;
  folder: string | null;
  position: number;
  kind?: "strength" | "warmup" | null;
  warmupRoutineId?: string | null;
  deletedAt: Date | null;
}

export interface LibraryFolder<T> {
  /** Null is the "Other" group: routines outside any folder. */
  folder: string | null;
  routines: T[];
}

/**
 * The Routines page library's strength routines (issue #655): live,
 * not warm-ups, and not already listed in the active program's card above,
 * grouped by folder with the unfoldered ones last as "Other".
 */
export function libraryFolders<T extends LibraryRoutine>(
  routines: readonly T[],
  inProgram: ReadonlySet<string>,
): LibraryFolder<T>[] {
  const live = routines.filter(
    (routine) => !routine.deletedAt && !isWarmupRoutine(routine) && !inProgram.has(routine.id),
  );
  const groups = groupRoutinesByFolder(live);
  return [
    ...groups.filter((group) => group.folder !== null),
    ...groups.filter((group) => group.folder === null),
  ];
}

function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface WarmupEntry<T> {
  warmup: T;
  /** Names of the strength routines that run this warm-up, in name order. */
  usedBy: string[];
  /** Another warm-up has the same name. */
  duplicate: boolean;
}

/**
 * Warm-ups split by whether any routine runs them (issue #655), so the ones
 * doing nothing, often copies added from the same template, stand apart.
 */
export function splitWarmups<T extends LibraryRoutine>(
  routines: readonly T[],
): { linked: WarmupEntry<T>[]; unlinked: WarmupEntry<T>[]; duplicateNames: number } {
  const live = routines.filter((routine) => !routine.deletedAt);
  const warmups = live
    .filter((routine) => isWarmupRoutine(routine))
    .sort((a, b) => a.name.localeCompare(b.name));

  const usedBy = new Map<string, string[]>();
  for (const routine of live) {
    if (isWarmupRoutine(routine) || !routine.warmupRoutineId) continue;
    const list = usedBy.get(routine.warmupRoutineId);
    if (list) list.push(routine.name);
    else usedBy.set(routine.warmupRoutineId, [routine.name]);
  }

  const nameCounts = new Map<string, number>();
  for (const warmup of warmups) {
    const key = nameKey(warmup.name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const linked: WarmupEntry<T>[] = [];
  const unlinked: WarmupEntry<T>[] = [];
  for (const warmup of warmups) {
    const entry = {
      warmup,
      usedBy: [...(usedBy.get(warmup.id) ?? [])].sort((a, b) => a.localeCompare(b)),
      duplicate: (nameCounts.get(nameKey(warmup.name)) ?? 0) > 1,
    };
    (entry.usedBy.length > 0 ? linked : unlinked).push(entry);
  }
  const duplicateNames = [...nameCounts.values()].filter((count) => count > 1).length;
  return { linked, unlinked, duplicateNames };
}
