/**
 * Selectable set types (issue #161: drop sets are gone as an option — the
 * distinction rarely got used and "drop" is easy to confuse with "delete").
 * `packages/db`'s `set_kind` enum still carries a "drop" value for any set
 * logged before this change; `setKindLabel` covers displaying that without
 * offering it here.
 */
export const SET_KINDS = ["warmup", "working", "failure"] as const;
export type SetKind = (typeof SET_KINDS)[number];

const SET_KIND_LABELS: Record<string, string> = {
  warmup: "Warmup",
  working: "Working",
  failure: "Failure",
  drop: "Drop",
};

export function setKindLabel(kind: string): string {
  return SET_KIND_LABELS[kind] ?? kind;
}

/** What a warm-up set shows in place of a set number (issue #220). */
export const WARMUP_SET_LABEL = "W";

/**
 * The label each set shows in its Set column, in display order (issue #220):
 * warm-ups are marked "W" and don't take a number, so working set 1 is the
 * first set after the warm-ups rather than, say, set 3.
 */
export function setNumberLabels(kinds: readonly string[]): string[] {
  let number = 0;
  return kinds.map((kind) => {
    if (kind === "warmup") return WARMUP_SET_LABEL;
    number += 1;
    return String(number);
  });
}
