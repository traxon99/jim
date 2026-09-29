"use client";

import { type ExerciseAction, ExerciseActionsMenu } from "@/components/exercise-actions-menu";
import { ExerciseDetail } from "@/components/exercises/exercise-detail";
import { SupersetBadge } from "@/components/supersets/superset-badge";
import { mutate } from "@/lib/db/mutate";
import {
  type ExerciseRow,
  type RoutineExerciseRow,
  type SessionExerciseRow,
  type SetRow as SetRowEntity,
  type SettingsRow,
  db,
} from "@/lib/db/schema";
import {
  type DprCallInfo,
  dprBadge,
  dprRepsPlaceholder,
  dprWeightPlaceholder,
  dprWhyLine,
  needsRpeNudge,
} from "@/lib/dpr/calls";
import { loadPreviousSetsByIndex } from "@/lib/sessions/previous-set-lookup";
import {
  completeSet,
  deleteSet,
  editSet,
  restoreSet,
  updateSetKind,
} from "@/lib/sessions/set-actions";
import { type SetKind, setNumberLabels } from "@/lib/sessions/set-kinds";
import { loadEarlierStickyNotes } from "@/lib/sessions/sticky-note";
import { STRENGTH_TIER_LABELS } from "@/lib/strength-standards/labels";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type PrCandidate,
  type PreviousSet,
  RPE_MAX,
  RPE_MIN,
  STRENGTH_STANDARD_TIERS,
  WARMUP_RAMP_SET_COUNT,
  clampRpe,
  nearestLoadableWeight,
  plannedSetIndices,
  prefillWeightForSet,
  remainingPlannedSetCount,
  resolveCurrentRows,
  resolveStickyNote,
  standardLiftForSlug,
  suggestedWeightsByTier,
  warmupRamp,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Diff, File, Pin, RotateCcw, Timer } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ExerciseDialog } from "./exercise-dialog";
import { RpeInfoMenu } from "./rpe-info-menu";
import { SetKindMenu } from "./set-kind-menu";
import { SetRow } from "./set-row";

