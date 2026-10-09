"use client";

import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import type { GymRow } from "@/lib/db/schema";
import {
  GYM_ADDRESS_MAX,
  GYM_NAME_MAX,
  GYM_NOTES_MAX,
  addGym,
  cleanGymInput,
  deleteGym,
  setDefaultGym,
  sortGyms,
  updateGym,
} from "@/lib/gyms";
import { runSyncCycle } from "@/lib/sync/engine";
import { useLiveQuery } from "dexie-react-hooks";
import { MapPin, Pencil, Star } from "lucide-react";
import { useMemo, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

interface Draft {
  name: string;
  address: string;
  notes: string;
}

const EMPTY_DRAFT: Draft = { name: "", address: "", notes: "" };

function GymFields({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Name
        <input
          type="text"
          value={draft.name}
          maxLength={GYM_NAME_MAX}
          placeholder="e.g. Iron Temple"
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Address (optional)
        <input
          type="text"
          value={draft.address}
          maxLength={GYM_ADDRESS_MAX}
          autoComplete="street-address"
          onChange={(event) => onChange({ ...draft, address: event.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Notes (optional)
        <textarea
          value={draft.notes}
          maxLength={GYM_NOTES_MAX}
          rows={2}
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
          className={inputClass}
        />
      </label>
    </>
  );
}

/**
 * Settings → Gyms (issue #451): the places you train. Reads and writes
 * IndexedDB, so it works offline; gyms sync through the outbox. The home gym
 * is starred and listed first. Equipment (issue #450) will attach to a gym.
 */
export function GymsHome({ userId }: { userId: string }) {
  const rows = useLiveQuery(() => db.gyms.toArray(), []);
  const gyms = useMemo(() => sortGyms(rows ?? []), [rows]);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editError, setEditError] = useState<string | null>(null);

  async function handleAdd() {
    const cleaned = cleanGymInput(draft);
    if (!cleaned.ok) {
      setAddError(cleaned.error);
      return;
    }
    setSaving(true);
    setAddError(null);
    try {
      await addGym({ userId, ...draft });
      setDraft(EMPTY_DRAFT);
      void runSyncCycle();
    } catch {
      setAddError("Couldn't save that gym. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(gym: GymRow) {
    setEditingId(gym.id);
    setEditDraft({ name: gym.name, address: gym.address ?? "", notes: gym.notes ?? "" });
    setEditError(null);
  }

  async function handleSave(gym: GymRow) {
    const cleaned = cleanGymInput(editDraft);
    if (!cleaned.ok) {
      setEditError(cleaned.error);
      return;
    }
    try {
      await updateGym(gym, editDraft);
      setEditingId(null);
      void runSyncCycle();
    } catch {
      setEditError("Couldn't save that gym. Try again.");
    }
  }

  async function handleDelete(gym: GymRow) {
    await deleteGym(gym);
    setEditingId(null);
    void runSyncCycle();
  }

  async function handleMakeHome(gym: GymRow) {
    if (gym.isDefault) return;
    await setDefaultGym(gym.id);
    void runSyncCycle();
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Gyms" back={{ href: "/profile/settings", label: "Settings" }} />
      <div className={PAGE_BODY}>
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Your gyms
          </h2>
          {rows !== undefined && gyms.length === 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No gyms yet. Add the place you train below. Your first gym becomes your home gym.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {gyms.map((gym) =>
              editingId === gym.id ? (
                <li
                  key={gym.id}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700"
                >
                  <GymFields draft={editDraft} onChange={setEditDraft} />
                  {editError && (
                    <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">
                      {editError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDelete(gym)}
                      className="flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-red-600 dark:text-red-500"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="ml-auto flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSave(gym)}
                      disabled={editDraft.name.trim() === ""}
                      className="flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={gym.id}
                  className="flex min-w-0 items-center gap-1 rounded-lg border border-zinc-300 py-1 pl-1 pr-1 dark:border-zinc-700"
                >
                  <button
                    type="button"
                    onClick={() => void handleMakeHome(gym)}
                    aria-pressed={gym.isDefault}
                    aria-label={
                      gym.isDefault
                        ? `${gym.name} is your home gym`
                        : `Make ${gym.name} your home gym`
                    }
                    className={`flex h-11 w-11 shrink-0 items-center justify-center ${
                      gym.isDefault ? "text-accent" : "text-zinc-400 dark:text-zinc-600"
                    }`}
                  >
                    <Star
                      className="h-5 w-5"
                      strokeWidth={1.75}
                      fill={gym.isDefault ? "currentColor" : "none"}
                      aria-hidden="true"
                    />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate text-sm font-medium">{gym.name}</span>
                    {gym.address && (
                      <span className="flex min-w-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-500">
                        <MapPin
                          className="h-3 w-3 shrink-0"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span className="truncate">{gym.address}</span>
                      </span>
                    )}
                    {gym.isDefault && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-500">Home gym</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(gym)}
                    aria-label={`Edit ${gym.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-500 dark:text-zinc-400"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Add a gym
          </h2>
          <GymFields draft={draft} onChange={setDraft} />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={saving || draft.name.trim() === ""}
            className="flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add gym"}
          </button>
          {addError && (
            <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{addError}</p>
          )}
        </section>
      </div>
    </main>
  );
}
