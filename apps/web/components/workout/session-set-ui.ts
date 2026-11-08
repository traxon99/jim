import type { SetKind } from "@/lib/sessions/set-kinds";
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
 * Tailwind classes for the session set table and its inputs (#556). Shared by
 * list and Focus view; SessionSetTable only needs the table row keys.
 */
export function sessionSetTableSizes(large: boolean) {
  return {
    title: large ? "text-2xl font-bold" : "text-base font-semibold",
    meta: large
      ? "text-base text-zinc-500 dark:text-zinc-500"
      : "text-xs text-zinc-500 dark:text-zinc-500",
    // Set rows (header, logged and to-log) are the same list-view row in
    // both views: focus view puts its Log button beside the inputs too, and
    // at ~305px wide that only fits with the compact inputs.
    headerRow: "text-xs font-medium text-zinc-500 dark:text-zinc-500",
    // The rule sits on the cells: the table's separated borders (for the gap
    // between logged rows, issue #391) don't draw a row's own border.
    headerCell: "border-b border-zinc-200 py-1 pr-2 font-medium dark:border-zinc-800",
    // pl-2 lines the label up with a logged row's, which is inset from its
    // tinted edge (issue #391).
    indexCell: "py-2 pl-2 pr-2 align-middle text-xs font-medium text-zinc-500 dark:text-zinc-500",
    cell: "py-2 pr-2 align-middle",
    // Last session's weight over ×reps for the same set (issue #323), stacked
    // in small grey type so the column stays ~40px wide at 393px.
    prevCell:
      "py-2 pr-2 align-middle text-center text-xs leading-tight tabular-nums text-zinc-400 dark:text-zinc-500",
    // `relative` anchors the swipe-to-delete strip (issue #350).
    actionCell: "relative py-2 pl-1 pr-1 align-middle text-right whitespace-nowrap",
    // Values are centered and sized as large as the row allows (issue #186):
    // the input is pinned to h-11, the same height as the log/repeat buttons
    // beside it, so the row doesn't grow; text-xl is the largest size where a
    // five-character weight ("315.5") still fits the ~70px column on an
    // iPhone 16.
    input:
      "h-11 w-full min-w-0 rounded-md border bg-white px-1 text-center text-xl tabular-nums text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50",
    // Kept apart from `input` so a box PRP prefilled can swap in its call's
    // dashed outline (issue #712) without two border colors fighting.
    inputBorder: "border-zinc-300 dark:border-zinc-700",
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

export type SessionSetTableSizes = Pick<
  ReturnType<typeof sessionSetTableSizes>,
  "headerRow" | "headerCell" | "prevCell" | "indexCell" | "cell" | "actionCell"
>;
