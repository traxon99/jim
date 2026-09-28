/**
 * Usernames (issue #35) are how friends find each other: an exact,
 * case-insensitive match, so a username is stored lowercased. A user who
 * never picks one gets the part of their email before the `@` — the same
 * rule migration 0023's `default_username()` applies in Postgres, so keep
 * the two in step.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

/** Lowercases, trims and drops a leading `@`, so "@Jane " finds "jane". */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

/**
 * Why `username` (already normalized) can't be chosen, or null when it can.
 * Only a name someone types is checked this strictly — an email-derived
 * default may be shorter than the minimum.
 */
export function usernameError(username: string): string | null {
  if (username.length < USERNAME_MIN_LENGTH) {
    return `Use at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Use at most ${USERNAME_MAX_LENGTH} characters`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Use only letters, numbers, dots, dashes and underscores";
  }
  return null;
}

/** The email-derived default, before any numeric suffix a clash adds. */
export function defaultUsernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, USERNAME_MAX_LENGTH - 6);
  return cleaned === "" ? "user" : cleaned;
}
