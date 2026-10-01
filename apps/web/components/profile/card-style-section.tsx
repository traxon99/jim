"use client";

import type { SettingsRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

const OPTIONS: { value: SettingsRow["cardStyle"]; label: string; previewClassName: string }[] = [
  {
    value: "plain",
    label: "Plain",
    previewClassName: "border border-zinc-400 dark:border-zinc-600",
  },
  {
    value: "glass",
    label: "Frosted glass",
    previewClassName:
      "bg-[radial-gradient(circle_at_30%_30%,#ec4899,transparent_65%),radial-gradient(circle_at_75%_70%,#d946ef,transparent_65%)] blur-[1px]",
  },
];

// Same "applies immediately, no Save button" pattern as ColorSchemeSection —
// see that component for why. The actual switch happens in
// components/color-scheme-effect.tsx via the `data-cards` attribute, driven by
// this same row; globals.css's `.tinted-card` rules do the drawing.
export function CardStyleSection() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const cardStyle = cached?.cardStyle ?? DEFAULT_SETTINGS.cardStyle;
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: SettingsRow["cardStyle"]) {
    if (value === cardStyle) return;
    setError(null);
    const result = await patchSettings({ cardStyle: value });
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Card style
      </h2>

      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => void handleChange(option.value)}
            aria-pressed={cardStyle === option.value}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              cardStyle === option.value
                ? "border-accent bg-accent text-accent-foreground"
                : "border-zinc-300 bg-white text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            }`}
          >
            <span
              className={`h-4 w-4 shrink-0 rounded ${option.previewClassName}`}
              aria-hidden="true"
            />
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Frosted glass tints the Up next card and the workout preview with each routine&apos;s color.
      </p>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
