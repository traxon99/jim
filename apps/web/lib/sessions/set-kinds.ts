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
