import { applyExerciseEdit, slugify, uuidv7 } from "@jim/core";
import { exercises } from "@jim/db";
import { eq, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { ExerciseNotFoundError } from "./resolve-exercise.js";
import type { ExerciseRow } from "./resolve-exercise.js";

export interface UpsertExerciseInput {
  /** Omit to create a new custom exercise; provide to edit one (copy-on-write for a global row, ADR-008). */
  id?: string;
  name?: string;
  aliases?: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string;
  mechanic?: ExerciseRow["mechanic"];
  force?: ExerciseRow["force"];
  level?: ExerciseRow["level"];
  trackingType?: ExerciseRow["trackingType"];
  instructions?: string[];
  isArchived?: boolean;
}

export async function upsertExercise(context: UserContext, input: UpsertExerciseInput) {
  return withUser(context, async (tx) => {
    const now = new Date();

    if (!input.id) {
      if (!input.name || !input.trackingType) {
        throw new Error("name and trackingType are required to create a new exercise");
      }
      const id = uuidv7();
      await tx.insert(exercises).values({
        id,
        ownerId: context.userId,
        slug: slugify(input.name),
        name: input.name,
        aliases: input.aliases ?? [],
        primaryMuscles: (input.primaryMuscles ?? []) as ExerciseRow["primaryMuscles"],
        secondaryMuscles: (input.secondaryMuscles ?? []) as ExerciseRow["secondaryMuscles"],
        equipment: input.equipment ?? null,
        mechanic: input.mechanic ?? null,
        force: input.force ?? null,
        level: input.level ?? null,
        trackingType: input.trackingType,
        instructions: input.instructions ?? [],
        isArchived: input.isArchived ?? false,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
      });
      return { id, action: "created" as const };
    }

    const [current] = await tx.select().from(exercises).where(eq(exercises.id, input.id));
    if (!current) throw new ExerciseNotFoundError(input.id);

    const edits: Partial<ExerciseRow> = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.aliases !== undefined && { aliases: input.aliases }),
      ...(input.primaryMuscles !== undefined && {
        primaryMuscles: input.primaryMuscles as ExerciseRow["primaryMuscles"],
      }),
      ...(input.secondaryMuscles !== undefined && {
        secondaryMuscles: input.secondaryMuscles as ExerciseRow["secondaryMuscles"],
      }),
      ...(input.equipment !== undefined && { equipment: input.equipment }),
      ...(input.mechanic !== undefined && { mechanic: input.mechanic }),
      ...(input.force !== undefined && { force: input.force }),
      ...(input.level !== undefined && { level: input.level }),
      ...(input.trackingType !== undefined && { trackingType: input.trackingType }),
      ...(input.instructions !== undefined && { instructions: input.instructions }),
      ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
    };

    const { action, entity } = applyExerciseEdit(current, edits, context.userId, uuidv7);

    if (action === "update") {
      await tx
        .update(exercises)
        .set({
          ...entity,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
          serverSeq: sql`nextval('sync_seq')`,
        })
        .where(eq(exercises.id, entity.id));
      return { id: entity.id, action: "updated" as const };
    }

    await tx.insert(exercises).values({ ...entity, updatedAt: now, deviceId: MCP_DEVICE_ID });
    return { id: entity.id, action: "cloned" as const };
  });
}
