"use client";

import type { SettingsRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";

const OPTIONS: { value: SettingsRow["colorScheme"]; label: string; Icon: typeof Monitor }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

// Applies immediately on tap — a theme preference isn't a form field to
// batch behind a "Save" button. The actual light/dark switch happens in
// components/color-scheme-effect.tsx, driven by this same settings row.
export function ColorSchemeSection() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const colorScheme = cached?.colorScheme ?? DEFAULT_SETTINGS.colorScheme;
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: SettingsRow["colorScheme"]) {
    if (value === colorScheme) return;
    setError(null);
    const result = await patchSettings({ colorScheme: value });
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Appearance
      </h2>

      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => void handleChange(option.value)}
            aria-pressed={colorScheme === option.value}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
              colorScheme === option.value
                ? "border-zinc-950 bg-zinc-950 text-zinc-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                : "border-zinc-300 bg-white text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            }`}
          >
            <option.Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {option.label}
          </button>
        ))}
      </div>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
