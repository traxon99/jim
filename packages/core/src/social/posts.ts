/**
 * Posts (issue #316): something a user chooses to share with their friends —
 * a finished workout, a personal record or an earned achievement — with an
 * optional caption. Stored as these keys (the `post_kind` Postgres enum).
 */
export const POST_KINDS = ["workout", "record", "achievement"] as const;

export type PostKind = (typeof POST_KINDS)[number];

export const POST_TITLE_MAX_LENGTH = 80;
export const POST_DETAIL_MAX_LENGTH = 200;
export const POST_CAPTION_MAX_LENGTH = 280;

export function isPostKind(value: unknown): value is PostKind {
  return typeof value === "string" && (POST_KINDS as readonly string[]).includes(value);
}

/** What a new post is made of, before the server gives it an id. */
export interface PostDraft {
  kind: PostKind;
  /** The finished workout a "workout" post shares; null for the other kinds. */
  sessionId: string | null;
  title: string;
  detail: string | null;
  caption: string | null;
}

/** Trims every text field, and turns an empty detail or caption into null. */
export function normalizePostDraft(draft: PostDraft): PostDraft {
  const detail = draft.detail?.trim() ?? "";
  const caption = draft.caption?.trim() ?? "";
  return {
    kind: draft.kind,
    sessionId: draft.sessionId,
    title: draft.title.trim(),
    detail: detail === "" ? null : detail,
    caption: caption === "" ? null : caption,
  };
}

/** Why `draft` (already normalized) can't be posted, or null when it can. */
export function postDraftError(draft: PostDraft): string | null {
  if (draft.title === "") return "A post needs a title";
  if (draft.title.length > POST_TITLE_MAX_LENGTH) {
    return `Keep the title under ${POST_TITLE_MAX_LENGTH} characters`;
  }
  if ((draft.detail?.length ?? 0) > POST_DETAIL_MAX_LENGTH) {
    return `Keep the details under ${POST_DETAIL_MAX_LENGTH} characters`;
  }
  if ((draft.caption?.length ?? 0) > POST_CAPTION_MAX_LENGTH) {
    return `Keep the caption under ${POST_CAPTION_MAX_LENGTH} characters`;
  }
  if (draft.kind === "workout" && draft.sessionId === null) return "Pick a workout to share";
  if (draft.kind !== "workout" && draft.sessionId !== null) return "Only workouts link a session";
  return null;
}
