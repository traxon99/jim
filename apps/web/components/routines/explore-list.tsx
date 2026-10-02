"use client";

import { EXPERIENCE_LABELS, PRESET_LABELS } from "@/components/dpr/labels";
import { SWITCH_CLASS } from "@/components/switch-class";
import { db } from "@/lib/db/schema";
import { currentBlock } from "@/lib/dpr/block";
import { addExploreProgram, addRoutineTemplate } from "@/lib/explore/add-template";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { addWarmupTemplate } from "@/lib/routines/warmup-templates";
import {
  EXPLORE_LIFT_LABELS,
  EXPLORE_WARMUP_TEMPLATES,
  type ExperienceLevel,
  type ExploreProgramTemplate,
  PROGRAM_TEMPLATES,
  type RoutineTemplate,
  type WarmupTemplate,
  isWarmupRoutine,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, ChevronRight, Dumbbell, Flame, Layers, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CollapsibleSection } from "./collapsible-section";

const GOAL_LABELS: Record<ExploreProgramTemplate["info"]["goal"], string> = {
  strength: "Strength",
  hypertrophy: "Muscle",
  general: "General fitness",
};

type LevelFilter = "all" | ExperienceLevel;

/** Only the levels some template actually has, so a chip never filters to nothing. */
const LEVEL_FILTERS: readonly LevelFilter[] = [
  "all",
  ...(["novice", "intermediate", "advanced"] as const).filter((level) =>
    PROGRAM_TEMPLATES.some((template) => template.info.level === level),
  ),
];

/**
 * The Routines tab's Explore view (issues #141, #243): a shortcut to the
 * program generator, a library of well-known programs that can be filtered
 * by level and added in one tap (optionally made active, with Dynamic
 * Progression on their main lifts), their routines on their own, and
 * warm-ups/stretches. Templates are code-defined in @jim/core; adding one
 * instantiates it into the user's own rows, so it works offline and syncs
 * like anything else they create.
 */
