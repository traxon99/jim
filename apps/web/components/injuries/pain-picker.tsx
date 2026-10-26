"use client";

import { PAIN_LEVELS, painLabel } from "@jim/core";

/**
 * Pain level 0–10 (issue #627) as two rows of buttons, so each stays a
 * full-size tap target at 393 px, with the picked level's word label below.
 */
export function PainPicker({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (level: number) => void;
  /** Read out for the group, e.g. "Left knee pain today". */
  label: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-6 gap-1.5">
        {PAIN_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={value === level}
            aria-label={`${level}, ${painLabel(level)}`}
            onClick={() => onChange(level)}
            className={`min-h-11 min-w-0 rounded-lg border text-sm font-semibold ${
              value === level
                ? "border-accent bg-accent text-accent-foreground"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {level}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-500" aria-live="polite">
        {value === null ? "0 is no pain, 10 the worst" : `${value}: ${painLabel(value)}`}
      </p>
    </fieldset>
  );
}
