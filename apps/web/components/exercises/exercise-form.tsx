"use client";

import { mutate } from "@/lib/db/mutate";
import { type ExerciseRow, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import { MUSCLES, type Muscle, applyExerciseEdit, slugify, uuidv7 } from "@jim/core";
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

interface Props {
  userId: string;
  mode: "new" | "edit";
  exerciseId?: string;
}

export function ExerciseForm({ userId, mode, exerciseId }: Props) {
  const router = useRouter();
  const existing = useLiveQuery(
    () => (exerciseId ? db.exercises.get(exerciseId) : undefined),
    [exerciseId],
  );

  const [name, setName] = useState("");
  const [equipment, setEquipment] = useState("");
  const [trackingType, setTrackingType] = useState<(typeof TRACKING_TYPES)[number]>("weight_reps");
  const [primaryMuscles, setPrimaryMuscles] = useState<Muscle[]>([]);
  const [instructionsText, setInstructionsText] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate the form once the existing row loads (edit mode).
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setEquipment(existing.equipment ?? "");
    setTrackingType(existing.trackingType);
    setPrimaryMuscles([...existing.primaryMuscles]);
    setInstructionsText(existing.instructions.join("\n"));
  }, [existing]);

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
        { name, equipment: equipment.trim() || null, trackingType, primaryMuscles, instructions },
        userId,
        uuidv7,
      );
      entity = { ...applied, updatedAt: now, deviceId };
    }

    await mutate("exercises", entity);
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

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <h1 className="text-xl font-semibold">{mode === "new" ? "New exercise" : "Edit exercise"}</h1>

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
          Tracking
          <select
            value={trackingType}
            onChange={(event) => setTrackingType(event.target.value as typeof trackingType)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {TRACKING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
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
                      ? "border-zinc-950 bg-zinc-950 text-zinc-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
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
          className="rounded-lg bg-zinc-950 px-4 py-3 text-base font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
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
    </main>
  );
}
