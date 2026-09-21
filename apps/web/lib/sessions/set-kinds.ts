/** Mirrors `set_kind` in packages/db's schema. */
export const SET_KINDS = ["warmup", "working", "drop", "failure"] as const;
export type SetKind = (typeof SET_KINDS)[number];
