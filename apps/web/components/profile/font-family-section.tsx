"use client";

import type { SettingsRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

const OPTIONS: { value: SettingsRow["fontFamily"]; label: string; previewClassName: string }[] = [
  { value: "sans", label: "Default", previewClassName: "" },
  { value: "serif", label: "Serif", previewClassName: "font-serif" },
  { value: "mono", label: "Mono", previewClassName: "font-mono" },
];

// Same "applies immediately, no Save button" pattern as ColorSchemeSection and
// AccentColorSection — see ColorSchemeSection for why. The actual font switch
// happens in components/color-scheme-effect.tsx via the `data-font` attribute,
// driven by this same row.
export function FontFamilySection() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const fontFamily = cached?.fontFamily ?? DEFAULT_SETTINGS.fontFamily;
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: SettingsRow["fontFamily"]) {
    if (value === fontFamily) return;
    setError(null);
    const result = await patchSettings({ fontFamily: value });
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Font
      </h2>

      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => void handleChange(option.value)}
            aria-pressed={fontFamily === option.value}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 ${
              fontFamily === option.value
                ? "border-accent bg-accent text-accent-foreground"
                : "border-zinc-300 bg-white text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            }`}
          >
            <span className={`text-lg leading-none ${option.previewClassName}`} aria-hidden="true">
              Aa
            </span>
            <span className="text-xs font-medium">{option.label}</span>
          </button>
        ))}
      </div>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
