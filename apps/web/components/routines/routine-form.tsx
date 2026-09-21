"use client";

import { mutate } from "@/lib/db/mutate";
import { type RoutineRow, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import { uuidv7 } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [saving, setSaving] = useState(false);

  // Populate the form once the existing row loads (edit mode).
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setFolder(existing.folder ?? "");
    setNotes(existing.notes ?? "");
  }, [existing]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

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
          className="rounded-lg bg-zinc-950 px-4 py-3 text-base font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </main>
  );
}
