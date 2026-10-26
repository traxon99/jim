"use client";

import { ExercisePicker } from "@/components/exercise-picker";
import { FloatingCard } from "@/components/floating-card";
import { type InjuryRow, db } from "@/lib/db/schema";
import { removeExerciseRule, setExerciseRule } from "@/lib/injuries";
import {
  INJURY_RULE_EFFECTS,
  INJURY_RULE_EFFECT_LABELS,
  INJURY_RULE_NOTE_MAX,
  type InjuryExerciseRule,
  type InjuryRuleEffect,
  type WeightUnits,
  describeInjuryRule,
  exerciseDisplayName,
  injuryAreaLabel,
  normalizeDecimalInput,
  parseInjuryRules,
  ruleMaxWeight,
  ruleTakesLimits,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";

const EFFECT_DETAILS: Record<InjuryRuleEffect, string> = {
  fine: "Doesn't bother it: no hint, PRP as normal",
  limit: "Train it within a weight cap or rep range",
  light: "Go light on it, PRP's light day",
  avoid: "Skip or swap it",
};

const FIELD =
  "min-h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Add or edit one exercise's rule for an injury (issue #724). */
function ExerciseRuleCard({
  injury,
  exerciseId,
  exerciseName,
  existing,
  units,
  onClose,
}: {
  injury: InjuryRow;
  exerciseId: string;
  exerciseName: string;
  existing: InjuryExerciseRule | null;
  units: WeightUnits;
  onClose: () => void;
}) {
  // Seeded once (docs/LESSONS.md, Forms): a sync landing mid-edit keeps what's typed.
  const [effect, setEffect] = useState<InjuryRuleEffect>(existing?.effect ?? "limit");
  const existingCap = existing ? ruleMaxWeight(existing, units) : null;
  const [maxWeight, setMaxWeight] = useState(existingCap === null ? "" : String(existingCap));
  const [repsLow, setRepsLow] = useState(existing?.repsLow?.toString() ?? "");
  const [repsHigh, setRepsHigh] = useState(existing?.repsHigh?.toString() ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A double tap on Save or Remove mustn't write twice (#491).
  const busy = useRef(false);
  const limits = ruleTakesLimits(effect);

  async function run(write: () => Promise<unknown>, close: () => void) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await write();
      close();
    } catch (caught) {
      busy.current = false;
      setSaving(false);
      setError(caught instanceof Error ? caught.message : "Couldn't save. Try again.");
    }
  }

  function save(close: () => void) {
    const cap = limits ? parseNumber(maxWeight) : null;
    const low = limits ? parseNumber(repsLow) : null;
    const high = limits ? parseNumber(repsHigh) : null;
    void run(
      () =>
        setExerciseRule(injury, {
          exerciseId,
          effect,
          maxWeight: cap,
          units,
          repsLow: low,
          repsHigh: high,
          note,
        }),
      close,
    );
  }

  const label = injuryAreaLabel(injury.area, injury.side);
  return (
    <FloatingCard labelledBy="exercise-rule-title" onClose={onClose}>
      {(requestClose) => (
        <>
          <div className="touch-none px-4 pt-4">
            <h2 id="exercise-rule-title" className="min-w-0 truncate text-lg font-semibold">
              {exerciseName}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              With your {label.toLowerCase()}
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">How should Jim treat it?</legend>
              {INJURY_RULE_EFFECTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={effect === option}
                  onClick={() => {
                    setEffect(option);
                    setError(null);
                  }}
                  className={`flex min-h-11 min-w-0 flex-col items-start rounded-lg border px-3 py-2 text-left text-sm ${
                    effect === option
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  <span className="font-medium">{INJURY_RULE_EFFECT_LABELS[option]}</span>
                  <span className="opacity-80">{EFFECT_DETAILS[option]}</span>
                </button>
              ))}
            </fieldset>

            {limits && (
              <>
                <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
                  <span>
                    Max weight ({units}){" "}
                    <span className="font-normal text-zinc-500">(optional)</span>
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={maxWeight}
                    onChange={(event) => setMaxWeight(normalizeDecimalInput(event.target.value))}
                    className={FIELD}
                  />
                </label>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-semibold">
                    Rep range <span className="font-normal text-zinc-500">(optional)</span>
                  </p>
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Fewest reps"
                      value={repsLow}
                      onChange={(event) => setRepsLow(event.target.value.replace(/\D/g, ""))}
                      className={FIELD}
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Most reps"
                      value={repsHigh}
                      onChange={(event) => setRepsHigh(event.target.value.replace(/\D/g, ""))}
                      className={FIELD}
                    />
                  </div>
                </div>
              </>
            )}

            <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
              <span>
                Note <span className="font-normal text-zinc-500">(optional)</span>
              </span>
              <textarea
                value={note}
                maxLength={INJURY_RULE_NOTE_MAX}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="e.g. Pause at the bottom, no lockout"
                className={`${FIELD} py-2`}
              />
            </label>
          </div>

          <div className="flex touch-none flex-col gap-2 border-t border-zinc-200 px-4 pt-3 pb-4 dark:border-zinc-800">
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-500">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              {existing ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (window.confirm(`Remove the rule for ${exerciseName}?`)) {
                      void run(() => removeExerciseRule(injury, exerciseId), requestClose);
                    }
                  }}
                  className="min-h-11 px-3 text-base font-medium text-red-600 disabled:opacity-50 dark:text-red-500"
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={requestClose}
                  className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={() => save(requestClose)}
                disabled={saving}
                className="min-h-11 flex-[2] rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground disabled:opacity-50"
              >
                Save rule
              </button>
            </div>
          </div>
        </>
      )}
    </FloatingCard>
  );
}

/**
 * An open injury's exercise rules (issue #724): how it treats specific
 * exercises in place of the area-wide suggestion. Rules always show; adding
 * and editing them is an Advanced feature (`showsInjuryRules`).
 */
export function InjuryExerciseRules({
  injury,
  userId,
  units,
  editable,
}: {
  injury: InjuryRow;
  userId: string;
  units: WeightUnits;
  editable: boolean;
}) {
  const rules = parseInjuryRules(injury.exerciseRules);
  const ids = rules.map((rule) => rule.exerciseId);
  const exercises = useLiveQuery(() => db.exercises.bulkGet(ids), [ids.join("|")]);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ exerciseId: string; name: string } | null>(null);
  if (rules.length === 0 && !editable) return null;

  const nameOf = (exerciseId: string) => {
    const exercise = exercises?.find((row) => row?.id === exerciseId);
    return exercise ? exerciseDisplayName(exercise) : "Exercise";
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-sm font-semibold">Exercise rules</p>
      {rules.length > 0 && (
        <ul className="flex min-w-0 flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {rules.map((rule) => {
            const name = nameOf(rule.exerciseId);
            const content = (
              <span className="flex min-w-0 flex-col text-left">
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  {describeInjuryRule(rule, units)}
                  {rule.note ? ` · ${rule.note}` : ""}
                </span>
              </span>
            );
            return (
              <li key={rule.exerciseId} className="min-w-0">
                {editable ? (
                  <button
                    type="button"
                    onClick={() => setEditing({ exerciseId: rule.exerciseId, name })}
                    aria-label={`Edit the rule for ${name}`}
                    className="flex min-h-11 w-full min-w-0 items-center py-1"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex min-h-11 min-w-0 items-center py-1">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex min-h-11 items-center gap-2 self-start text-sm font-medium"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Add exercise rule
        </button>
      )}

      {picking && (
        <ExercisePicker
          userId={userId}
          mode="replace"
          title="Pick an exercise"
          excludeExerciseIds={new Set(ids)}
          onPick={async ([exerciseId]) => {
            if (!exerciseId) return;
            const exercise = await db.exercises.get(exerciseId);
            setPicking(false);
            setEditing({
              exerciseId,
              name: exercise ? exerciseDisplayName(exercise) : "Exercise",
            });
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {editing && (
        <ExerciseRuleCard
          injury={injury}
          exerciseId={editing.exerciseId}
          exerciseName={editing.name}
          existing={rules.find((rule) => rule.exerciseId === editing.exerciseId) ?? null}
          units={units}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
