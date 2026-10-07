"use client";

import { EXPERIENCE_LABELS } from "@/components/dpr/labels";
import { BackLink } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import { currentBlock } from "@/lib/dpr/block";
import { generateProgramFromDb, saveGeneratedProgram } from "@/lib/programs/generate";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import {
  DPR_MAX_FOCUS,
  EXPERIENCE_LEVELS,
  type ExperienceLevel,
  FOCUS_LIFTS,
  FOCUS_LIFT_LABELS,
  type FocusLift,
  GENERATOR_DAYS_PER_WEEK,
  GENERATOR_EQUIPMENT,
  GENERATOR_SESSION_MINUTES,
  type GeneratedProgram,
  type GeneratorEquipment,
  PROGRAM_GOALS,
  type ProgramGoal,
  type ProgramQuestionnaire,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const GOAL_OPTIONS: Record<ProgramGoal, { label: string; description: string }> = {
  strength: { label: "Get stronger", description: "Heavy main lifts, low reps." },
  hypertrophy: { label: "Build muscle", description: "Moderate weights, more volume." },
  general: { label: "General fitness", description: "A balanced, lower-volume mix." },
};

const EQUIPMENT_LABELS: Record<GeneratorEquipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbells",
  cable: "Cables",
  machine: "Machines",
  kettlebells: "Kettlebells",
  bands: "Bands",
  "body only": "Bodyweight",
};

const WEIGHTED_TRACKING = new Set(["weight_reps", "weighted_bodyweight"]);

const optionClass = (selected: boolean) =>
  `flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left ${
    selected ? "border-accent" : "border-zinc-300 dark:border-zinc-700"
  }`;

const chipClass = (selected: boolean) =>
  `flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium disabled:opacity-50 ${
    selected ? "border-accent" : "border-zinc-300 dark:border-zinc-700"
  }`;

function toggle<T>(list: readonly T[], value: T, max = Number.POSITIVE_INFINITY): T[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  return list.length >= max ? [...list] : [...list, value];
}

function formatTarget(item: { sets: number; reps?: number; repsHigh?: number; seconds?: number }) {
  if (item.seconds) return `${item.sets} × ${item.seconds}s`;
  if (item.reps && item.repsHigh && item.repsHigh !== item.reps) {
    return `${item.sets} × ${item.reps}–${item.repsHigh}`;
  }
  return `${item.sets} × ${item.reps ?? "—"}`;
}

/**
 * "Build me a program" (issue #251): a questionnaire, a preview of the
 * generated weekly program, then a save that makes it an ordinary program —
 * with an optional Dynamic Progression block on the chosen focus lifts.
 */