interface Props {
  sessionId: string;
  userId: string;
  item: SessionExerciseRow;
  exercise: ExerciseRow | undefined;
  target: RoutineExerciseRow | undefined;
  settings: SettingsRow;
  /** DPR's call when this is a focused lift and DPR is on (issue #212); else null. */
  dpr?: DprCallInfo | null;
  large?: boolean;
  /** "A1"-style place in a superset (issue #228), or null. */
  supersetLabel?: string | null;
  /**
   * Called after a set is logged, with this exercise's rest and how many of
   * its planned sets are still unlogged (issue #231: zero on the final set
   * of the workout means there's nothing to rest for).
   */
  onSetLogged: (restSeconds: number, remainingPlannedSets: number) => void;
  /**
   * The ⋯ menu's items after this section's own (note, sticky note, warm-ups,
   * rest): Replace, superset options, Preferences and Remove (#269, #271).
   */
  actions: readonly ExerciseAction[];
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRpeOrNull(value: string): number | null {
  const n = toNumberOrNull(value);
  return n == null ? null : clampRpe(n);
}

/** Rest choices in the ⋯ menu's Update Rest Timers; 0 turns it off. */
const REST_PRESETS = [0, 30, 60, 90, 120, 180, 300] as const;

function formatRest(seconds: number): string {
  if (seconds <= 0) return "Off";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

interface DraftValues {
  weight: string;
  reps: string;
  rpe: string;
  kind: SetKind;
}

/** How long the Undo for a deleted set stays up (issue #318). */
const UNDO_DELETE_MS = 8000;

function sizesFor(large: boolean) {
  return {
    title: large ? "text-2xl font-bold" : "text-base font-semibold",
    meta: large
      ? "text-base text-zinc-500 dark:text-zinc-500"
      : "text-xs text-zinc-500 dark:text-zinc-500",
    // Set rows (header, logged and to-log) are the same list-view row in
    // both views: focus view puts its Log button beside the inputs too, and
    // at ~305px wide that only fits with the compact inputs.
    headerRow:
      "border-b border-zinc-200 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-500",
    headerCell: "py-1 pr-2 font-medium",
    indexCell: "py-2 pr-2 align-middle text-xs font-medium text-zinc-500 dark:text-zinc-500",
    cell: "py-2 pr-2 align-middle",
    // Last session's weight over ×reps for the same set (issue #323), stacked
    // in small grey type so the column stays ~40px wide at 393px.
    prevCell:
      "py-2 pr-2 align-middle text-center text-xs leading-tight tabular-nums text-zinc-400 dark:text-zinc-500",
    actionCell: "py-2 pl-1 align-middle text-right whitespace-nowrap",
    // Values are centered and sized as large as the row allows (issue #186):
    // the input is pinned to h-11, the same height as the log/repeat buttons
    // beside it, so the row doesn't grow; text-xl is the largest size where a
    // five-character weight ("315.5") still fits the ~70px column on an
    // iPhone 16.
    input:
      "h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1 text-center text-xl tabular-nums text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
    // Only the next set's ✓ is the filled, primary button (issue #319); the
    // sets after it get a quiet outline, so the eye lands on what's next
    // rather than on everything left to do.
    logButton:
      "flex min-h-11 min-w-11 items-center justify-center rounded-md bg-accent text-accent-foreground",
    laterLogButton:
      "flex min-h-11 min-w-11 items-center justify-center rounded-md border border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500",
    repeatButton:
      "flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-500",
    rowIcon: "h-4 w-4",
    notesLabel: large
      ? "flex flex-col gap-1 text-base font-medium"
      : "flex flex-col gap-1 text-xs font-medium",
    notesInput: large
      ? "rounded-lg border border-zinc-300 bg-white px-3 py-3 text-lg text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      : "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
  };
}

export function SessionExerciseSection({
  sessionId,
  userId,
  item,
  exercise,
  target,
  settings,
  dpr = null,
  large = false,
  supersetLabel = null,
  onSetLogged,
  actions,
}: Props) {
  const sizes = sizesFor(large);
  const fieldId = useId();
  const rawSets = useLiveQuery(
    () => db.sets.where("sessionExerciseId").equals(item.id).toArray(),
    [item.id],
  );
  const [previousByIndex, setPreviousByIndex] = useState<Map<number, PreviousSet>>(new Map());
  const [prsBySetId, setPrsBySetId] = useState<Map<string, PrCandidate[]>>(new Map());
  const [notes, setNotes] = useState(item.notes ?? "");
  // Both views collapse an empty note to "+ Add note" (issue #322); a note
  // that's already there shows without an extra tap.
  const [notesOpen, setNotesOpen] = useState(Boolean(item.notes));
  const notesInputRef = useRef<HTMLInputElement>(null);
  const [focusNotes, setFocusNotes] = useState(false);
  const [draftOverrides, setDraftOverrides] = useState<Map<number, DraftValues>>(new Map());
  const [stickyEditing, setStickyEditing] = useState(false);
  const [stickyDraft, setStickyDraft] = useState("");
  const [restEditing, setRestEditing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [customRest, setCustomRest] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  // The tombstone of the set just deleted, while its Undo is offered (issue #318).
  const [undoableDelete, setUndoableDelete] = useState<SetRowEntity | null>(null);
  const closeSticky = useCallback(() => setStickyEditing(false), []);
  const closeRest = useCallback(() => setRestEditing(false), []);

  // Issue #271: the newest sticky note from an earlier workout shows here
  // until this workout sets or clears its own.
  const earlierStickyNotes = useLiveQuery(
    () => loadEarlierStickyNotes(item.exerciseId, sessionId),
    [item.exerciseId, sessionId],
  );
  const stickyNote = resolveStickyNote(item.stickyNote, earlierStickyNotes ?? []);

  useEffect(() => {
    if (!focusNotes || !notesOpen) return;
    notesInputRef.current?.focus();
    setFocusNotes(false);
  }, [focusNotes, notesOpen]);

  useEffect(() => {
    let cancelled = false;
    void loadPreviousSetsByIndex(item.exerciseId, sessionId).then((map) => {
      if (!cancelled) setPreviousByIndex(map);
    });
    return () => {
      cancelled = true;
    };
  }, [item.exerciseId, sessionId]);

  const sets = useMemo(() => {
    return resolveCurrentRows(rawSets ?? [])
      .filter((set) => !set.deletedAt)
      .sort((a, b) => a.setIndex - b.setIndex);
  }, [rawSets]);

  // Warm-up sets added from the ⋯ menu (issue #271) are planned at the
  // front, so the working sets' "last time" lookups shift back by as many.
  const warmupCount = item.warmupSets ?? 0;
  function previousFor(index: number): PreviousSet | undefined {
    return index < warmupCount ? undefined : previousByIndex.get(index - warmupCount);
  }
  const plannedTotal = Math.max(target?.targetSets ?? 0, previousByIndex.size, 1) + warmupCount;

  const nextIndex = sets.length;
  const previous = previousByIndex.get(Math.max(nextIndex - warmupCount, 0));
  const lastSet = sets[sets.length - 1];
  const restSeconds =
    item.restSeconds ?? target?.targetRestSeconds ?? (Number(settings.defaultRestSeconds) || 90);

  const loggedIndices = useMemo(() => new Set(sets.map((set) => set.setIndex)), [sets]);

  // The routine's target weight is the starting point for an exercise with
  // no history yet (the weekly auto-increment it once drove is replaced by
  // DPR, issue #217).
  const targetWeight = target?.targetWeight == null ? null : Number(target.targetWeight);

  // Strength-standard weight suggestions (#94): only for the four lifts
  // packages/core has published standards for, and only once sex + bodyweight
  // are on the profile (age is optional — see strengthProfileFromSettings).
  const standardLift = useMemo(() => standardLiftForSlug(exercise?.slug), [exercise?.slug]);
  const strengthProfile = useMemo(() => strengthProfileFromSettings(settings), [settings]);

  // Preloaded sets (issue #121): every not-yet-logged set the routine or last
  // time's workout calls for gets its own row, ready to log one tap at a
  // time. `draftOverrides` holds only rows the lifter has actually edited;
  // everything else is computed fresh from the plan/history on every render,
  // so it stays current as `previousByIndex` loads in.
  const plannedIndices = useMemo(
    () => plannedSetIndices(plannedTotal, 0, loggedIndices),
    [plannedTotal, loggedIndices],
  );

  // Suggested weight/reps for a not-yet-logged row (issue #159): last time's
  // numbers at this position, or the routine's target, same source as before
  // — but now shown only as a background suggestion (the input's placeholder,
  // matching the warm-up logger) rather than typed into the field. Logging
  // with the field left blank falls back to this suggestion, same as a
  // warm-up set left blank falls back to its target. For a DPR-focused lift
  // (issue #212), DPR's weight — and after a change, the bottom of the rep
  // range — replaces both on working sets, still just a placeholder.
  function remainingAfterLogging(index: number): number {
    return remainingPlannedSetCount(plannedTotal, 0, new Set([...loggedIndices, index]));
  }

  // The ramp aims at the first working set's suggested weight.
  const firstWorkingWeight = toNumberOrNull(
    dprWeightPlaceholder(dpr, "working") ??
      prefillWeightForSet(0, previousFor(warmupCount), targetWeight),
  );
  const ramp = warmupRamp(
    firstWorkingWeight,
    Number(settings.defaultBarWeight) || 0,
    settings.units === "kg" ? 2.5 : 5,
  );

  function suggestedWeightFor(index: number): string {
    if (index < warmupCount) {
      const weight = ramp[index]?.weight;
      return weight == null ? "" : String(weight);
    }
    return (
      dprWeightPlaceholder(dpr, draftFor(index).kind) ??
      prefillWeightForSet(index - warmupCount, previousFor(index), targetWeight)
    );
  }
  function suggestedRepsFor(index: number): string {
    if (index < warmupCount) return String(ramp[index]?.reps ?? "");
    const dprReps = dprRepsPlaceholder(dpr, draftFor(index).kind);
    if (dprReps !== null) return dprReps;
    const priorAtIndex = previousFor(index);
    return priorAtIndex?.reps != null
      ? String(priorAtIndex.reps)
      : (target?.targetRepsLow?.toString() ?? "");
  }

  function defaultDraft(index: number): DraftValues {
    return {
      weight: "",
      reps: "",
      rpe: "",
      kind: index < warmupCount ? "warmup" : "working",
    };
  }

  function draftFor(index: number): DraftValues {
    return draftOverrides.get(index) ?? defaultDraft(index);
  }

  function updateDraft(index: number, patch: Partial<DraftValues>) {
    setDraftOverrides((current) => {
      const next = new Map(current);
      next.set(index, { ...(current.get(index) ?? defaultDraft(index)), ...patch });
      return next;
    });
  }

  // Tapping a Prev value copies last time's set into that row (issue #323).
  function fillFromPrevious(index: number) {
    const prior = previousFor(index);
    if (!prior) return;
    updateDraft(index, {
      weight: prior.weight == null ? "" : String(prior.weight),
      reps: prior.reps == null ? "" : String(prior.reps),
    });
  }

  const nextDraft = draftFor(nextIndex);

  // Warm-ups show "W" and working sets are numbered from 1 after them (issue
  // #220), across logged rows followed by the planned rows still to log.
  const rowLabels = setNumberLabels([
    ...sets.map((set) => set.kind),
    ...plannedIndices.map((index) => draftFor(index).kind),
  ]);
  const nextLabel = setNumberLabels([...sets.map((set) => set.kind), nextDraft.kind]).at(-1) ?? "1";
  const suggestionReps =
    toNumberOrNull(nextDraft.reps) ?? previous?.reps ?? target?.targetRepsLow ?? 5;
  const barWeight = Number(settings.defaultBarWeight) || 0;
  const plates = useMemo(
    () => settings.availablePlates.map(Number).filter((plate) => plate > 0),
    [settings.availablePlates],
  );
  // The standard lifts are all barbell lifts, so each tier's weight is
  // rounded to one the bar and plates can make (issue #320).
  const suggestedWeights = useMemo(() => {
    if (!standardLift || !strengthProfile) return null;
    const raw = suggestedWeightsByTier(standardLift, strengthProfile, suggestionReps);
    const loadable = { ...raw };
    for (const tier of STRENGTH_STANDARD_TIERS) {
      loadable[tier] = nearestLoadableWeight(raw[tier], barWeight, plates);
    }
    return loadable;
  }, [standardLift, strengthProfile, suggestionReps, barWeight, plates]);
  // With history for the lift (last time's sets, or a set already logged
  // today) the tiers are noise, so they wait behind "Suggest weight".
  const hasHistory = previousByIndex.size > 0 || sets.length > 0;

  async function logRow(index: number) {
    const draft = draftFor(index);
    const weight = toNumberOrNull(draft.weight) ?? toNumberOrNull(suggestedWeightFor(index));
    const reps = toNumberOrNull(draft.reps) ?? toNumberOrNull(suggestedRepsFor(index));
    const { set, prs } = await completeSet({
      userId,
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      setIndex: index,
      kind: draft.kind,
      weight,
      reps,
      rpe: toRpeOrNull(draft.rpe),
    });
    if (prs.length > 0) setPrsBySetId((map) => new Map(map).set(set.id, prs));
    setDraftOverrides((current) => {
      if (!current.has(index)) return current;
      const next = new Map(current);
      next.delete(index);
      return next;
    });
    onSetLogged(restSeconds, remainingAfterLogging(index));
  }

  async function repeatLast() {
    if (!lastSet) return;
    const { set, prs } = await completeSet({
      userId,
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      setIndex: nextIndex,
      kind: lastSet.kind,
      weight: lastSet.weight == null ? null : Number(lastSet.weight),
      reps: lastSet.reps,
      rpe: lastSet.rpe == null ? null : Number(lastSet.rpe),
    });
    if (prs.length > 0) setPrsBySetId((map) => new Map(map).set(set.id, prs));
    onSetLogged(restSeconds, remainingAfterLogging(nextIndex));
  }

  useEffect(() => {
    if (!undoableDelete) return;
    const timer = setTimeout(() => setUndoableDelete(null), UNDO_DELETE_MS);
    return () => clearTimeout(timer);
  }, [undoableDelete]);

  async function handleEdit(
    original: SetRowEntity,
    patch: { weight: number | null; reps: number | null; rpe: number | null },
  ) {
    await editSet({ original, ...patch, kind: original.kind });
  }

  async function handleChangeKind(original: SetRowEntity, kind: SetKind) {
    await updateSetKind(original, kind);
  }

  async function handleDelete(original: SetRowEntity) {
    setUndoableDelete(await deleteSet(original));
  }

  async function handleUndoDelete() {
    if (!undoableDelete) return;
    const tombstone = undoableDelete;
    setUndoableDelete(null);
    const restored = await restoreSet(tombstone);
    // The restored row has a new id; keep the 🎉 of the set it brings back.
    const prs = tombstone.supersedesId ? prsBySetId.get(tombstone.supersedesId) : undefined;
    if (prs) setPrsBySetId((map) => new Map(map).set(restored.id, prs));
  }

  async function saveItem(patch: Partial<SessionExerciseRow>) {
    const deviceId = await getDeviceId();
    await mutate("sessionExercises", {
      ...item,
      ...patch,
      updatedAt: new Date(),
      deviceId,
    });
  }

  async function handleNotesBlur() {
    if (!notes.trim()) setNotesOpen(false);
    await saveItem({ notes: notes.trim() || null });
  }

  async function saveStickyNote(value: string) {
    // "" rather than null, so a cleared note stops earlier ones showing.
    await saveItem({ stickyNote: value.trim() });
    setStickyEditing(false);
  }

  async function saveRest(seconds: number) {
    await saveItem({ restSeconds: Math.max(0, Math.round(seconds)) });
    setRestEditing(false);
  }

  async function toggleWarmups() {
    setDraftOverrides(new Map());
    await saveItem({ warmupSets: warmupCount > 0 ? null : WARMUP_RAMP_SET_COUNT });
  }

  // This section's own ⋯ entries (issue #271) come first, in the order the
  // menu shows them; warm-ups can only be planned before anything is logged.
  const ownActions: ExerciseAction[] = [
    {
      label: notes.trim() ? "Edit Note" : "Add Note",
      icon: File,
      onSelect: () => {
        setNotesOpen(true);
        setFocusNotes(true);
      },
    },
    {
      label: stickyNote ? "Edit Sticky Note" : "Add Sticky Note",
      icon: Pin,
      onSelect: () => {
        setStickyDraft(stickyNote ?? "");
        setStickyEditing(true);
      },
    },
    ...(sets.length === 0
      ? [
          {
            label: warmupCount > 0 ? "Remove Warm-up Sets" : "Add Warm-up Sets",
            icon: Diff,
            onSelect: () => void toggleWarmups(),
          },
        ]
      : []),
    {
      label: "Update Rest Timers",
      icon: Timer,
      onSelect: () => {
        setCustomRest("");
        setRestEditing(true);
      },
    },
  ];

  function weightInputFor(index: number, draft: DraftValues) {
    return (
      <input
        id={index === nextIndex ? `${fieldId}-weight` : undefined}
        type="number"
        inputMode="decimal"
        placeholder={suggestedWeightFor(index)}
        value={draft.weight}
        onChange={(event) => updateDraft(index, { weight: event.target.value })}
        className={sizes.input}
      />
    );
  }
  function repsInputFor(index: number, draft: DraftValues) {
    return (
      <input
        id={index === nextIndex ? `${fieldId}-reps` : undefined}
        type="number"
        inputMode="numeric"
        placeholder={suggestedRepsFor(index)}
        value={draft.reps}
        onChange={(event) => updateDraft(index, { reps: event.target.value })}
        className={sizes.input}
      />
    );
  }
  function rpeInputFor(index: number, draft: DraftValues) {
    return (
      <input
        id={index === nextIndex ? `${fieldId}-rpe` : undefined}
        aria-labelledby={index === nextIndex ? `${fieldId}-rpe-label` : undefined}
        type="number"
        inputMode="decimal"
        min={RPE_MIN}
        max={RPE_MAX}
        step={0.5}
        placeholder={dpr && draft.kind === "working" ? "RPE" : "—"}
        value={draft.rpe}
        onChange={(event) => updateDraft(index, { rpe: event.target.value })}
        className={
          // Soft-required on focused lifts: sessions without RPE don't count.
          dpr && draft.kind === "working"
            ? `${sizes.input} border-accent ring-1 ring-accent dark:border-accent`
            : sizes.input
        }
      />
    );
  }
  function logButtonFor(index: number) {
    return (
      <button
        type="button"
        onClick={() => void logRow(index)}
        aria-label={`Log set ${index + 1}`}
        className={index === nextIndex ? sizes.logButton : sizes.laterLogButton}
      >
        <Check className={sizes.rowIcon} strokeWidth={2.25} aria-hidden="true" />
      </button>
    );
  }
  const repeatButton = lastSet && (
    <button
      type="button"
      onClick={() => void repeatLast()}
      aria-label="Repeat last set"
      className={sizes.repeatButton}
    >
      <RotateCcw className={sizes.rowIcon} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );

  const tableHead = (
    <thead>
      <tr className={sizes.headerRow}>
        <th className={`w-8 ${sizes.headerCell}`}>Set</th>
        <th className={`text-center ${sizes.headerCell}`}>Prev</th>
        <th className={`text-center ${sizes.headerCell}`}>Weight</th>
        {/* Reps and RPE are pinned narrow (issue #323) so, beside the Prev
            column, Weight still fits "315.5" at text-xl on a ~325px table. */}
        <th className={`w-11 text-center ${sizes.headerCell}`}>Reps</th>
        <th className={`w-12 text-center ${sizes.headerCell}`}>
          <RpeInfoMenu titleId={`${fieldId}-rpe-label`} />
        </th>
        <th className={sizes.headerCell} />
      </tr>
    </thead>
  );
  function previousValues(index: number) {
    const prior = previousFor(index);
    if (!prior || (prior.weight == null && prior.reps == null)) return <span>—</span>;
    return (
      <span className="flex flex-col items-center">
        <span>{prior.weight ?? "—"}</span>
        <span>×{prior.reps ?? "—"}</span>
      </span>
    );
  }
  function loggedRow(set: SetRowEntity, label: string) {
    return (
      <SetRow
        key={set.id}
        set={set}
        label={label}
        previous={<td className={sizes.prevCell}>{previousValues(set.setIndex)}</td>}
        isPr={prsBySetId.has(set.id)}
        rpeNudge={needsRpeNudge(dpr !== null, set)}
        onEdit={(patch) => void handleEdit(set, patch)}
        onChangeKind={(kind) => void handleChangeKind(set, kind)}
        onDelete={() => void handleDelete(set)}
      />
    );
  }
  function plannedRow(index: number, label: string) {
    const draft = draftFor(index);
    return (
      <tr key={index}>
        <td className={sizes.indexCell}>
          <SetKindMenu
            label={label}
            kind={draft.kind}
            onChange={(kind) => updateDraft(index, { kind })}
          />
        </td>
        <td className={sizes.prevCell}>
          {previousFor(index) ? (
            <button
              type="button"
              onClick={() => fillFromPrevious(index)}
              aria-label={`Use last time's set ${index + 1}`}
              className="min-h-11 w-full"
            >
              {previousValues(index)}
            </button>
          ) : (
            previousValues(index)
          )}
        </td>
        <td className={sizes.cell}>{weightInputFor(index, draft)}</td>
        <td className={sizes.cell}>{repsInputFor(index, draft)}</td>
        <td className={sizes.cell}>{rpeInputFor(index, draft)}</td>
        <td className={sizes.actionCell}>
          <div className="flex min-w-22 items-center justify-end">
            {index === nextIndex && repeatButton}
            {logButtonFor(index)}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <section
      className={
        large
          ? "flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          : "flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className={`${sizes.title} flex min-w-0 items-center gap-2`}>
          {supersetLabel && <SupersetBadge label={supersetLabel} />}
          {exercise ? (
            <button type="button" onClick={() => setDetailOpen(true)} className="min-w-0 text-left">
              {exercise.name}
            </button>
          ) : (
            <span className="min-w-0">Exercise</span>
          )}
          {dpr && (
            <span
              title={dprBadge(dpr.decision.call).label}
              className={`shrink-0 rounded-full border px-1.5 text-xs font-semibold ${dprBadge(dpr.decision.call).className}`}
            >
              {dpr.decision.reason === "Deload week"
                ? "Deload week"
                : `DPR ${dprBadge(dpr.decision.call).symbol}`}
            </span>
          )}
        </h2>
        <ExerciseActionsMenu actions={[...ownActions, ...actions]} large={large} />
      </div>

      {stickyNote && (
        <button
          type="button"
          onClick={() => {
            setStickyDraft(stickyNote);
            setStickyEditing(true);
          }}
          className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
        >
          <Pin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="allow-pwa-select min-w-0 whitespace-pre-wrap">{stickyNote}</span>
        </button>
      )}

      {item.restSeconds != null && (
        <p className={sizes.meta}>
          {item.restSeconds > 0
            ? `Rest ${formatRest(item.restSeconds)} this workout`
            : "Rest timer off this workout"}
        </p>
      )}

      {!previous && target && (
        <p className={sizes.meta}>
          Target: {target.targetSets ?? "—"} × {target.targetRepsLow ?? "—"}–
          {target.targetRepsHigh ?? "—"}
        </p>
      )}

      {dpr && <p className={sizes.meta}>{dprWhyLine(dpr.decision, settings.units)}</p>}

      {suggestedWeights && hasHistory && !suggestionsOpen && (
        <button
          type="button"
          onClick={() => setSuggestionsOpen(true)}
          className="self-start text-xs font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
        >
          Suggest weight
        </button>
      )}
      {suggestedWeights && (!hasHistory || suggestionsOpen) && (
        <div className="flex flex-col gap-1.5">
          <p className={sizes.meta}>Suggested for {suggestionReps} reps, by strength standard:</p>
          <div className="flex flex-wrap gap-1.5">
            {STRENGTH_STANDARD_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => updateDraft(nextIndex, { weight: String(suggestedWeights[tier]) })}
                className="min-h-8 rounded-full border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                {STRENGTH_TIER_LABELS[tier]} {suggestedWeights[tier]}
              </button>
            ))}
          </div>
        </div>
      )}

      {!large && (
        <table className="w-full border-collapse text-left">
          {tableHead}
          <tbody>
            {sets.map((set, i) => loggedRow(set, rowLabels[i] ?? String(i + 1)))}
            {plannedIndices.map((index, i) =>
              plannedRow(index, rowLabels[sets.length + i] ?? String(index + 1)),
            )}
          </tbody>
        </table>
      )}

      {/* Focus view shows the set just logged (issue #257) above the one to
          log next, as list-view rows with the Log button beside the inputs. */}
      {large && (
        <table className="w-full border-collapse text-left">
          {tableHead}
          <tbody>
            {lastSet && loggedRow(lastSet, rowLabels[sets.length - 1] ?? String(sets.length))}
            {plannedRow(nextIndex, nextLabel)}
          </tbody>
        </table>
      )}

      {undoableDelete && (
        <output className="flex items-center justify-between gap-2 rounded-lg bg-zinc-100 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          <span>Set deleted</span>
          <button
            type="button"
            onClick={() => void handleUndoDelete()}
            className="min-h-11 px-2 font-semibold text-accent"
          >
            Undo
          </button>
        </output>
      )}

      {notesOpen ? (
        <label className={sizes.notesLabel}>
          Exercise notes
          <input
            ref={notesInputRef}
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => void handleNotesBlur()}
            className={sizes.notesInput}
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => {
            setNotesOpen(true);
            setFocusNotes(true);
          }}
          className="self-start text-xs font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
        >
          + Add note
        </button>
      )}

      {stickyEditing && (
        <ExerciseDialog title="Sticky note" onClose={closeSticky}>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Shows on {exercise?.name ?? "this exercise"} in every workout until you change it.
          </p>
          <textarea
            value={stickyDraft}
            onChange={(event) => setStickyDraft(event.target.value)}
            rows={3}
            // biome-ignore lint/a11y/noAutofocus: the dialog exists to type this note.
            autoFocus
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <div className="flex justify-end gap-2">
            {stickyNote && (
              <button
                type="button"
                onClick={() => void saveStickyNote("")}
                className="mr-auto min-h-11 px-2 text-sm font-medium text-red-600 dark:text-red-500"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={closeSticky}
              className="min-h-11 px-3 text-sm font-medium text-zinc-600 dark:text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveStickyNote(stickyDraft)}
              className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
            >
              Save
            </button>
          </div>
        </ExerciseDialog>
      )}

      {restEditing && (
        <ExerciseDialog title="Rest timer" onClose={closeRest}>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Rest after each set of {exercise?.name ?? "this exercise"} in this workout. Now{" "}
            {formatRest(restSeconds)}.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {REST_PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                aria-pressed={restSeconds === seconds}
                onClick={() => void saveRest(seconds)}
                className={`min-h-11 rounded-lg border text-sm font-medium tabular-nums ${
                  restSeconds === seconds
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {formatRest(seconds)}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const seconds = toNumberOrNull(customRest);
              if (seconds != null && seconds >= 0) void saveRest(seconds);
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
              Custom (seconds)
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={customRest}
                onChange={(event) => setCustomRest(event.target.value)}
                className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
            >
              Set
            </button>
          </form>
          {item.restSeconds != null && (
            <button
              type="button"
              onClick={() => {
                void saveItem({ restSeconds: null });
                setRestEditing(false);
              }}
              className="self-start text-sm font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
            >
              Use the routine's rest
            </button>
          )}
        </ExerciseDialog>
      )}
      {detailOpen && (
        <ExerciseDetail id={item.exerciseId} userId={userId} onClose={() => setDetailOpen(false)} />
      )}
    </section>
  );
}
