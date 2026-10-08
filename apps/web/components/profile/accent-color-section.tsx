"use client";

import type { SettingsRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

const OPTIONS: { value: SettingsRow["accentColor"]; label: string; swatchClassName: string }[] = [
  { value: "zinc", label: "Default", swatchClassName: "bg-zinc-950 dark:bg-zinc-50" },
  { value: "blue", label: "Blue", swatchClassName: "bg-[#2563eb]" },
  { value: "green", label: "Green", swatchClassName: "bg-[#16a34a]" },
  { value: "purple", label: "Purple", swatchClassName: "bg-[#9333ea]" },
  { value: "orange", label: "Orange", swatchClassName: "bg-[#ea580c]" },
  { value: "rose", label: "Rose", swatchClassName: "bg-[#e11d48]" },
  { value: "pink", label: "Pastel pink", swatchClassName: "bg-[#f48fb1] dark:bg-[#f9a8d4]" },
];

// Same "applies immediately, no Save button" pattern as ColorSchemeSection —
// see that component for why. The actual `data-accent` attribute switch
// happens in components/color-scheme-effect.tsx, driven by this same row.
export function AccentColorSection() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const accentColor = cached?.accentColor ?? DEFAULT_SETTINGS.accentColor;
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: SettingsRow["accentColor"]) {
    if (value === accentColor) return;
    setError(null);
    const result = await patchSettings({ accentColor: value });
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Accent color
      </h2>

      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => void handleChange(option.value)}
            aria-pressed={accentColor === option.value}
            aria-label={option.label}
            title={option.label}
            className={`flex h-11 w-11 items-center justify-center rounded-lg border ${
              accentColor === option.value
                ? "border-zinc-950 dark:border-zinc-50"
                : "border-transparent"
            }`}
          >
            <span
              className={`h-6 w-6 rounded-full border border-black/10 dark:border-white/10 ${option.swatchClassName}`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
