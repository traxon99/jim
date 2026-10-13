/** The parts of a Supabase AuthError this reads. */
export interface AuthErrorLike {
  code?: string;
  message: string;
}

export const PASSWORD_HINT = "At least 6 characters.";

/** Messages for the Supabase Auth error codes these forms can hit (issue #542). */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed: "Confirm your email first. Check your inbox for the link.",
  user_already_exists: "An account with this email already exists. Sign in instead.",
  email_exists: "An account with this email already exists. Sign in instead.",
  weak_password: `That password is too weak. ${PASSWORD_HINT}`,
  same_password: "Choose a password different from your current one.",
  over_email_send_rate_limit: "Too many emails sent. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  session_not_found: "This reset link has expired. Request a new one.",
  session_expired: "This reset link has expired. Request a new one.",
  email_address_invalid: "Enter a valid email address.",
};

/** Whether an error means the reset link's session is gone, so a new link is the fix. */
export function isExpiredSessionError(error: AuthErrorLike): boolean {
  return (
    error.code === "session_not_found" ||
    error.code === "session_expired" ||
    /auth session missing/i.test(error.message)
  );
}

/**
 * Plain copy for an auth error instead of Supabase's raw message ("Auth
 * session missing!"). Unknown errors get a generic line rather than text
 * written for developers.
 */
export function authErrorMessage(error: AuthErrorLike): string {
  if (isExpiredSessionError(error)) return MESSAGES.session_not_found as string;
  return (
    (error.code ? MESSAGES[error.code] : undefined) ??
    "Something went wrong. Try again in a moment."
  );
}
