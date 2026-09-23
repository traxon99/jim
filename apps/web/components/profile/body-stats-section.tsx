"use client";

import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Sex, birthdate and bodyweight feed the strength-standards lookup
 * (@jim/core's strength-standards module) so PRs and suggested weights can
 * be placed against a standard. Height is collected too (per the request
 * that started this), but none of the published bodyweight-ratio standards
 * this app uses factor it in — it's stored for the user's own record and any
 * future feature, not read by strength-standards today. Every field is
 * optional: leaving them blank just means no standard is shown.
 */
export function BodyStatsSection() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const settings = cached ?? DEFAULT_SETTINGS;

  const [sex, setSex] = useState<"male" | "female" | "">(settings.sex ?? "");
  const [birthdate, setBirthdate] = useState(settings.birthdate ?? "");
  const [heightCm, setHeightCm] = useState(settings.heightCm ?? "");
  const [bodyweight, setBodyweight] = useState(settings.bodyweight ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Same "sync from cache once on load" pattern as ProfileForm — see there
  // for why not on every change.
  useEffect(() => {
    if (!cached) return;
    setSex(cached.sex ?? "");
    setBirthdate(cached.birthdate ?? "");
    setHeightCm(cached.heightCm ?? "");
    setBodyweight(cached.bodyweight ?? "");
  }, [cached]);

  async function handleSave() {
    if (heightCm.trim() !== "" && (!Number.isFinite(Number(heightCm)) || Number(heightCm) <= 0)) {
      setStatus("error");
      setError("Height must be a positive number");
      return;
    }
    if (
      bodyweight.trim() !== "" &&
      (!Number.isFinite(Number(bodyweight)) || Number(bodyweight) <= 0)
    ) {
      setStatus("error");
      setError("Bodyweight must be a positive number");
      return;
    }

    setStatus("saving");
    setError(null);
    const result = await patchSettings({
      sex: sex === "" ? null : sex,
      birthdate: birthdate === "" ? null : birthdate,
      heightCm: heightCm.trim() === "" ? null : String(Number(heightCm)),
      bodyweight: bodyweight.trim() === "" ? null : String(Number(bodyweight)),
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
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Body stats
      </h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Used to show where your PRs rank against strength standards, and to suggest a starting
        weight.
      </p>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Sex
        <select
          value={sex}
          onChange={(event) => setSex(event.target.value as "male" | "female" | "")}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="">Not set</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Birthdate
        <input
          type="date"
          value={birthdate}
          onChange={(event) => setBirthdate(event.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Height (cm)
        <input
          type="number"
          inputMode="decimal"
          value={heightCm}
          onChange={(event) => setHeightCm(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Bodyweight ({settings.units})
        <input
          type="number"
          inputMode="decimal"
          value={bodyweight}
          onChange={(event) => setBodyweight(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={status === "saving"}
        className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {status === "saving" ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
