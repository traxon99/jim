"use client";

import { logBodyweight } from "@/lib/bodyweight";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { cmToFeetInches, feetInchesToCm } from "@/lib/settings/height";
import { runSyncCycle } from "@/lib/sync/engine";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
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
export function BodyStatsSection({ userId }: { userId?: string }) {
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

  // A save as you go otherwise leaves no trace, which reads as "did that
  // actually do anything?". Show a confirmation for a couple seconds.
  useEffect(() => {
    if (status !== "saved") return;
    const id = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(id);
  }, [status]);

  // Saves as you go (issue #331): pickers on change, typed fields on blur.
  // `next` carries a just-picked value the state hasn't caught up to yet.
  async function handleSave(next: { sex?: "male" | "female" | ""; birthdate?: string } = {}) {
    const sexValue = next.sex ?? sex;
    const birthdateValue = next.birthdate ?? birthdate;
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
    const previousBodyweight = settings.bodyweight == null ? null : Number(settings.bodyweight);
    const result = await patchSettings({
      sex: sexValue === "" ? null : sexValue,
      birthdate: birthdateValue === "" ? null : birthdateValue,
      heightCm: heightCm === null ? null : String(heightCm),
      bodyweight: bodyweight.trim() === "" ? null : String(Number(bodyweight)),
    });
    if (result.ok) {
      // A changed bodyweight is also today's weigh-in (issue #377), so the
      // history on the Bodyweight page picks it up.
      const nextBodyweight = bodyweight.trim() === "" ? null : Number(bodyweight);
      if (userId && nextBodyweight != null && nextBodyweight !== previousBodyweight) {
        await logBodyweight({
          userId,
          value: nextBodyweight,
          unit: settings.units,
          measuredAt: new Date(),
        });
        void runSyncCycle();
      }
      setStatus("saved");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
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
          onChange={(event) => {
            const value = event.target.value as "male" | "female" | "";
            setSex(value);
            void handleSave({ sex: value });
          }}
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
          onChange={(event) => {
            setBirthdate(event.target.value);
            void handleSave({ birthdate: event.target.value });
          }}
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
              onBlur={() => void handleSave()}
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
              onBlur={() => void handleSave()}
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
          onBlur={() => void handleSave()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>
      <Link
        href="/profile/weight"
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
      >
        Bodyweight history
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </Link>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}

      {(status === "saving" || status === "saved") && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          {status === "saving" ? "Saving…" : "Saved"}
        </p>
      )}
    </div>
  );
}
