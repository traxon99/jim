"use client";

import { bodyweightLookup } from "@/lib/bodyweight";
import { type ExerciseRow, type ProgramRow, type SettingsRow, db } from "@/lib/db/schema";
import { guessExperience, planBlock, startDprBlock } from "@/lib/dpr/block";
import type { DprSnapshot } from "@/lib/dpr/data";
import { patchSettings } from "@/lib/settings";
import {
  DPR_BLOCK_WEEKS,
  DPR_MAX_FOCUS,
  DPR_PRESET_NAMES,
  type DprBlockWeeks,
  type DprPresetName,
  EXPERIENCE_LEVELS,
  type ExperienceLevel,
  blockWeeksForProgram,
  focusCandidates,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import {
  EXPERIENCE_LABELS,
  PRESET_LABELS,
  formatDate,
  formatWeight,
  presetSummary,
} from "./labels";

const STEPS = ["Experience", "Aggressiveness", "Focus", "Block length", "Review"] as const;

const optionClass = (selected: boolean) =>
  `flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left ${
    selected ? "border-accent" : "border-zinc-300 dark:border-zinc-700"
  }`;

export function SetupWizard({
  userId,
  settings,
  exercises,
  snapshot,
  activeProgram,
  prefill = null,
}: {
  userId: string;
  settings: SettingsRow;
  exercises: readonly ExerciseRow[];
  snapshot: DprSnapshot;
  activeProgram: ProgramRow | null;
  /** The next block (issue #215): last block's lifts, starting from their final e1RMs. */
  prefill?: { focus: string[]; baselines: ReadonlyMap<string, number> } | null;
}) {
  const now = useMemo(() => new Date(), []);
  const bodyMeasurements = useLiveQuery(() => db.bodyMeasurements.toArray(), []);
  const guess = useMemo(
    () =>
      guessExperience(
        snapshot,
        exercises,
        settings,
        now,
        bodyweightLookup(bodyMeasurements ?? [], settings.units),
      ),
    [snapshot, exercises, settings, now, bodyMeasurements],
  );
  // The last block's lifts stay pickable even if they've left the top 10.
  const candidates = useMemo(() => {
    const top = focusCandidates(snapshot.usageRows, exercises, now);
    const carried = (prefill?.focus ?? [])
      .filter((id) => !top.some((c) => c.exercise.id === id))
      .flatMap((id) => {
        const exercise = exercises.find((e) => e.id === id);
        return exercise ? [{ exercise, frequency: 0, lastPerformedAt: now }] : [];
      });
    return [...carried, ...top];
  }, [snapshot, exercises, now, prefill]);
  const programWeeks = blockWeeksForProgram(activeProgram?.durationWeeks ?? null);

  const [step, setStep] = useState(0);
  // A next block re-infers experience from the new history.
  const [experience, setExperience] = useState<ExperienceLevel | null>(
    prefill ? null : settings.dprExperience,
  );
  const [preset, setPreset] = useState<DprPresetName>(settings.dprAggressiveness);
  const [focus, setFocus] = useState<string[]>(prefill?.focus.slice(0, DPR_MAX_FOCUS) ?? []);
  const [weeks, setWeeks] = useState<DprBlockWeeks>(programWeeks ?? 8);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const level = experience ?? guess.level;
  const plan = useMemo(
    () =>
      planBlock(snapshot, {
        exerciseIds: focus,
        weeks,
        preset,
        experience: level,
        now,
        baselineOverrides: prefill?.baselines,
      }),
    [snapshot, focus, weeks, preset, level, now, prefill],
  );
  const namesById = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);

  if (candidates.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-zinc-300 px-4 py-6 text-center dark:border-zinc-700">
        <h2 className="text-base font-semibold">Log a few weighted workouts first</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Dynamic Progression picks your focus lifts from what you've trained in the last 90 days.
        </p>
      </section>
    );
  }

  function toggleFocus(exerciseId: string) {
    setFocus((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : current.length >= DPR_MAX_FOCUS
          ? current
          : [...current, exerciseId],
    );
  }

  async function start() {
    setSaving(true);
    setError(null);
    await startDprBlock(userId, plan, { programId: activeProgram?.id ?? null });
    const result = await patchSettings({
      dprEnabled: true,
      dprExperience: level,
      dprAggressiveness: preset,
    });
    if (!result.ok) {
      setError(`Block saved, but turning DPR on failed: ${result.error}`);
      setSaving(false);
    }
  }

  const canContinue = step !== 2 || focus.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>

      {step === 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">
            You look like {guess.level === "novice" ? "a" : "an"} {guess.level} lifter
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{guess.explanation}.</p>
          {EXPERIENCE_LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={level === option}
              onClick={() => setExperience(option)}
              className={optionClass(level === option)}
            >
              <span className="text-base font-medium">
                {EXPERIENCE_LABELS[option]}
                {option === guess.level && " (suggested)"}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">How hard should DPR push?</h2>
          {DPR_PRESET_NAMES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={preset === option}
              onClick={() => setPreset(option)}
              className={optionClass(preset === option)}
            >
              <span className="text-base font-medium">{PRESET_LABELS[option]}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                {presetSummary(option, level)}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Pick 1–{DPR_MAX_FOCUS} lifts to focus on</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Your most-trained weighted lifts from the last 90 days. Everything else keeps the usual
            "last time" prefill.
          </p>
          {candidates.map((candidate) => {
            const selected = focus.includes(candidate.exercise.id);
            const full = !selected && focus.length >= DPR_MAX_FOCUS;
            return (
              <button
                key={candidate.exercise.id}
                type="button"
                aria-pressed={selected}
                disabled={full}
                onClick={() => toggleFocus(candidate.exercise.id)}
                className={`${optionClass(selected)} disabled:opacity-50`}
              >
                <span className="text-base font-medium">{candidate.exercise.name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  {candidate.frequency} {candidate.frequency === 1 ? "session" : "sessions"} in 90
                  days
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Block length</h2>
          {DPR_BLOCK_WEEKS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={weeks === option}
              onClick={() => setWeeks(option)}
              className={optionClass(weeks === option)}
            >
              <span className="text-base font-medium">
                {option} weeks
                {activeProgram && option === programWeeks && (
                  <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
                    {" "}
                    · from {activeProgram.name}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Review</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {EXPERIENCE_LABELS[level]} · {PRESET_LABELS[preset]} · {weeks} weeks, ending{" "}
            {formatDate(plan.lifts[0]?.goalDate ?? now)}
          </p>
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {plan.lifts.map((lift) => (
              <li key={lift.exerciseId} className="flex flex-col gap-0.5 py-3">
                <span className="text-base font-medium">{namesById.get(lift.exerciseId)}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  {lift.baselineE1rm === null
                    ? "Goal set after your first session with RPE on every set"
                    : `e1RM ${formatWeight(lift.baselineE1rm, settings.units)} → ${formatWeight(lift.goalE1rm, settings.units)} by ${formatDate(lift.goalDate)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
          >
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => setStep(step + 1)}
            className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {step === 0 ? `Confirm ${EXPERIENCE_LABELS[level]}` : "Next"}
          </button>
        ) : (
          <button
            type="button"
            disabled={saving || focus.length === 0}
            onClick={() => void start()}
            className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {saving ? "Starting…" : "Start block"}
          </button>
        )}
      </div>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </section>
  );
}