export function ExploreList({ userId }: { userId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState<string | null>(null);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const allRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const allPrograms = useLiveQuery(() => db.programs.toArray(), []);
  const dprBlocks = useLiveQuery(() => db.dprBlocks.toArray(), []);
  const dprRunning = dprBlocks ? currentBlock(dprBlocks) != null : false;

  // Already-added templates are matched by name, same as the warm-up
  // templates always were — a copy is the user's to rename or delete.
  const programIdByName = useMemo(
    () =>
      new Map((allPrograms ?? []).filter((p) => !p.deletedAt).map((p) => [p.name, p.id] as const)),
    [allPrograms],
  );
  const { routineNames, warmupNames } = useMemo(() => {
    const live = (allRoutines ?? []).filter((r) => !r.deletedAt);
    return {
      routineNames: new Set(live.filter((r) => !isWarmupRoutine(r)).map((r) => r.name)),
      warmupNames: new Set(live.filter(isWarmupRoutine).map((r) => r.name)),
    };
  }, [allRoutines]);

  const programs = PROGRAM_TEMPLATES.filter(
    (template) => level === "all" || template.info.level === level,
  );

  async function add(
    key: string,
    run: () => Promise<{ missingSlugs: string[]; href: string; message?: string | null }>,
  ) {
    setAdding(key);
    try {
      const { missingSlugs, href, message } = await run();
      const notes = [
        missingSlugs.length > 0
          ? `Added without ${missingSlugs.length} exercise(s) that haven't synced to this device yet.`
          : null,
        message ?? null,
      ].filter(Boolean);
      if (notes.length > 0) alert(notes.join("\n\n"));
      router.push(href);
    } finally {
      setAdding(null);
    }
  }

  function handleAddProgram(
    template: ExploreProgramTemplate,
    options: { activate: boolean; startDpr: boolean },
  ) {
    return add(`program:${template.key}`, async () => {
      const { programId, missingSlugs, dprError } = await addExploreProgram(
        userId,
        template,
        options,
      );
      return { missingSlugs, message: dprError, href: `/routines/programs/${programId}` };
    });
  }

  function handleAddRoutine(template: RoutineTemplate) {
    return add(`routine:${template.key}`, async () => {
      const { routineId, missingSlugs } = await addRoutineTemplate(userId, template);
      return { missingSlugs, href: `/routines/${routineId}` };
    });
  }

  function handleAddWarmup(template: WarmupTemplate) {
    return add(`warmup:${template.key}`, async () => {
      const { routineId, missingSlugs } = await addWarmupTemplate(userId, template);
      return { missingSlugs, href: `/routines/${routineId}` };
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/routines/programs/generate"
        data-ripple
        className="flex min-h-11 items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-medium">Build me a program</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            Answer a few questions and get one fitted to your days and equipment.
          </span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-600"
          strokeWidth={2}
          aria-hidden="true"
        />
      </Link>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Programs
        </h2>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Filter programs by level</legend>
          {LEVEL_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={level === option}
              onClick={() => setLevel(option)}
              className={`flex min-h-9 items-center rounded-full border px-3 text-sm font-medium ${
                level === option
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {option === "all" ? "All" : EXPERIENCE_LABELS[option]}
            </button>
          ))}
        </fieldset>
        <ul className="flex flex-col gap-2">
          {programs.map((template) => (
            <ProgramCard
              key={template.key}
              template={template}
              expanded={expanded === template.key}
              onToggle={() =>
                setExpanded((current) => (current === template.key ? null : template.key))
              }
              addedProgramId={programIdByName.get(template.name) ?? null}
              dprRunning={dprRunning}
              busy={adding === `program:${template.key}`}
              disabled={adding != null}
              onAdd={(options) => void handleAddProgram(template, options)}
            />
          ))}
        </ul>
      </section>

      <CollapsibleSection title="Single routines" defaultOpen={false}>
        <div className="flex flex-col gap-3">
          {PROGRAM_TEMPLATES.map((program) => (
            <div key={program.key} className="flex flex-col gap-1.5">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
                {program.name}
              </h3>
              <ul className="flex flex-col gap-2">
                {[...program.days.map((day) => day.routine), ...program.extraRoutines].map(
                  (template) => (
                    <TemplateRow
                      key={template.key}
                      icon={
                        <Dumbbell
                          className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-500"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      }
                      name={template.name}
                      detail={exerciseSummary(template)}
                      added={routineNames.has(template.name)}
                      busy={adding === `routine:${template.key}`}
                      disabled={adding != null}
                      onAdd={() => void handleAddRoutine(template)}
                    />
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Warm-ups & stretches" defaultOpen={false}>
        <ul className="flex flex-col gap-2">
          {EXPLORE_WARMUP_TEMPLATES.map((template) => (
            <TemplateRow
              key={template.key}
              icon={
                <Flame
                  className="h-4 w-4 shrink-0 text-orange-500 dark:text-orange-400"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              }
              name={template.name}
              detail={`${template.minutes} min · ${template.items.length} exercises`}
              subtitle={template.notes}
              added={warmupNames.has(template.name)}
              busy={adding === `warmup:${template.key}`}
              disabled={adding != null}
              onAdd={() => void handleAddWarmup(template)}
            />
          ))}
        </ul>
      </CollapsibleSection>
    </div>
  );
}

function exerciseSummary(template: RoutineTemplate): string {
  return template.items.length === 1 ? "1 exercise" : `${template.items.length} exercises`;
}

function ProgramCard({
  template,
  expanded,
  onToggle,
  addedProgramId,
  dprRunning,
  busy,
  disabled,
  onAdd,
}: {
  template: ExploreProgramTemplate;
  expanded: boolean;
  onToggle: () => void;
  addedProgramId: string | null;
  dprRunning: boolean;
  busy: boolean;
  disabled: boolean;
  onAdd: (options: { activate: boolean; startDpr: boolean }) => void;
}) {
  const { info } = template;
  const [activate, setActivate] = useState(true);
  const [startDpr, setStartDpr] = useState(true);
  const lifts = info.dpr?.focusSlugs.map((slug) => EXPLORE_LIFT_LABELS[slug] ?? slug) ?? [];
  const meta = [
    EXPERIENCE_LABELS[info.level],
    `${info.daysPerWeek} days/week`,
    GOAL_LABELS[info.goal],
  ].join(" · ");
  const panelId = `explore-program-${template.key}`;

  return (
    <li className="flex flex-col rounded-lg border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-start gap-2 px-3 py-3 text-left"
      >
        <Layers
          className="mt-1 h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-500"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-base font-medium">{template.name}</span>
            {addedProgramId && (
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">Added</span>
            )}
          </span>
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{meta}</span>
          <span
            className={`text-xs text-zinc-500 dark:text-zinc-500 ${expanded ? "" : "line-clamp-2"}`}
          >
            {template.notes}
          </span>
        </span>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform dark:text-zinc-600 ${
            expanded ? "rotate-180" : ""
          }`}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div id={panelId} className="flex flex-col gap-3 px-3 pb-3 pl-9">
          <ul className="flex flex-col gap-0.5 text-sm">
            {template.days.map((day, index) => (
              <li key={day.routine.key} className="flex min-w-0 gap-2">
                <span className="w-12 shrink-0 text-zinc-500 dark:text-zinc-500">
                  {day.weekday == null
                    ? `Day ${index + 1}`
                    : WEEKDAY_NAMES[day.weekday].slice(0, 3)}
                </span>
                <span className="min-w-0 truncate">{day.routine.name}</span>
                <span className="ml-auto shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
                  {exerciseSummary(day.routine)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {template.mode === "sequence"
              ? `Run the days in order, ${info.daysPerWeek} times a week. `
              : ""}
            {info.progression}
          </p>

          {addedProgramId ? (
            <Link
              href={`/routines/programs/${addedProgramId}`}
              className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-700"
            >
              Open program
            </Link>
          ) : (
            <>
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span>Make it my active program</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={activate}
                  aria-checked={activate}
                  onChange={(event) => setActivate(event.target.checked)}
                  className={SWITCH_CLASS}
                />
              </label>
              {info.dpr && (
                <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span>Progress with Dynamic Progression</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      {dprRunning
                        ? "You already have a block running."
                        : `${lifts.join(", ")} · ${PRESET_LABELS[info.dpr.preset]} · ${info.dpr.weeks} weeks`}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={startDpr && !dprRunning}
                    aria-checked={startDpr && !dprRunning}
                    disabled={dprRunning}
                    onChange={(event) => setStartDpr(event.target.checked)}
                    className={SWITCH_CLASS}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => onAdd({ activate, startDpr: startDpr && !dprRunning })}
                disabled={disabled}
                className="min-h-11 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add program"}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function TemplateRow({
  icon,
  name,
  detail,
  subtitle,
  added,
  busy,
  disabled,
  onAdd,
}: {
  icon: React.ReactNode;
  name: string;
  detail: string;
  subtitle?: string;
  added: boolean;
  busy: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2 dark:border-zinc-700">
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-500">{detail}</span>
          {subtitle && <span className="text-xs text-zinc-500 dark:text-zinc-500">{subtitle}</span>}
        </span>
      </span>
      <AddButton added={added} busy={busy} disabled={disabled} onAdd={onAdd} />
    </li>
  );
}

function AddButton({
  added,
  busy,
  disabled,
  onAdd,
}: {
  added: boolean;
  busy: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  if (added) {
    return (
      <span className="flex min-h-11 shrink-0 items-center px-1 text-sm text-zinc-500 dark:text-zinc-500">
        Added
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
    >
      {busy ? "Adding…" : "Add"}
    </button>
  );
}
