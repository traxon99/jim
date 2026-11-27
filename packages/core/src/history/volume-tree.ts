import { muscleTargetChildren } from "../exercises/muscle-tree";
import type { WeeklyMuscleVolume } from "./volume-by-muscle";

/** The id of the remainder row under a group or muscle. */
export const OTHER_TARGET = "other";

export interface VolumeTreeRow {
  /** A muscle tree id, or `OTHER_TARGET` for the remainder. */
  id: string;
  label: string;
  sets: number;
  volume: number;
  /** A muscle's heads, when asked for and it has any trained. */
  children?: VolumeTreeRow[];
}

/**
 * What a week's sets under one group or muscle break down into (#874):
 * each child trained that week, most sets first, then an "Other" row for
 * the part that reached none of them (exercises tagged no deeper). A child
 * counts a set once at its highest weight, so children don't add up to
 * their parent. `depth` 2 also nests each muscle's heads.
 */
export function volumeTreeRows(
  week: Pick<
    WeeklyMuscleVolume,
    "setsByTarget" | "volumeByTarget" | "otherSetsByTarget" | "otherVolumeByTarget"
  >,
  parent: string,
  depth: 1 | 2 = 1,
): VolumeTreeRow[] {
  const rows: VolumeTreeRow[] = [];
  for (const node of muscleTargetChildren(parent)) {
    const sets = week.setsByTarget[node.id] ?? 0;
    const volume = week.volumeByTarget[node.id] ?? 0;
    if (sets <= 0 && volume <= 0) continue;
    const children = depth === 2 ? volumeTreeRows(week, node.id, 1) : [];
    rows.push({
      id: node.id,
      label: node.label,
      sets,
      volume,
      ...(children.length > 0 && { children }),
    });
  }
  rows.sort((a, b) => b.sets - a.sets || b.volume - a.volume);
  const otherSets = week.otherSetsByTarget[parent] ?? 0;
  const otherVolume = week.otherVolumeByTarget[parent] ?? 0;
  // Only beside real children: a group nothing deeper was logged for is
  // all "Other", which says nothing the group's own row doesn't.
  if (rows.length > 0 && (otherSets > 0 || otherVolume > 0)) {
    rows.push({ id: OTHER_TARGET, label: "Other", sets: otherSets, volume: otherVolume });
  }
  return rows;
}

/** How deep a volume report breaks groups down (#876). */
export type VolumeDetail = "group" | "muscle" | "head";

/**
 * Each trained group's breakdown for a report: its muscles (and their heads
 * at "head"), with an "Other" remainder. Empty at "group", and groups with
 * nothing tagged deeper are left out.
 */
export function muscleDetailByGroup(
  week: Pick<
    WeeklyMuscleVolume,
    "setsByMuscle" | "setsByTarget" | "volumeByTarget" | "otherSetsByTarget" | "otherVolumeByTarget"
  >,
  detail: VolumeDetail,
): Record<string, VolumeTreeRow[]> {
  if (detail === "group") return {};
  const result: Record<string, VolumeTreeRow[]> = {};
  for (const group of Object.keys(week.setsByMuscle)) {
    const rows = volumeTreeRows(week, group, detail === "head" ? 2 : 1);
    if (rows.length > 0) result[group] = rows;
  }
  return result;
}
