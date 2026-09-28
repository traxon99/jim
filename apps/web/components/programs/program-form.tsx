"use client";

import { mutate } from "@/lib/db/mutate";
import { type ProgramRow, db } from "@/lib/db/schema";
import { setActiveProgram } from "@/lib/programs/set-active";
import { getDeviceId } from "@/lib/sync/engine";
import { PROGRAM_DURATION_OPTIONS, type ProgramMode, uuidv7 } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Props {
  userId: string;
  mode: "new" | "edit";
  programId?: string;
}

const MODES: { value: ProgramMode; label: string; description: string }[] = [
  {
    value: "sequence",
    label: "Sequence",
    description: "Rotate through the routines in order — next up is the one after your last.",
  },
  {
    value: "weekly",
    label: "Weekly schedule",
    description: "Pin each routine to a day of the week.",
  },
];

export function ProgramForm({ userId, mode, programId }: Props) {
  const router = useRouter();
  const existing = useLiveQuery(
    () => (programId ? db.programs.get(programId) : undefined),
    [programId],
  );

  const [name, setName] = useState("");
  const [programMode, setProgramMode] = useState<ProgramMode>("sequence");
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [durationWeeks, setDurationWeeks] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setProgramMode(existing.mode);
    setActive(existing.isActive);
    setNotes(existing.notes ?? "");
    setDurationWeeks(existing.durationWeeks);
  }, [existing]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const deviceId = await getDeviceId();
    const now = new Date();

    let entity: ProgramRow;
    if (mode === "new" || !existing) {
      entity = {
        id: uuidv7(),
        userId,
        name,
        mode: programMode,
        isActive: false,
        notes: notes.trim() || null,
        position: await db.programs.count(),
        durationWeeks,
        activatedAt: null,
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
        mode: programMode,
        notes: notes.trim() || null,
        durationWeeks,
        // An already-active program getting a length for the first time
        // starts its week count now.
        activatedAt:
          existing.isActive && durationWeeks && !existing.activatedAt ? now : existing.activatedAt,
        updatedAt: now,
        deviceId,
      };
    }

    await mutate("programs", entity);
    if (active !== entity.isActive) {
      await setActiveProgram(active ? entity.id : null);
    }
    router.push(`/routines/programs/${entity.id}`);
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
      <h1 className="text-xl font-semibold">{mode === "new" ? "New program" : "Edit program"}</h1>
      {mode === "new" && (
        <Link
          href="/routines/programs/generate"
          data-ripple
          className="rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
        >
          Not sure where to start? Answer a few questions and Jim will build one for you.
        </Link>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Push/Pull/Legs, Upper/Lower…"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Suggest workouts by</legend>
          {MODES.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                programMode === option.value
                  ? "border-accent"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={option.value}
                checked={programMode === option.value}
                onChange={() => setProgramMode(option.value)}
                className="mt-1"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-medium">{option.label}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Duration
          <select
            value={durationWeeks ?? ""}
            onChange={(event) =>
              setDurationWeeks(event.target.value ? Number(event.target.value) : null)
            }
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">No set length</option>
            {/* A duration set before these options existed stays selectable. */}
            {[...new Set([...PROGRAM_DURATION_OPTIONS, ...(durationWeeks ? [durationWeeks] : [])])]
              .sort((a, b) => a - b)
              .map((weeks) => (
                <option key={weeks} value={weeks}>
                  {weeks} weeks
                </option>
              ))}
          </select>
        </label>

        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="h-5 w-5"
          />
          Active — suggest my next workout from this program
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "new" ? "Next: add routines" : "Save"}
        </button>
      </form>
    </main>
  );
}
