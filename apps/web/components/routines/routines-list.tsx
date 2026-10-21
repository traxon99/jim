"use client";

import { LoadingText } from "@/components/loading-text";
import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { OpenShareLinkCard } from "@/components/sharing/open-share-link-card";
import { type RoutineRow, db } from "@/lib/db/schema";
import { type LibraryFolder, libraryFolders, splitWarmups } from "@/lib/routines/library";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { exerciseDisplayName, isWarmupRoutine, searchRoutines } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Flame, Folder, Link2, Plus, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ExploreList } from "./explore-list";
import { ProgramHero } from "./program-hero";
import { RoutineIcon } from "./routine-icon";

type View = "routines" | "warmups" | "explore";

const VIEWS: { value: View; label: string }[] = [
  { value: "routines", label: "Routines" },
  { value: "warmups", label: "Warm-ups" },
  { value: "explore", label: "Explore" },
];

function exerciseCountLabel(count: number): string | null {
  return count > 0 ? `${count} exercise${count === 1 ? "" : "s"}` : null;
}

/**
 * One routine in the list, the same in search results, folders and
 * warm-ups (issue #552). The subtitle is clamped to two lines so a long
 * note can't make a tall row.
 */
function RoutineListRow({
  routine,
  subtitle,
  meta,
  badge,
}: {
  routine: RoutineRow;
  subtitle?: string | null;
  meta?: string | null;
  badge?: string | null;
}) {
  return (
    <li>
      <Link
        href={`/routines/${routine.id}`}
        data-ripple
        className="-mx-3 flex items-center gap-3 px-3 py-3"
      >
        {isWarmupRoutine(routine) ? (
          <Flame
            className="h-5 w-5 shrink-0 text-orange-500 dark:text-orange-400"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : (
          <RoutineIcon shape={routine.iconShape} color={routine.iconColor} className="h-5 w-5" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-medium">{routine.name}</span>
            {badge && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                {badge}
              </span>
            )}
          </span>
          {meta && (
            <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">{meta}</span>
          )}
          {subtitle && (
            <span className="line-clamp-2 break-words text-xs text-zinc-500 dark:text-zinc-500">
              {subtitle}
            </span>
          )}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-zinc-500"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

const LIST_CARD =
  "flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white px-3 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950";

/** A folder of routines that folds shut; "Other" holds the unfoldered ones. */
function FolderCard({
  group,
  defaultOpen,
  renderRow,
}: {
  group: LibraryFolder<RoutineRow>;
  defaultOpen: boolean;
  renderRow: (routine: RoutineRow) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const count = group.routines.length;
  return (
    <section className="flex flex-col rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="-mx-3 flex min-h-12 w-[calc(100%+1.5rem)] items-center gap-3 px-3 text-left"
        >
          <Folder
            className="h-5 w-5 shrink-0 text-zinc-500"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-base font-semibold">
            {group.folder ?? "Other"}
          </span>
          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
            {count} routine{count === 1 ? "" : "s"}
          </span>
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
      </h3>
      {open && (
        <ul className="flex flex-col divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {group.routines.map(renderRow)}
        </ul>
      )}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
      {children}
    </h3>
  );
}

export function RoutinesList({ userId }: { userId: string }) {
  // Routines / Warm-ups / Explore (issues #141, #655).
  const [view, setView] = useState<View>("routines");
  // Paste a share link (issue #254).
  const [linkCardOpen, setLinkCardOpen] = useState(false);
  // Dexie live query: re-renders whenever the local set of routines changes,
  // with no network on the read path (docs/ARCHITECTURE.md §1).
  const allRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const allPrograms = useLiveQuery(() => db.programs.toArray(), []);
  const allProgramItems = useLiveQuery(() => db.programRoutines.toArray(), []);
  const allRoutineExercises = useLiveQuery(() => db.routineExercises.toArray(), []);
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  // Fuzzy search over the open tab (issue #219).
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  const exerciseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allRoutineExercises ?? []) {
      if (item.deletedAt) continue;
      counts.set(item.routineId, (counts.get(item.routineId) ?? 0) + 1);
    }
    return counts;
  }, [allRoutineExercises]);

  const routinesById = useMemo(
    () => new Map((allRoutines ?? []).map((routine) => [routine.id, routine])),
    [allRoutines],
  );

  const programs = useMemo(
    () =>
      (allPrograms ?? [])
        .filter((program) => !program.deletedAt)
        .sort((a, b) => a.position - b.position),
    [allPrograms],
  );

  // The active program's routines are listed in its card, so the library
  // below doesn't repeat them (issue #655).
  const inActiveProgram = useMemo(() => {
    const active = programs.find((program) => program.isActive);
    const ids = new Set<string>();
    if (!active) return ids;
    for (const item of allProgramItems ?? []) {
      if (item.programId === active.id && !item.deletedAt && item.routineId) {
        ids.add(item.routineId);
      }
    }
    return ids;
  }, [programs, allProgramItems]);

  const folders = useMemo(
    () => libraryFolders(allRoutines ?? [], inActiveProgram),
    [allRoutines, inActiveProgram],
  );

  const warmups = useMemo(() => splitWarmups(allRoutines ?? []), [allRoutines]);

  const exerciseNamesByRoutineId = useMemo(() => {
    const nameById = new Map(
      (allExercises ?? []).map((exercise) => [exercise.id, exerciseDisplayName(exercise)]),
    );
    const names = new Map<string, string[]>();
    for (const item of allRoutineExercises ?? []) {
      if (item.deletedAt) continue;
      const name = nameById.get(item.exerciseId);
      if (!name) continue;
      const list = names.get(item.routineId);
      if (list) {
        list.push(name);
      } else {
        names.set(item.routineId, [name]);
      }
    }
    return names;
  }, [allExercises, allRoutineExercises]);

  // Searches the open tab's routines, program ones included, flattened out
  // of their folders; equal scores keep name order.
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const wantWarmups = view === "warmups";
    const pool = (allRoutines ?? [])
      .filter((routine) => !routine.deletedAt && isWarmupRoutine(routine) === wantWarmups)
      .sort((a, b) => a.name.localeCompare(b.name));
    return searchRoutines(pool, query, exerciseNamesByRoutineId);
  }, [searching, view, allRoutines, query, exerciseNamesByRoutineId]);

  if (allRoutines === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
      </main>
    );
  }

  const warmupName = (routine: RoutineRow): string | null => {
    const warmup = routine.warmupRoutineId ? routinesById.get(routine.warmupRoutineId) : null;
    return warmup && !warmup.deletedAt ? `Warm-up: ${warmup.name}` : null;
  };

  const renderRoutineRow = (routine: RoutineRow) => (
    <RoutineListRow
      key={routine.id}
      routine={routine}
      meta={exerciseCountLabel(exerciseCounts.get(routine.id) ?? 0)}
      subtitle={warmupName(routine) ?? routine.notes}
    />
  );

  const warmupMeta = (routine: RoutineRow, usedBy: string[]) =>
    [
      routine.warmupMinutes != null ? `${routine.warmupMinutes} min` : null,
      exerciseCountLabel(exerciseCounts.get(routine.id) ?? 0),
      usedBy.length > 0 ? usedBy.join(", ") : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const hasFolders = folders.some((group) => group.folder !== null);
  const noRoutines = folders.length === 0 && inActiveProgram.size === 0;
  const noWarmups = warmups.linked.length + warmups.unlinked.length === 0;

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Routines"
        actions={
          <>
            <button
              type="button"
              onClick={() => setLinkCardOpen(true)}
              aria-label="Add from a link"
              data-ripple
              className={FLOATING_BUTTON}
            >
              <Link2 className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
            </button>
            <Link
              href={view === "warmups" ? "/routines/new?kind=warmup" : "/routines/new"}
              aria-label={view === "warmups" ? "New warm-up" : "New routine"}
              data-ripple
              className={FLOATING_BUTTON}
            >
              <Plus className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
            </Link>
          </>
        }
      />
      {linkCardOpen && <OpenShareLinkCard onClose={() => setLinkCardOpen(false)} />}
      <div className={PAGE_BODY}>
        <ProgramHero
          programs={programs}
          routinesById={routinesById}
          exerciseCounts={exerciseCounts}
          weekStart={settings.weekStart}
        />

        <section aria-label="Library" className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Library
          </h2>
          <div
            role="tablist"
            aria-label="Library"
            className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {VIEWS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={view === option.value}
                onClick={() => {
                  setView(option.value);
                  setQuery("");
                }}
                className={`min-h-11 rounded-md text-sm font-medium ${
                  view === option.value
                    ? "bg-white shadow-sm dark:bg-zinc-800"
                    : "text-zinc-500 dark:text-zinc-500"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {view !== "explore" && (
            <label className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
              <Search
                className="h-4 w-4 shrink-0 text-zinc-500"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="sr-only">
                {view === "warmups" ? "Search warm-ups" : "Search routines"}
              </span>
              <input
                type="search"
                inputMode="search"
                placeholder={view === "warmups" ? "Search warm-ups" : "Search routines"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent py-3 text-base text-zinc-950 outline-none dark:text-zinc-50"
              />
            </label>
          )}

          {view === "explore" ? (
            <ExploreList userId={userId} />
          ) : searching ? (
            searchResults.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
                Nothing matches “{query.trim()}”.
              </p>
            ) : (
              <ul className={LIST_CARD}>
                {searchResults.map((routine) => (
                  <RoutineListRow
                    key={routine.id}
                    routine={routine}
                    meta={exerciseCountLabel(exerciseCounts.get(routine.id) ?? 0)}
                    subtitle={isWarmupRoutine(routine) ? null : routine.folder}
                  />
                ))}
              </ul>
            )
          ) : view === "routines" ? (
            noRoutines ? (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
                No routines yet.
              </p>
            ) : folders.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-500">
                All your routines are in your program.
              </p>
            ) : hasFolders ? (
              <div className="flex flex-col gap-2">
                {folders.map((group) => (
                  <FolderCard
                    key={group.folder ?? "__other"}
                    group={group}
                    defaultOpen={group.folder !== null}
                    renderRow={renderRoutineRow}
                  />
                ))}
              </div>
            ) : (
              <ul className={LIST_CARD}>{folders[0]?.routines.map(renderRoutineRow)}</ul>
            )
          ) : (
            <div className="flex flex-col gap-4">
              {warmups.duplicateNames > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  <TriangleAlert
                    className="mt-0.5 h-4 w-4 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  {warmups.duplicateNames === 1
                    ? "One warm-up has a copy with the same name."
                    : `${warmups.duplicateNames} warm-ups have copies with the same name.`}{" "}
                  Open the extra one to delete it.
                </p>
              )}
              {noWarmups && (
                <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
                  No warm-ups yet.
                </p>
              )}
              {warmups.linked.length > 0 && (
                <div className="flex flex-col gap-1">
                  <SectionLabel>Linked to a routine · {warmups.linked.length}</SectionLabel>
                  <ul className={LIST_CARD}>
                    {warmups.linked.map(({ warmup, usedBy, duplicate }) => (
                      <RoutineListRow
                        key={warmup.id}
                        routine={warmup}
                        meta={warmupMeta(warmup, usedBy)}
                        badge={duplicate ? "Copy" : null}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {warmups.unlinked.length > 0 && (
                <div className="flex flex-col gap-1">
                  <SectionLabel>Not linked · {warmups.unlinked.length}</SectionLabel>
                  <ul className={LIST_CARD}>
                    {warmups.unlinked.map(({ warmup, duplicate }) => (
                      <RoutineListRow
                        key={warmup.id}
                        routine={warmup}
                        meta={warmupMeta(warmup, [])}
                        badge={duplicate ? "Copy" : null}
                      />
                    ))}
                  </ul>
                </div>
              )}
              <Link
                href="/routines/new?kind=warmup"
                className="flex min-h-11 items-center gap-1 self-start text-sm font-medium underline underline-offset-4"
              >
                <Flame className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                New warm-up
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
