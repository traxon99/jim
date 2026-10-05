"use client";

import {
  PROGRESSION_TYPES,
  PROGRESSION_TYPE_LABELS,
  type ProgressionRule,
  type ProgressionType,
  type RepScheme,
  parseProgressionRule,
} from "@jim/core";
import { useState } from "react";

interface Props {
  rule: ProgressionRule | null;
  units: "lb" | "kg";
  /** DPR is focusing on this lift: only one automatic system per lift (ADR-016). */
  dprFocused: boolean;
  onChange: (rule: ProgressionRule | null) => void;
}

const FIELD =
  "rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function numberText(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

/** "5x3, 6x2, 10x1" ↔ stages; null when the text doesn't parse. */
export function parseStages(text: string): RepScheme[] | null {
  const parts = text
    .split(/[,→>]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const stages: RepScheme[] = [];
  for (const part of parts) {
    const match = /^(\d+)\s*[x×*]\s*(\d+)$/i.exec(part);
    if (!match) return null;
    stages.push({ sets: Number(match[1]), reps: Number(match[2]) });
  }
  return stages;
}

function stagesText(stages: readonly RepScheme[] | null | undefined): string {
  return (stages ?? []).map((s) => `${s.sets}x${s.reps}`).join(", ");
}

/**
 * The routine editor's custom progression rule (issue #255): a type, the
 * weight added on success, linear's GZCLP-style rep schemes, reps-sum's
 * total, and an optional deload. Each field commits on blur, like the rest
 * of the row; a field that doesn't parse leaves the saved rule alone.
 */
export function ProgressionRuleEditor({ rule, units, dprFocused, onChange }: Props) {
  const [type, setType] = useState<ProgressionType | "">(rule?.type ?? "");
  const [increment, setIncrement] = useState(numberText(rule?.increment));
  const [stages, setStages] = useState(stagesText(rule?.stages));
  const [repsSum, setRepsSum] = useState(numberText(rule?.repsSumTarget));
  const [deloadAfter, setDeloadAfter] = useState(numberText(rule?.deload?.afterFailures));
  const [deloadPct, setDeloadPct] = useState(
    rule?.deload ? String(Math.round(rule.deload.pct * 100)) : "",
  );

  function commit(
    next: Partial<{
      type: ProgressionType | "";
      increment: string;
      stages: string;
      repsSum: string;
      deloadAfter: string;
      deloadPct: string;
    }> = {},
  ) {
    const values = { type, increment, stages, repsSum, deloadAfter, deloadPct, ...next };
    if (values.type === "") {
      onChange(null);
      return;
    }
    const parsedStages = values.stages.trim() === "" ? [] : parseStages(values.stages);
    if (parsedStages === null) return;
    const after = Number(values.deloadAfter);
    const pct = Number(values.deloadPct);
    const parsed = parseProgressionRule({
      type: values.type,
      increment: Number(values.increment),
      stages: parsedStages,
      repsSumTarget: values.repsSum.trim() === "" ? null : Number(values.repsSum),
      deload:
        values.deloadAfter.trim() !== "" && values.deloadPct.trim() !== ""
          ? { afterFailures: after, pct: pct / 100 }
          : null,
    });
    if (parsed) onChange(parsed);
  }

  if (dprFocused && !rule) {
    return (
      <p className="pl-10 text-xs text-zinc-500 dark:text-zinc-500">
        Progression: DPR. Remove this lift from your DPR focus to give it a custom rule.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 pl-10">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Progression
        <select
          value={type}
          onChange={(event) => {
            const value = event.target.value as ProgressionType | "";
            setType(value);
            // A new rule needs an increment to be valid; start from one step.
            const step = increment.trim() === "" ? (units === "kg" ? "2.5" : "5") : increment;
            setIncrement(step);
            commit({ type: value, increment: step });
          }}
          className={FIELD}
        >
          <option value="">{dprFocused ? "None" : "None (last time)"}</option>
          {PROGRESSION_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROGRESSION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {type !== "" && (
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            +{units} on success
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={increment}
              onChange={(event) => setIncrement(event.target.value)}
              onBlur={() => commit()}
              className={`w-20 ${FIELD}`}
            />
          </label>
          {type === "reps_sum" && (
            <label className="flex flex-col gap-1 text-xs font-medium">
              Total reps
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={repsSum}
                onChange={(event) => setRepsSum(event.target.value)}
                onBlur={() => commit()}
                className={`w-20 ${FIELD}`}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium">
            Deload after
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="misses"
              value={deloadAfter}
              onChange={(event) => setDeloadAfter(event.target.value)}
              onBlur={() => commit()}
              className={`w-20 ${FIELD}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Deload %
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={deloadPct}
              onChange={(event) => setDeloadPct(event.target.value)}
              onBlur={() => commit()}
              className={`w-20 ${FIELD}`}
            />
          </label>
        </div>
      )}

      {type === "linear" && (
        <label className="flex flex-col gap-1 text-xs font-medium">
          Rep schemes on a miss (optional)
          <input
            type="text"
            placeholder="5x3, 6x2, 10x1"
            value={stages}
            onChange={(event) => setStages(event.target.value)}
            onBlur={() => commit()}
            className={`min-w-0 ${FIELD} px-3`}
          />
        </label>
      )}

      {dprFocused && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          This lift is also in your DPR focus. The rule sets its weight, not DPR.
        </p>
      )}
    </div>
  );
}