export function ProgramGenerator({ userId }: { userId: string }) {
  const router = useRouter();

  const [goal, setGoal] = useState<ProgramGoal>("hypertrophy");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [equipment, setEquipment] = useState<GeneratorEquipment[]>([
    "barbell",
    "dumbbell",
    "cable",
    "machine",
    "body only",
  ]);
  const [experience, setExperience] = useState<ExperienceLevel>("novice");
  const [focusLifts, setFocusLifts] = useState<FocusLift[]>([]);

  const [generated, setGenerated] = useState<GeneratedProgram | null>(null);
  const [name, setName] = useState("");
  const [dprFocus, setDprFocus] = useState<string[]>([]);
  const [savedProgramId, setSavedProgramId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const hasActiveBlock = useLiveQuery(
    async () => currentBlock(await db.dprBlocks.toArray()) !== null,
    [],
  );
  const exerciseBySlug = useMemo(
    () =>
      new Map(
        (exercises ?? [])
          .filter((exercise) => exercise.ownerId == null)
          .map((exercise) => [exercise.slug, exercise]),
      ),
    [exercises],
  );

  const answers: ProgramQuestionnaire = {
    goal,
    daysPerWeek,
    sessionMinutes,
    equipment,
    experience,
    focusLifts,
  };

  // DPR candidates: the focus lifts first, then each day's opening lift —
  // weighted exercises only, since DPR tracks e1RM.
  const dprCandidates = useMemo(() => {
    if (!generated) return [];
    const slugs = [
      ...generated.focusSlugs,
      ...generated.template.days.flatMap((day) => day.routine.items[0]?.slug ?? []),
    ];
    return [...new Set(slugs)].filter((slug) =>
      WEIGHTED_TRACKING.has(exerciseBySlug.get(slug)?.trackingType ?? ""),
    );
  }, [generated, exerciseBySlug]);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const result = await generateProgramFromDb(answers);
      if (result.template.days.length === 0) {
        setError("Nothing in your exercise library fits that equipment — try adding more.");
        return;
      }
      setGenerated(result);
      setName(result.template.name);
      setDprFocus(
        result.focusSlugs
          .filter((slug) => WEIGHTED_TRACKING.has(exerciseBySlug.get(slug)?.trackingType ?? ""))
          .slice(0, DPR_MAX_FOCUS),
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!generated) return;
    setBusy(true);
    setError(null);
    try {
      const program = {
        ...generated,
        template: { ...generated.template, name: name.trim() || generated.template.name },
      };
      const result = await saveGeneratedProgram(userId, program, {
        dprFocusSlugs: hasActiveBlock ? [] : dprFocus,
        answers,
      });
      if (result.dprError) {
        // The program itself saved — say what didn't and let them carry on to it.
        setSavedProgramId(result.programId);
        setError(result.dprError);
        setBusy(false);
        return;
      }
      router.push(`/routines/programs/${result.programId}`);
    } catch {
      setError("Couldn't save the program — try again.");
      setBusy(false);
    }
  }

  if (generated) {
    return (
      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        <div className="self-start">
          <BackLink href="/routines" label="Routines" />
        </div>
        <h1 className="text-xl font-semibold">Your program</h1>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{generated.template.notes}</p>

        <ul className="flex flex-col gap-3">
          {generated.template.days.map((day) => (
            <li
              key={day.routine.key}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">{day.routine.name}</h2>
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
                  {day.weekday == null ? null : WEEKDAY_NAMES[day.weekday]}
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {day.routine.items.map((item) => (
                  <li key={item.slug} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {exerciseBySlug.get(item.slug)?.name ?? item.slug}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-500">
                      {formatTarget(item)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        {dprCandidates.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">PRP focus lifts</h2>
            {hasActiveBlock ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                You already have a block running — change its lifts on the Progression tab.
              </p>
            ) : (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Pick up to {DPR_MAX_FOCUS} lifts for PRP to set weekly targets on, or none to skip
                  it.
                </p>
                <div className="flex flex-col gap-2">
                  {dprCandidates.map((slug) => {
                    const selected = dprFocus.includes(slug);
                    return (
                      <button
                        key={slug}
                        type="button"
                        aria-pressed={selected}
                        disabled={!selected && dprFocus.length >= DPR_MAX_FOCUS}
                        onClick={() =>
                          setDprFocus((current) => toggle(current, slug, DPR_MAX_FOCUS))
                        }
                        className={`${optionClass(selected)} disabled:opacity-50`}
                      >
                        <span className="text-base font-medium">
                          {exerciseBySlug.get(slug)?.name ?? slug}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-500">{error}</p>}

        {savedProgramId ? (
          <button
            type="button"
            onClick={() => router.push(`/routines/programs/${savedProgramId}`)}
            className="min-h-11 rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground"
          >
            Open program
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setGenerated(null)}
              className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-11 flex-[2] rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save program"}
            </button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 px-4 py-4">
      <div className="self-start">
        <BackLink href="/routines" label="Routines" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Build me a program</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Answer a few questions and Jim will lay out a weekly plan you can edit like any other
          program.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Goal</legend>
        {PROGRAM_GOALS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={goal === option}
            onClick={() => setGoal(option)}
            className={optionClass(goal === option)}
          >
            <span className="text-base font-medium">{GOAL_OPTIONS[option].label}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              {GOAL_OPTIONS[option].description}
            </span>
          </button>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Days per week</legend>
        <div className="grid grid-cols-5 gap-2">
          {GENERATOR_DAYS_PER_WEEK.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={daysPerWeek === days}
              onClick={() => setDaysPerWeek(days)}
              className={chipClass(daysPerWeek === days)}
            >
              {days}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Session length (minutes)</legend>
        <div className="grid grid-cols-5 gap-2">
          {GENERATOR_SESSION_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={sessionMinutes === minutes}
              onClick={() => setSessionMinutes(minutes)}
              className={chipClass(sessionMinutes === minutes)}
            >
              {minutes}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Equipment you have</legend>
        <div className="grid grid-cols-2 gap-2">
          {GENERATOR_EQUIPMENT.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={equipment.includes(option)}
              onClick={() => setEquipment((current) => toggle(current, option))}
              className={chipClass(equipment.includes(option))}
            >
              {EQUIPMENT_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Experience</legend>
        <div className="grid grid-cols-3 gap-2">
          {EXPERIENCE_LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={experience === option}
              onClick={() => setExperience(option)}
              className={chipClass(experience === option)}
            >
              {EXPERIENCE_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Lifts to focus on (optional)</legend>
        <div className="grid grid-cols-2 gap-2">
          {FOCUS_LIFTS.map((lift) => (
            <button
              key={lift}
              type="button"
              aria-pressed={focusLifts.includes(lift)}
              disabled={!focusLifts.includes(lift) && focusLifts.length >= DPR_MAX_FOCUS}
              onClick={() => setFocusLifts((current) => toggle(current, lift, DPR_MAX_FOCUS))}
              className={chipClass(focusLifts.includes(lift))}
            >
              {FOCUS_LIFT_LABELS[lift]}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-600 dark:text-red-500">{error}</p>}

      <button
        type="button"
        disabled={busy || equipment.length === 0 || exercises === undefined}
        onClick={() => void build()}
        className="min-h-11 rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
      >
        {busy ? "Building…" : "Build program"}
      </button>
    </main>
  );
}
