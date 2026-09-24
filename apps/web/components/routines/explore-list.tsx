"use client";

import { db } from "@/lib/db/schema";
import { addProgramTemplate, addRoutineTemplate } from "@/lib/explore/add-template";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { addWarmupTemplate } from "@/lib/routines/warmup-templates";
import {
  EXPLORE_WARMUP_TEMPLATES,
  PROGRAM_TEMPLATES,
  type ProgramTemplate,
  ROUTINE_TEMPLATES,
  type RoutineTemplate,
  type WarmupTemplate,
  isWarmupRoutine,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Dumbbell, Flame, Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CollapsibleSection } from "./collapsible-section";

/**
 * The Routines tab's Explore view (issue #141): ready-made programs,
 * routines and warm-ups/stretches a user can copy into their own account.
 * Templates are code-defined in @jim/core; adding one instantiates it into
 * the user's own rows, so nothing here touches the network.
 */
export function ExploreList({ userId }: { userId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState<string | null>(null);
  const allRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const allPrograms = useLiveQuery(() => db.programs.toArray(), []);

  // Already-added templates are matched by name, same as the warm-up
  // templates always were — a copy is the user's to rename or delete.
  const programNames = useMemo(
    () => new Set((allPrograms ?? []).filter((p) => !p.deletedAt).map((p) => p.name)),
    [allPrograms],
  );
  const { routineNames, warmupNames } = useMemo(() => {
    const live = (allRoutines ?? []).filter((r) => !r.deletedAt);
    return {
      routineNames: new Set(live.filter((r) => !isWarmupRoutine(r)).map((r) => r.name)),
      warmupNames: new Set(live.filter(isWarmupRoutine).map((r) => r.name)),
    };
  }, [allRoutines]);

  async function add(key: string, run: () => Promise<{ missingSlugs: string[]; href: string }>) {
    setAdding(key);
    try {
      const { missingSlugs, href } = await run();
      if (missingSlugs.length > 0) {
        alert(
          `Added without ${missingSlugs.length} exercise(s) that haven't synced to this device yet.`,
        );
      }
      router.push(href);
    } finally {
      setAdding(null);
    }
  }

  function handleAddProgram(template: ProgramTemplate) {
    return add(`program:${template.key}`, async () => {
      const { programId, missingSlugs } = await addProgramTemplate(userId, template);
      return { missingSlugs, href: `/routines/programs/${programId}` };
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
    <div className="flex flex-col gap-4">
      <CollapsibleSection title="Programs">
        <ul className="flex flex-col gap-2">
          {PROGRAM_TEMPLATES.map((template) => (
            <li
              key={template.key}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-start gap-2">
                  <Layers
                    className="mt-1 h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-500"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-base font-medium">{template.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      {template.notes}
                    </span>
                  </span>
                </span>
                <AddButton
                  added={programNames.has(template.name)}
                  busy={adding === `program:${template.key}`}
                  disabled={adding != null}
                  onAdd={() => void handleAddProgram(template)}
                />
              </div>
              <ul className="flex flex-col gap-0.5 pl-6 text-sm">
                {template.days.map((day) => (
                  <li key={day.routine.key} className="flex gap-2">
                    <span className="w-9 shrink-0 text-zinc-500 dark:text-zinc-500">
                      {WEEKDAY_NAMES[day.weekday].slice(0, 3)}
                    </span>
                    <span className="min-w-0 truncate">{day.routine.name}</span>
                  </li>
                ))}
                {[...template.extraRoutines, ...template.warmups].map((extra) => (
                  <li key={extra.key} className="flex gap-2">
                    <span className="w-9 shrink-0 text-zinc-500 dark:text-zinc-500">+</span>
                    <span className="min-w-0 truncate">{extra.name}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection title="Routines">
        <ul className="flex flex-col gap-2">
          {ROUTINE_TEMPLATES.map((template) => (
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
              detail={[
                `${template.items.length} exercises`,
                template.warmup ? "with warm-up" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              subtitle={template.notes}
              added={routineNames.has(template.name)}
              busy={adding === `routine:${template.key}`}
              disabled={adding != null}
              onAdd={() => void handleAddRoutine(template)}
            />
          ))}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection title="Warm-ups & stretches">
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
  subtitle: string;
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
          <span className="text-xs text-zinc-500 dark:text-zinc-500">{subtitle}</span>
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
