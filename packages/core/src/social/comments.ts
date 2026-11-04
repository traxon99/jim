import type { DprCall } from "../dpr/decide";

/**
 * Comments on a friend's workout or post (issue #749). Stored in the
 * `comments` table and only read and written through migration 0062's
 * SECURITY DEFINER functions, like posts and reactions (ADR-017).
 */
export const COMMENT_MAX_LENGTH = 500;

/** Trims a comment; null when nothing's left. */
export function normalizeComment(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** Why `text` (already normalized) can't be posted, or null when it can. */
export function commentError(text: string | null): string | null {
  if (text === null) return "Write something first";
  if (text.length > COMMENT_MAX_LENGTH) {
    return `Keep comments under ${COMMENT_MAX_LENGTH} characters`;
  }
  return null;
}

/** A piece of a comment as it's shown: plain text, an @mention or a PRP word mark. */
export type CommentSegment =
  | { type: "text"; text: string }
  | { type: "mention"; username: string }
  | { type: "call"; call: DprCall };

/** The PRP calls a comment can name as their word mark plus arrow, e.g. "UP ↑". */
const CALL_WORDS: Record<string, DprCall> = {
  "UP ↑": "increase",
  "STAY →": "hold",
  "DOWN ↓": "deload",
  "EASE ↘": "reenter",
  "LIGHT ↓": "light",
};

// Usernames are lowercase letters, digits, dots, dashes and underscores (the
// USERNAME_PATTERN in username.ts); a mention is one preceded by a start or a space.
const PATTERN = /(^|\s)@([a-z0-9._-]*[a-z0-9_-])|(UP ↑|STAY →|DOWN ↓|EASE ↘|LIGHT ↓)/g;

/**
 * Splits a comment into text, @mentions of `friends` (an @ of anyone else
 * stays text) and PRP word marks typed as "UP ↑", for the comments sheet.
 */
export function commentSegments(text: string, friends: ReadonlySet<string>): CommentSegment[] {
  const segments: CommentSegment[] = [];
  let plain = "";
  let last = 0;
  for (const match of text.matchAll(PATTERN)) {
    const index = match.index ?? 0;
    const [whole, lead = "", username, word] = match;
    if (username !== undefined && !friends.has(username)) continue;
    plain += text.slice(last, index) + lead;
    if (plain) segments.push({ type: "text", text: plain });
    plain = "";
    if (username !== undefined) segments.push({ type: "mention", username });
    else if (word !== undefined) {
      const call = CALL_WORDS[word];
      if (call) segments.push({ type: "call", call });
    }
    last = index + whole.length;
  }
  plain += text.slice(last);
  if (plain) segments.push({ type: "text", text: plain });
  return segments;
}
