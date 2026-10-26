"use client";

import {
  CATALOG_SECTION_LABEL,
  ExerciseCatalogControls,
  ExerciseCatalogRowContent,
  useExerciseCatalog,
} from "@/components/exercises/exercise-catalog";
import { ExerciseForm } from "@/components/exercises/exercise-form";
import { useGymNames } from "@/lib/exercises/display";
import { type ExerciseCategory, type ExerciseMuscles, sparingSwapFilter } from "@jim/core";
import { Check, Plus } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  userId: string;
  excludeExerciseIds: ReadonlySet<string>;
  /**
   * The picked exercises, in the order they were tapped. Two or more are
   * added together as a superset (issue #269).
   */
  onPick: (exerciseIds: string[]) => void | Promise<void>;
  onClose: () => void;
  /** Which tab the picker opens on — e.g. "warmup" inside a warm-up routine. */
  initialCategory?: ExerciseCategory | "all";
  /**
   * "replace" (the ⋯ menu's Replace Exercise, issue #271) picks exactly one:
   * a tap picks it straight away, with no selection or superset.
   */
  mode?: "add" | "replace";
  /** The header, when neither "Add exercise" nor "Replace exercise" fits. */
  title?: string;
  /**
   * Shown at the top of the list, before any search, in an ad hoc workout's
   * Add exercise menu (issue #226). Only strength exercises are suggested.
   */
  suggestedExerciseIds?: readonly string[];
  /**
   * Replacing an exercise an open injury affects (issue #627): list only
   * swaps that work its other muscles and spare these areas, until the user
   * asks to see everything. `label` names them, e.g. "your left knee".
   */
  spare?: {
    exercise: ExerciseMuscles;
    areas: readonly string[];
    label: string;
    /** Exercises an open injury's rule says to avoid (issue #724). */
    avoidIds?: readonly string[];
  } | null;
}

const SECTION_LABEL = `pt-4 pb-1 ${CATALOG_SECTION_LABEL}`;

