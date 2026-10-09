import { filterExercises, machineName, preferOwnedExercises, searchExercises } from "@jim/core";
import { gyms } from "@jim/db";
import { isNull } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";
import { visibleExercises } from "./resolve-exercise.js";

export interface SearchExercisesInput {
  query?: string;
  muscles?: string[];
  equipment?: string;
}

export async function searchExercisesTool(context: UserContext, input: SearchExercisesInput) {
  return withUser(context, async (tx) => {
    const rows = preferOwnedExercises(await visibleExercises(tx), context.userId);

    const byMuscle = input.muscles?.length
      ? rows.filter((row) =>
          input.muscles?.some(
            (muscle) =>
              (row.primaryMuscles as readonly string[]).includes(muscle) ||
              (row.secondaryMuscles as readonly string[]).includes(muscle),
          ),
        )
      : rows;
    const filtered = filterExercises(byMuscle, { equipment: input.equipment });
    const ranked = input.query ? searchExercises(filtered, input.query) : filtered;
    const gymNames = new Map(
      (await tx.select().from(gyms).where(isNull(gyms.deletedAt))).map((g) => [g.id, g.name]),
    );

    return ranked.slice(0, 50).map((row) => ({
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      primaryMuscles: row.primaryMuscles,
      secondaryMuscles: row.secondaryMuscles,
      equipment: row.equipment,
      trackingType: row.trackingType,
      isCustom: row.ownerId !== null,
      // Machine details (issue #450), only when set.
      ...(machineName(row) ? { machine: machineName(row) } : {}),
      ...(row.pulleyType ? { pulleyType: row.pulleyType } : {}),
      ...(row.gymId && gymNames.has(row.gymId) ? { gym: gymNames.get(row.gymId) } : {}),
    }));
  });
}
