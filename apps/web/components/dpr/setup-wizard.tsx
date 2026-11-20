"use client";

import { ArrowUp, Check } from "@/components/icons/solar";
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
  exerciseDisplayName,
  focusCandidates,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { EXPERIENCE_LABELS, PRESET_LABELS, formatDate, formatWeight } from "./labels";

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

  if (candidates.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-zinc-300 px-4 py-6 text-center dark:border-zinc-700">
        <h2 className="text-base font-semibold">Log a few weighted workouts first</h2>
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
      setError(`Block saved, but turning PRP on failed: ${result.error}`);
      setSaving(false);
    }
  }

  const goalsById = new Map(plan.lifts.map((lift) => [lift.exerciseId, lift]));
  const endsOn = plan.lifts[0]?.goalDate ?? null;

  // One page instead of five steps (#854): every choice is visible at once
  // and the goals update as you change them.
  return (
    <section className="flex flex-col gap-2">
      <h2 className={GROUP_LABEL}>Experience</h2>
      <Segmented
        label="Experience"
        options={EXPERIENCE_LEVELS.map((option) => ({
          value: option,
          label: EXPERIENCE_LABELS[option],
          dot: option === guess.level,
        }))}
        value={level}
        onChange={setExperience}
      />

      <h2 className={`${GROUP_LABEL} mt-3`}>Push</h2>
      <Segmented
        label="Push"
        options={DPR_PRESET_NAMES.map((option) => ({
          value: option,
          label: PRESET_LABELS[option],
        }))}
        value={preset}
        onChange={setPreset}
      />

      <h2 className={`${GROUP_LABEL} mt-3 flex justify-between`}>
        Lifts
        <span className="tabular-nums text-zinc-950 dark:text-zinc-50">
          {focus.length} of {DPR_MAX_FOCUS}
        </span>
      </h2>
      <ul className="surface flex flex-col divide-y divide-zinc-200/80 overflow-hidden rounded-3xl dark:divide-zinc-800">
        {candidates.map((candidate) => {
          const id = candidate.exercise.id;
          const selected = focus.includes(id);
          const full = !selected && focus.length >= DPR_MAX_FOCUS;
          const goal = selected ? goalsById.get(id) : undefined;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={full}
                onClick={() => toggleFocus(id)}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-40"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                    selected
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  {selected && (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-base">
                  {exerciseDisplayName(candidate.exercise)}
                </span>
                {goal &&
                  (goal.baselineE1rm === null ? (
                    <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">RPE ?</span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-sm tabular-nums">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {Math.round(goal.baselineE1rm)}
                      </span>
                      <ArrowUp
                        className="h-3.5 w-3.5 text-green-600 dark:text-green-500"
                        strokeWidth={2.25}
                        aria-hidden="true"
                      />
                      <span className="font-bold text-green-600 dark:text-green-500">
                        {formatWeight(goal.goalE1rm, settings.units)}
                      </span>
                    </span>
                  ))}
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className={`${GROUP_LABEL} mt-3`}>Block</h2>
      <Segmented
        label="Block length"
        options={DPR_BLOCK_WEEKS.map((option) => ({
          value: option,
          label: `${option} wk`,
          dot: activeProgram != null && option === programWeeks,
        }))}
        value={weeks}
        onChange={setWeeks}
      />
      <div className="flex gap-0.5 px-1 pt-1" aria-hidden="true">
        {Array.from({ length: weeks }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one fixed segment per week
            key={i}
            className="h-1.5 flex-1 rounded-full bg-green-600/85 dark:bg-green-500/85"
          />
        ))}
      </div>
      <p className="flex justify-between px-1 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
        <span>{formatDate(now)}</span>
        {endsOn && <span>{formatDate(endsOn)}</span>}
      </p>

      <button
        type="button"
        disabled={saving || focus.length === 0}
        onClick={() => void start()}
        className="press mt-3 min-h-13 rounded-full bg-green-600 px-4 text-lg font-semibold text-white disabled:opacity-50 dark:bg-green-500 dark:text-black"
      >
        {saving ? "Starting…" : `Start ${weeks}-week block`}
      </button>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </section>
  );
}

const GROUP_LABEL = "px-4 text-[13px] font-semibold text-zinc-500 dark:text-zinc-500";

/** iOS-style segmented control; `dot` marks Jim's suggestion (#854). */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; dot?: boolean }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset
      className="grid min-w-0 gap-0.5 rounded-xl bg-zinc-200/70 p-0.5 dark:bg-zinc-800"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`relative min-h-11 rounded-[10px] px-1 text-[15px] tabular-nums ${
              selected
                ? "bg-white font-semibold shadow-sm dark:bg-zinc-600"
                : "font-medium text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {option.label}
            {option.dot && (
              <span
                aria-label="Suggested"
                className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-500"
              />
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
