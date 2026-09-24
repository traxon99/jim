"use client";

import { mutate } from "@/lib/db/mutate";
import { type ExerciseRow, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type ExerciseCategory,
  MUSCLES,
  type Muscle,
  applyExerciseEdit,
  exerciseCategoryOf,
  slugify,
  uuidv7,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TRACKING_TYPES = [
  "weight_reps",
  "time",
  "distance",
  "bodyweight",
  "weighted_bodyweight",
] as const;

// Warm-ups/stretches are only ever logged for reps or for time (issue #59).
const WARMUP_TRACKING_TYPES = ["bodyweight", "time"] as const;

interface Props {
  userId: string;
  mode: "new" | "edit";
  exerciseId?: string;
  /**
   * Embedded use (issue #169): the exercise picker opens this form in place
   * to create an exercise without leaving the routine or workout. When set,
   * saving hands the new row back instead of navigating to its page.
   */
  onSaved?: (exercise: ExerciseRow) => void;
  onCancel?: () => void;
  initialName?: string;
  initialCategory?: ExerciseCategory;
}

export function ExerciseForm({
  userId,
  mode,
  exerciseId,
  onSaved,
  onCancel,
  initialName = "",
  initialCategory = "strength",
}: Props) {
  const router = useRouter();
  const existing = useLiveQuery(
    () => (exerciseId ? db.exercises.get(exerciseId) : undefined),
    [exerciseId],
  );

  const [name, setName] = useState(initialName);
  const [equipment, setEquipment] = useState("");
  const [category, setCategory] = useState<ExerciseCategory>(initialCategory);
  const [trackingType, setTrackingType] = useState<(typeof TRACKING_TYPES)[number]>(
    initialCategory === "warmup" ? "bodyweight" : "weight_reps",
  );
  const [primaryMuscles, setPrimaryMuscles] = useState<Muscle[]>([]);
  const [instructionsText, setInstructionsText] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate the form once the existing row loads (edit mode).
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setEquipment(existing.equipment ?? "");
    setCategory(exerciseCategoryOf(existing));
    setTrackingType(existing.trackingType);
    setPrimaryMuscles([...existing.primaryMuscles]);
    setInstructionsText(existing.instructions.join("\n"));
  }, [existing]);

  function handleCategoryChange(next: ExerciseCategory) {
    setCategory(next);
    if (next === "warmup" && !(WARMUP_TRACKING_TYPES as readonly string[]).includes(trackingType)) {
      setTrackingType("bodyweight");
    }
  }

  const trackingOptions = category === "warmup" ? WARMUP_TRACKING_TYPES : TRACKING_TYPES;

  function toggleMuscle(muscle: Muscle) {
    setPrimaryMuscles((current) =>
      current.includes(muscle) ? current.filter((m) => m !== muscle) : [...current, muscle],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const deviceId = await getDeviceId();
    const now = new Date();
    const instructions = instructionsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    let entity: ExerciseRow;

    if (mode === "new" || !existing) {
      entity = {
        id: uuidv7(),
        ownerId: userId,
        slug: slugify(name),
        name,
        aliases: [],
        primaryMuscles,
        secondaryMuscles: [],
        equipment: equipment.trim() || null,
        mechanic: null,
        force: null,
        level: null,
        trackingType,
        category,
        instructions,
        imageUrls: [],
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        deviceId,
        serverSeq: 0,
      };
    } else {
      const { entity: applied } = applyExerciseEdit(
        existing,
        {
          name,
          equipment: equipment.trim() || null,
          trackingType,
          category,
          primaryMuscles,
          instructions,
        },
        userId,
        uuidv7,
      );
      entity = { ...applied, updatedAt: now, deviceId };
    }

    await mutate("exercises", entity);
    if (onSaved) {
      onSaved(entity);
      return;
    }
    router.push(`/exercises/${entity.id}`);
  }

  async function handleToggleArchive() {
    if (!existing) return;
    setSaving(true);
    const deviceId = await getDeviceId();
    const { entity: applied } = applyExerciseEdit(
      existing,
      { isArchived: !existing.isArchived },
      userId,
      uuidv7,
    );
    const entity: ExerciseRow = { ...applied, updatedAt: new Date(), deviceId };
    await mutate("exercises", entity);
    router.push(`/exercises/${entity.id}`);
  }

  if (mode === "edit" && existing === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  const Container = onSaved ? "div" : "main";

  return (
    <Container className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {mode === "new" ? "New exercise" : "Edit exercise"}
        </h1>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-2 text-sm font-medium underline underline-offset-4"
          >
            Back
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Equipment
          <input
            type="text"
            value={equipment}
            onChange={(event) => setEquipment(event.target.value)}
            placeholder="barbell, dumbbell, body only…"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Type
          <select
            value={category}
            onChange={(event) => handleCategoryChange(event.target.value as ExerciseCategory)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="strength">Strength</option>
            <option value="warmup">Warm-up / stretch</option>
          </select>
          {category === "warmup" && (
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
              Logged for reps or time, and tracked by how often you do it rather than for PRs.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Tracking
          <select
            value={trackingType}
            onChange={(event) => setTrackingType(event.target.value as typeof trackingType)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {trackingOptions.map((t) => (
              <option key={t} value={t}>
                {category === "warmup" ? (t === "time" ? "time" : "reps") : t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Primary muscles</legend>
          <div className="flex flex-wrap gap-2">
            {MUSCLES.map((muscle) => {
              const active = primaryMuscles.includes(muscle);
              return (
                <button
                  key={muscle}
                  type="button"
                  onClick={() => toggleMuscle(muscle)}
                  aria-pressed={active}
                  className={`min-h-11 rounded-full border px-3 py-1.5 text-sm ${
                    active
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {muscle}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Instructions (one step per line)
          <textarea
            value={instructionsText}
            onChange={(event) => setInstructionsText(event.target.value)}
            rows={5}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {mode === "edit" && existing && (
          <button
            type="button"
            onClick={handleToggleArchive}
            disabled={saving}
            className="rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-950 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
          >
            {existing.isArchived ? "Unarchive" : "Archive"}
          </button>
        )}
      </form>
    </Container>
  );
}
