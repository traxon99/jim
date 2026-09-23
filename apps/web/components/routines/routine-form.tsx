"use client";

import { mutate } from "@/lib/db/mutate";
import { type RoutineRow, db } from "@/lib/db/schema";
import { addWarmupTemplate } from "@/lib/routines/warmup-templates";
import { getDeviceId } from "@/lib/sync/engine";
import { type RoutineKind, WARMUP_TEMPLATES, isWarmupRoutine, uuidv7 } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function toMinutesOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

interface Props {
  userId: string;
  mode: "new" | "edit";
  routineId?: string;
}

export function RoutineForm({ userId, mode, routineId }: Props) {
  const router = useRouter();
  const existing = useLiveQuery(
    () => (routineId ? db.routines.get(routineId) : undefined),
    [routineId],
  );

  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [kind, setKind] = useState<RoutineKind>("strength");
  // "" = no warm-up, "routine:<id>" = one of the user's warm-up routines,
  // "template:<key>" = a built-in template, added as a routine on save.
  const [warmupChoice, setWarmupChoice] = useState("");
  const [warmupMinutes, setWarmupMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  const allRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const warmupRoutines = useMemo(
    () =>
      (allRoutines ?? [])
        .filter((r) => !r.deletedAt && isWarmupRoutine(r) && r.id !== routineId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allRoutines, routineId],
  );
  const linkedWarmup = warmupChoice.startsWith("routine:")
    ? warmupRoutines.find((r) => r.id === warmupChoice.slice("routine:".length))
    : undefined;
  const linkedTemplate = warmupChoice.startsWith("template:")
    ? WARMUP_TEMPLATES.find((t) => t.key === warmupChoice.slice("template:".length))
    : undefined;
  const defaultWarmupMinutes = linkedWarmup?.warmupMinutes ?? linkedTemplate?.minutes ?? null;

  // Populate the form once the existing row loads (edit mode).
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setFolder(existing.folder ?? "");
    setNotes(existing.notes ?? "");
    setNotesOpen(Boolean(existing.notes));
    setKind(isWarmupRoutine(existing) ? "warmup" : "strength");
    setWarmupChoice(existing.warmupRoutineId ? `routine:${existing.warmupRoutineId}` : "");
    setWarmupMinutes(existing.warmupMinutes?.toString() ?? "");
  }, [existing]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    let warmupRoutineId: string | null = null;
    if (kind === "strength") {
      if (linkedWarmup) warmupRoutineId = linkedWarmup.id;
      else if (linkedTemplate) {
        warmupRoutineId = (await addWarmupTemplate(userId, linkedTemplate)).routineId;
      }
    }
    const warmupFields = {
      kind,
      warmupRoutineId,
      warmupMinutes: toMinutesOrNull(warmupMinutes),
    };

    const deviceId = await getDeviceId();
    const now = new Date();

    let entity: RoutineRow;

    if (mode === "new" || !existing) {
      const position = await db.routines.count();
      entity = {
        id: uuidv7(),
        userId,
        name,
        notes: notes.trim() || null,
        position,
        folder: folder.trim() || null,
        ...warmupFields,
        createdAt: now,
        updatedAt: now,
        deviceId,
        deletedAt: null,
        serverSeq: 0,
      };
    } else {
      entity = {
        ...existing,
        name,
        notes: notes.trim() || null,
        folder: folder.trim() || null,
        ...warmupFields,
        updatedAt: now,
        deviceId,
      };
    }

    await mutate("routines", entity);
    router.push(`/routines/${entity.id}`);
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
      <h1 className="text-xl font-semibold">{mode === "new" ? "New routine" : "Edit routine"}</h1>

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
          Folder
          <input
            type="text"
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            placeholder="Push/Pull/Legs, 5/3/1…"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">Type</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
            {(
              [
                { value: "strength", label: "Workout" },
                { value: "warmup", label: "Warm-up" },
              ] as const
            ).map((option) => {
              const selected = kind === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setKind(option.value)}
                  className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                    selected
                      ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {kind === "warmup" && (
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              A reusable warm-up you can attach to any workout routine.
            </span>
          )}
        </fieldset>

        {kind === "strength" && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Warm-up
            <select
              value={warmupChoice}
              onChange={(event) => setWarmupChoice(event.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">None</option>
              {warmupRoutines.length > 0 && (
                <optgroup label="My warm-ups">
                  {warmupRoutines.map((r) => (
                    <option key={r.id} value={`routine:${r.id}`}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Templates">
                {WARMUP_TEMPLATES.map((t) => (
                  <option key={t.key} value={`template:${t.key}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium">
          Warm-up length (minutes)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={warmupMinutes}
            onChange={(event) => setWarmupMinutes(event.target.value)}
            placeholder={defaultWarmupMinutes?.toString() ?? "No timer"}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
            Times the warm-up block at the start of the workout.
          </span>
        </label>

        {notesOpen ? (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            data-ripple
            className="self-start rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            Add notes
          </button>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </main>
  );
}
