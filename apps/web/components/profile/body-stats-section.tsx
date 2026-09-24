"use client";

import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { cmToFeetInches, feetInchesToCm } from "@/lib/settings/height";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Postgres numeric columns round-trip as fixed-scale strings ("178.0",
 * "175.00") — displaying that back in the input a user typed "178" or "175"
 * into reads as "did my value change?" on top of an already-silent save.
 * Strips the trailing precision back down to what a person actually typed.
 */
function formatNumericField(value: string | null | undefined): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function feetField(heightCm: string | null | undefined): string {
  const height = cmToFeetInches(heightCm);
  return height ? String(height.feet) : "";
}

function inchesField(heightCm: string | null | undefined): string {
  const height = cmToFeetInches(heightCm);
  return height ? String(height.inches) : "";
}

/**
 * Height is still stored in cm (`users.height_cm`); it's only entered and
 * shown in feet and inches — see lib/settings/height.ts.
 *
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
  const [heightFeet, setHeightFeet] = useState(feetField(settings.heightCm));
  const [heightInches, setHeightInches] = useState(inchesField(settings.heightCm));
  const [bodyweight, setBodyweight] = useState(formatNumericField(settings.bodyweight));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Only sync form state from the cache once it first loads — not on every
  // change, or a save-in-flight edit would get clobbered by a stale re-render.
  useEffect(() => {
    if (!cached) return;
    setSex(cached.sex ?? "");
    setBirthdate(cached.birthdate ?? "");
    setHeightFeet(feetField(cached.heightCm));
    setHeightInches(inchesField(cached.heightCm));
    setBodyweight(formatNumericField(cached.bodyweight));
  }, [cached]);

  // A successful save otherwise leaves no trace — the button just goes back
  // to reading "Save" — which reads as "did that actually do anything?". Show
  // a confirmation for a couple seconds instead of silence.
  useEffect(() => {
    if (status !== "saved") return;
    const id = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(id);
  }, [status]);

  async function handleSave() {
    const heightBlank = heightFeet.trim() === "" && heightInches.trim() === "";
    const heightCm = heightBlank
      ? null
      : feetInchesToCm(Number(heightFeet || 0), Number(heightInches || 0));
    if (!heightBlank && (heightCm === null || Number(heightInches || 0) >= 12)) {
      setStatus("error");
      setError("Height must be feet plus 0–11 inches");
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
      heightCm: heightCm === null ? null : String(heightCm),
      bodyweight: bodyweight.trim() === "" ? null : String(Number(bodyweight)),
    });
    if (result.ok) {
      setStatus("saved");
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

      <fieldset className="flex flex-col gap-1 text-xs font-medium">
        <legend className="mb-1">Height</legend>
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={heightFeet}
              onChange={(event) => setHeightFeet(event.target.value)}
              aria-label="Height, feet"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            ft
          </label>
          <label className="flex flex-1 items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={11}
              value={heightInches}
              onChange={(event) => setHeightInches(event.target.value)}
              aria-label="Height, inches"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            in
          </label>
        </div>
      </fieldset>

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
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save"}
      </button>
    </div>
  );
}
