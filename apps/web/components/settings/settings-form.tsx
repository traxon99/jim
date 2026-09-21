"use client";

import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";

export function SettingsForm() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const settings = cached ?? DEFAULT_SETTINGS;

  const [units, setUnits] = useState(settings.units);
  const [barWeight, setBarWeight] = useState(settings.defaultBarWeight);
  const [plates, setPlates] = useState(settings.availablePlates.join(", "));
  const [restSeconds, setRestSeconds] = useState(settings.defaultRestSeconds.toString());
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Only sync form state from the cache once it first loads — not on every
  // change, or a save-in-flight edit would get clobbered by a stale re-render.
  useEffect(() => {
    if (!cached) return;
    setUnits(cached.units);
    setBarWeight(cached.defaultBarWeight);
    setPlates(cached.availablePlates.join(", "));
    setRestSeconds(cached.defaultRestSeconds.toString());
  }, [cached]);

  async function handleSave() {
    const parsedPlates = plates
      .split(",")
      .map((p) => Number(p.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    const parsedBarWeight = Number(barWeight);
    const parsedRestSeconds = Number(restSeconds);

    if (!Number.isFinite(parsedBarWeight) || parsedBarWeight <= 0 || parsedPlates.length === 0) {
      setStatus("error");
      setError("Bar weight and plates must be positive numbers");
      return;
    }

    setStatus("saving");
    setError(null);
    const result = await patchSettings({
      units,
      defaultBarWeight: String(parsedBarWeight),
      availablePlates: parsedPlates.map(String),
      defaultRestSeconds: Math.max(0, Math.round(parsedRestSeconds)),
    });
    if (result.ok) {
      setStatus("idle");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3 text-left">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Units
        <select
          value={units}
          onChange={(event) => setUnits(event.target.value as "lb" | "kg")}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="lb">lb</option>
          <option value="kg">kg</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Bar weight
        <input
          type="number"
          inputMode="decimal"
          value={barWeight}
          onChange={(event) => setBarWeight(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Available plates (comma-separated)
        <input
          type="text"
          value={plates}
          onChange={(event) => setPlates(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Default rest (seconds)
        <input
          type="number"
          inputMode="numeric"
          value={restSeconds}
          onChange={(event) => setRestSeconds(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      {error && <p className="text-xs text-red-600 dark:text-red-500">{error}</p>}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={status === "saving"}
        className="min-h-11 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
      >
        {status === "saving" ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
