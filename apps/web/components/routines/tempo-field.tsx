"use client";

import { parseTempo, tempoFromInputs, tempoSecondsPerRep } from "@jim/core";
import { useEffect, useId, useRef, useState } from "react";

const INPUT_CLASS =
  "w-14 min-w-0 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-center text-base font-semibold tabular-nums text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function phasesOf(value: string | null | undefined): [string, string, string] {
  const tempo = parseTempo(value);
  return tempo ? [String(tempo[0]), String(tempo[1]), String(tempo[2])] : ["", "", ""];
}

function formatSeconds(seconds: number): string {
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}

/**
 * A routine exercise's tempo (issue #845): Down, Pause and Up in seconds, X
 * allowed on Up. Saves when focus leaves the three inputs, and only when the
 * value changed; an invalid entry shows an error and saves nothing.
 */
export function TempoField({
  value,
  onCommit,
}: {
  value: string | null | undefined;
  onCommit: (tempo: string | null) => void;
}) {
  const id = useId();
  const [phases, setPhases] = useState(() => phasesOf(value));
  const [invalid, setInvalid] = useState(false);
  const editing = useRef(false);

  // Pick up a tempo changed on another device or by Claude (issue #519),
  // except while the user is typing in these inputs.
  useEffect(() => {
    if (editing.current) return;
    setPhases(phasesOf(value));
    setInvalid(false);
  }, [value]);

  function commit(next: readonly [string, string, string]) {
    const tempo = tempoFromInputs(...next);
    if (tempo === "invalid") {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setPhases(phasesOf(tempo));
    if (tempo !== (value ?? null)) onCommit(tempo);
  }

  function setPhase(index: 0 | 1 | 2, text: string) {
    const next = [...phases] as [string, string, string];
    next[index] = text.toUpperCase();
    setPhases(next);
  }

  // Follows what's typed, so the time per rep updates before saving.
  const typed = tempoFromInputs(...phases);
  const preview = typed === "invalid" ? null : parseTempo(typed);
  const hasInput = phases.some((phase) => phase.trim() !== "");
  const fields = [
    { label: "Down", name: "Lowering seconds", inputMode: "numeric" as const },
    { label: "Pause", name: "Pause at the bottom, seconds", inputMode: "numeric" as const },
    { label: "Up", name: "Lifting seconds, or X for explosive", inputMode: "text" as const },
  ];

  return (
    <fieldset
      className="flex flex-col gap-1 pl-10"
      aria-describedby={invalid ? `${id}-error` : undefined}
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        editing.current = false;
        commit(phases);
      }}
    >
      <legend className="flex w-full items-baseline gap-2 text-xs font-medium">
        Tempo
        {preview && (
          <span className="font-normal text-zinc-500 tabular-nums dark:text-zinc-400">
            {formatSeconds(tempoSecondsPerRep(preview))} s per rep
          </span>
        )}
      </legend>
      <div className="flex flex-wrap items-end gap-2">
        {fields.map((field, index) => (
          <label
            key={field.label}
            className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400"
          >
            {field.label}
            <input
              type="text"
              inputMode={field.inputMode}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={2}
              aria-label={field.name}
              aria-invalid={invalid || undefined}
              value={phases[index]}
              onChange={(event) => setPhase(index as 0 | 1 | 2, event.target.value)}
              className={INPUT_CLASS}
            />
          </label>
        ))}
        {hasInput && (
          <button
            type="button"
            onClick={() => commit(["", "", ""])}
            aria-label="Clear tempo"
            className="min-h-11 px-2 text-xs font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
          >
            Clear
          </button>
        )}
      </div>
      {invalid && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
          0 to 20 seconds each, at least one above 0. Only Up can be X.
        </p>
      )}
    </fieldset>
  );
}
