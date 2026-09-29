/**
 * Reactions a user can leave on a friend's finished workout (issue #303).
 * Stored as these keys (the `reaction_kind` Postgres enum), shown as the
 * emoji. Order here is the order the buttons appear in.
 */
export const REACTION_KINDS = ["strong", "fire", "clap", "party"] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  strong: "💪",
  fire: "🔥",
  clap: "👏",
  party: "🎉",
};

export const REACTION_LABELS: Record<ReactionKind, string> = {
  strong: "Strong",
  fire: "On fire",
  clap: "Applause",
  party: "Celebrate",
};

export function isReactionKind(value: unknown): value is ReactionKind {
  return typeof value === "string" && (REACTION_KINDS as readonly string[]).includes(value);
}
