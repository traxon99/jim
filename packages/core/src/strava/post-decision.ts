/**
 * Whether a finished workout goes to Strava (issue #836). `stravaPost` is the
 * session's own choice: null follows the Settings switch, false skips it,
 * true posts it even with auto-post off.
 */
export function shouldPostToStrava(input: {
  autoPost: boolean;
  stravaPost: boolean | null | undefined;
}): boolean {
  if (input.stravaPost === true) return true;
  if (input.stravaPost === false) return false;
  return input.autoPost;
}

/** Strava's post state for a workout, as the phone shows it. */
export type StravaPostStatus = "queued" | "posting" | "posted" | "failed";

export interface StravaPostInfo {
  status: StravaPostStatus;
  /** Strava's id for the activity once posted. */
  activityId: string | null;
}

/** The activity's page on Strava. */
export function stravaActivityUrl(activityId: string): string {
  return `https://www.strava.com/activities/${encodeURIComponent(activityId)}`;
}
