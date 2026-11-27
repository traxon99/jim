import {
  filterExercises,
  machineName,
  muscleTargetPath,
  preferOwnedExercises,
  searchExercises,
} from "@jim/core";
import { gyms } from "@jim/db";
import { isNull } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";
import { loadPreferences } from "./exercise-preferences.js";
import { visibleExercises } from "./resolve-exercise.js";

export interface SearchExercisesInput {
  query?: string;
  muscles?: string[];
  equipment?: string;
}

export async function searchExercisesTool(context: UserContext, input: SearchExercisesInput) {
  return withUser(context, async (tx) => {
    const rows = preferOwnedExercises(await visibleExercises(tx), context.userId);

    // A muscle can be a group or any node of the muscle tree (list_muscles):
    // a row matches when it's tagged with that node or anything beneath it.
    const byMuscle = input.muscles?.length
      ? rows.filter((row) => {
          const reached = new Set<string>([...row.primaryMuscles, ...row.secondaryMuscles]);
          for (const id of [...row.primaryTargets, ...row.secondaryTargets]) {
            for (const node of muscleTargetPath(id)) reached.add(node);
          }
          return input.muscles?.some((muscle) => reached.has(muscle));
        })
      : rows;
    const filtered = filterExercises(byMuscle, { equipment: input.equipment });
    const ranked = input.query ? searchExercises(filtered, input.query) : filtered;
    const preferences = await loadPreferences(tx);
    const gymNames = new Map(
      (await tx.select().from(gyms).where(isNull(gyms.deletedAt))).map((g) => [g.id, g.name]),
    );

    return ranked.slice(0, 50).map((row) => ({
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      primaryMuscles: row.primaryMuscles,
      secondaryMuscles: row.secondaryMuscles,
      // Muscle tree tags (list_muscles), only when the exercise has them.
      ...(row.primaryTargets.length > 0 ? { primaryTargets: row.primaryTargets } : {}),
      ...(row.secondaryTargets.length > 0 ? { secondaryTargets: row.secondaryTargets } : {}),
      equipment: row.equipment,
      trackingType: row.trackingType,
      isCustom: row.ownerId !== null,
      // Like / Dislike (issue #795), only when set.
      ...(preferences.has(row.slug) ? { preference: preferences.get(row.slug) } : {}),
      // Machine details (issue #450), only when set.
      ...(machineName(row) ? { machine: machineName(row) } : {}),
      ...(row.pulleyType ? { pulleyType: row.pulleyType } : {}),
      ...(row.gymId && gymNames.has(row.gymId) ? { gym: gymNames.get(row.gymId) } : {}),
    }));
  });
}