export function ExercisePicker({
  userId,
  excludeExerciseIds,
  onPick,
  onClose,
  initialCategory = "all",
  mode = "add",
  title,
  suggestedExerciseIds = [],
  spare = null,
}: Props) {
  const replacing = mode === "replace";
  const [showAll, setShowAll] = useState(false);
  // Keyed on the exercise and areas, so a fresh `spare` object each render
  // doesn't re-filter the whole catalog.
  const spareExercise = spare?.exercise ?? null;
  const spareAreas = spare?.areas.join("|") ?? "";
  const spareAvoid = spare?.avoidIds?.join("|") ?? "";
  const include = useMemo(
    () =>
      spareExercise && spareAreas && !showAll
        ? sparingSwapFilter(
            spareExercise,
            spareAreas.split("|"),
            spareAvoid ? spareAvoid.split("|") : [],
          )
        : null,
    [spareExercise, spareAreas, spareAvoid, showAll],
  );
  const gymNames = useGymNames();

  // Full-screen overlay rules (docs/PWA.md §2, #521): lock the page behind
  // so a drag on the header can't scroll the workout underneath.
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const previous = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous.html;
      body.style.overflow = previous.body;
    };
  }, []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const portal = (content: ReactNode) => (mounted ? createPortal(content, document.body) : null);
  // The same search, filters and sections as the Exercises tab (#710).
  const catalog = useExerciseCatalog({ userId, initialCategory, excludeExerciseIds, include });
  const { query, deferredQuery, results, usage, yours, rest, restPage } = catalog;
  const { category } = catalog.filters;
  // Issue #169: create a missing exercise from here with the same form the
  // Exercises page uses, then add it straight away.
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // One pick per opening (issue #550): a double tap on Add inserted the
  // exercises twice. Cleared if the pick fails, so the user can retry.
  const picking = useRef(false);
  function pick(exerciseIds: string[]) {
    if (picking.current) return;
    picking.current = true;
    Promise.resolve()
      .then(() => onPick(exerciseIds))
      .catch((error: unknown) => {
        picking.current = false;
        console.error("[exercise-picker] adding failed:", error);
      });
  }

  function toggleSelected(exerciseId: string) {
    if (replacing) {
      pick([exerciseId]);
      return;
    }
    setSelectedIds((current) =>
      current.includes(exerciseId)
        ? current.filter((selectedId) => selectedId !== exerciseId)
        : [...current, exerciseId],
    );
  }

  // Suggestions are strength work, so they sit out a search and the
  // Warm-ups and Cardio tabs; while they show, the list below doesn't repeat them.
  const suggestions = useMemo(() => {
    if (replacing || query.trim() || category === "warmup" || category === "cardio") return [];
    return suggestedExerciseIds.flatMap((exerciseId) => {
      const exercise = results.find((row) => row.id === exerciseId);
      return exercise ? [exercise] : [];
    });
  }, [replacing, query, category, suggestedExerciseIds, results]);
  const suggestedIds = useMemo(
    () => new Set(suggestions.map((exercise) => exercise.id)),
    [suggestions],
  );
  const yoursListed = yours.filter((exercise) => !suggestedIds.has(exercise.id));
  const restListed = restPage.visible.filter((exercise) => !suggestedIds.has(exercise.id));
  const restLeft = rest.some((exercise) => !suggestedIds.has(exercise.id));

  function renderRow(exercise: (typeof results)[number]) {
    const order = selectedIds.indexOf(exercise.id);
    const selected = order !== -1;
    return (
      <li key={exercise.id}>
        <button
          type="button"
          aria-pressed={replacing ? undefined : selected}
          onClick={() => toggleSelected(exercise.id)}
          className="flex w-full items-center gap-3 py-3 text-left"
        >
          <ExerciseCatalogRowContent
            exercise={exercise}
            query={deferredQuery}
            used={usage.get(exercise.id)}
            gymNames={gymNames}
          />
          {!replacing && (
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                selected
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {selected &&
                (selectedIds.length > 1 ? (
                  order + 1
                ) : (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ))}
            </span>
          )}
        </button>
      </li>
    );
  }

  if (creating) {
    // z-20: above RestTimerBar's z-10 (#227); portaled, so no ancestor's
    // stacking context can paint over it (#521).
    return portal(
      <div
        className="route-fade safe-x fixed inset-0 z-20 flex flex-col overflow-y-auto overscroll-contain bg-white dark:bg-zinc-950"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <ExerciseForm
          userId={userId}
          mode="new"
          initialName={query.trim()}
          initialCategory={category === "all" ? "strength" : category}
          onSaved={(exercise) => {
            // On its own it's added straight away, as before; alongside
            // others it joins the selection.
            if (selectedIds.length === 0) {
              pick([exercise.id]);
              return;
            }
            setSelectedIds((current) => [...current, exercise.id]);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      </div>,
    );
  }

  // z-20: above RestTimerBar's z-10 (#227); portaled, so no ancestor's
  // stacking context can paint over it (#521).
  return portal(
    <div
      className="route-fade safe-x fixed inset-0 z-20 flex flex-col overscroll-none bg-white dark:bg-zinc-950"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex touch-none items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">
          {title ?? (replacing ? "Replace exercise" : "Add exercise")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 px-3 text-sm font-medium underline underline-offset-4"
        >
          Cancel
        </button>
      </div>

      <div className="flex touch-none flex-col gap-2 px-4 py-3">
        <ExerciseCatalogControls catalog={catalog} />
        {!replacing && (
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Pick two or more to add them as a superset.
          </p>
        )}
        {spare && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500 dark:text-zinc-500">
            {showAll ? "Showing every exercise." : `Swaps that spare ${spare.label}.`}
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="min-h-11 font-medium text-accent underline underline-offset-4"
            >
              {showAll ? `Only ones that spare ${spare.label}` : "Show all"}
            </button>
          </p>
        )}
      </div>

      <ul
        className="flex min-h-0 flex-1 flex-col divide-y divide-zinc-200 overflow-y-auto overscroll-contain px-4 dark:divide-zinc-800"
        // Without the footer, the list itself reaches the home indicator.
        style={replacing ? { paddingBottom: "max(12px, env(safe-area-inset-bottom))" } : undefined}
      >
        {suggestions.length > 0 && (
          <>
            <li className={SECTION_LABEL}>Suggested</li>
            {suggestions.map(renderRow)}
          </>
        )}
        {yoursListed.length > 0 && (
          <>
            <li className={SECTION_LABEL}>Your exercises</li>
            {yoursListed.map(renderRow)}
          </>
        )}
        {(suggestions.length > 0 || yoursListed.length > 0) && restLeft && (
          <li className={SECTION_LABEL}>All exercises</li>
        )}
        {restListed.map(renderRow)}
        {restPage.hasMore && <li ref={restPage.sentinelRef} aria-hidden="true" className="h-px" />}
        {results.length === 0 && (
          <li className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No exercises match.
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-11 w-full items-center gap-2 py-3 text-left text-base font-medium text-accent"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {query.trim() ? `Create “${query.trim()}”` : "New exercise"}
          </button>
        </li>
      </ul>

      {!replacing && (
        <div
          className="shrink-0 touch-none border-t border-zinc-200 px-4 pt-3 dark:border-zinc-800"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => pick(selectedIds)}
            disabled={selectedIds.length === 0}
            className="min-h-11 w-full rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-40"
          >
            {selectedIds.length > 1
              ? `Add ${selectedIds.length} as superset`
              : selectedIds.length === 1
                ? "Add exercise"
                : "Select exercises"}
          </button>
        </div>
      )}
    </div>,
  );
}
