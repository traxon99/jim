import { SET_KINDS, type SetKind } from "@/lib/sessions/set-kinds";
import { formatSetValue } from "@/lib/workout/set-field-edit";
import { clampRpe } from "@jim/core";

/** In-progress values for one planned set row before it's logged. */
export interface SessionSetDraftValues {
  weight: string;
  reps: string;
  rpe: string;
  kind: SetKind;
}

export function parseSetDraftNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseSetDraftRpe(value: string): number | null {
  const n = parseSetDraftNumber(value);
  return n == null ? null : clampRpe(n);
}

/**
 * How long after a set is logged a tap on its ✓ is ignored (issue #645).
 * The ✓ stays where Log was (issue #318), so without this the second tap of
 * a quick double tap would unlog the set it just logged.
 */
export const UNLOG_GRACE_MS = 1000;

export function canUnlogSet(completedAt: Date, now: Date): boolean {
  return now.getTime() - new Date(completedAt).getTime() >= UNLOG_GRACE_MS;
}

/**
 * The planned row an unlogged set goes back to (issue #645): its logged
 * values typed in, ready to fix and log again. A set kind that's no longer
 * offered (an old "drop" set) comes back as a working set.
 */
export function unloggedSetDraft(set: {
  weight: string | number | null;
  reps: number | null;
  rpe: string | number | null;
  kind: string;
}): SessionSetDraftValues {
  return {
    weight: formatSetValue(set.weight),
    reps: set.reps == null ? "" : String(set.reps),
    rpe: formatSetValue(set.rpe),
    kind: (SET_KINDS as readonly string[]).includes(set.kind) ? (set.kind as SetKind) : "working",
  };
}

/**
 * Tailwind classes for the session set table and its inputs (#556). Shared by
 * list and Focus view; SessionSetTable only needs the table row keys.
 */
export function sessionSetTableSizes(large: boolean) {
  return {
    title: large ? "text-2xl font-bold" : "text-lg font-semibold tracking-tight",
    meta: large
      ? "text-base text-zinc-500 dark:text-zinc-500"
      : "text-sm text-zinc-500 dark:text-zinc-500",
    // Set rows (header, logged and to-log) are the same list-view row in
    // both views: focus view puts its Log button beside the inputs too, and
    // at ~305px wide that only fits with the compact inputs.
    headerRow: "text-xs font-medium text-zinc-500 dark:text-zinc-500",
    // The rule sits on the cells: the table's separated borders (for the gap
    // between logged rows, issue #391) don't draw a row's own border.
    headerCell: "py-1 pr-2 font-medium",
    // pl-2 lines the label up with a logged row's, which is inset from its
    // tinted edge (issue #391).
    indexCell: "py-2 pl-2 pr-2 align-middle text-xs font-medium text-zinc-500 dark:text-zinc-500",
    cell: "py-2 pr-2 align-middle",
    // `relative` anchors the swipe-to-delete strip (issue #350).
    actionCell: "relative py-2 pl-1 pr-1 align-middle text-right whitespace-nowrap",
    // Values are centered and sized as large as the row allows (issue #186):
    // the input is pinned to h-11, the same height as the log/repeat buttons
    // beside it, so the row doesn't grow; text-xl is the largest size where a
    // five-character weight ("315.5") still fits the ~70px column on an
    // iPhone 16.
    // Filled, borderless boxes (#854): the table reads as numbers, not a form.
    input:
      "h-11 w-full min-w-0 rounded-xl border bg-zinc-100 px-1 text-center text-xl font-semibold tabular-nums text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50",
    // Kept apart from `input` so a box PRP prefilled can swap in its call's
    // dashed outline (issue #712) without two border colors fighting.
    inputBorder: "border-transparent",
    // Only the next set's ✓ is a solid ring (issue #319, #862); the sets
    // after it get a quiet dashed one, so the eye lands on what's next. It
    // isn't filled: a filled ✓ is a logged set's.
    logButton:
      "press flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-accent text-accent",
    laterLogButton:
      "press flex min-h-11 min-w-11 items-center justify-center rounded-full border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-600 dark:text-zinc-500",
    repeatButton:
      "press flex min-h-11 min-w-11 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-500",
    rowIcon: "h-5 w-5",
    notesLabel: large
      ? "flex flex-col gap-1 text-base font-medium"
      : "flex flex-col gap-1 text-xs font-medium",
    notesInput: large
      ? "rounded-lg border border-zinc-300 bg-white px-3 py-3 text-lg text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      : "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
  };
}

export type SessionSetTableSizes = Pick<
  ReturnType<typeof sessionSetTableSizes>,
  "headerRow" | "headerCell" | "indexCell" | "cell" | "actionCell"
>;

/**
 * Last time's working sets on one line under the exercise name (#854), where
 * the table's Prev column used to be: "185 × 8, 8, 7" when the weight held,
 * else "185 × 8, 190 × 7". Null with nothing to show.
 */
export function lastTimeLine(sets: readonly { weight: number | null; reps: number | null }[]) {
  const shown = sets.filter((set) => set.weight != null || set.reps != null);
  if (shown.length === 0) return null;
  const weights = new Set(shown.map((set) => set.weight));
  const reps = (set: { reps: number | null }) => (set.reps == null ? "—" : String(set.reps));
  const weight = (set: { weight: number | null }) =>
    set.weight == null ? "—" : formatSetValue(set.weight);
  const first = shown[0];
  if (first && weights.size === 1) {
    return `${weight(first)} × ${shown.map(reps).join(", ")}`;
  }
  return shown.map((set) => `${weight(set)} × ${reps(set)}`).join(", ");
}
