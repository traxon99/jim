/**
 * The five screens TabbedShell keeps mounted across tab switches. Exercises
 * is one of them, but it lives under Plan rather than in the bar (#783).
 */
export const BASE_TABS = ["/workout", "/routines", "/history", "/exercises", "/home"] as const;

export type BaseTab = (typeof BASE_TABS)[number];

/**
 * The four tabs in the bottom bar, in order (#783): Lift, Plan, History and
 * Friends. Routes keep their old names so links and the PWA start URL work.
 */
export const BAR_TABS = ["/workout", "/routines", "/history", "/home"] as const;

export type BarTab = (typeof BAR_TABS)[number];

/**
 * Screens that aren't tabs themselves but are reached from one, so that
 * tab stays highlighted while they're open. Profile (and its settings)
 * and the friends list live behind the buttons in Friends' header, PRP
 * Progress behind Lift's, and Exercises is a segment of Plan (#783).
 */
const NESTED_UNDER: Partial<Record<BaseTab, readonly string[]>> = {
  "/workout": ["/progression"],
  "/routines": ["/exercises"],
  "/home": ["/profile", "/friends"],
};

/** Friend profile pages keep Home highlighted (issue #751). */
export function isFriendProfilePath(pathname: string): boolean {
  return /^\/friends\/[^/]+$/.test(pathname);
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Whether `tab` should render as the active tab for `pathname`. */
export function isTabActive(tab: BaseTab, pathname: string): boolean {
  if (matchesPrefix(pathname, tab)) return true;
  if (tab === "/home" && isFriendProfilePath(pathname)) return true;
  return (NESTED_UNDER[tab] ?? []).some((prefix) => matchesPrefix(pathname, prefix));
}

/**
 * Exercise detail is a floating card over the Exercises tab (issue #294), so
 * that tab stays visible underneath instead of a blank page.
 */
export function isExerciseCardPath(pathname: string): boolean {
  return /^\/exercises\/(?!new$)[^/]+$/.test(pathname);
}

/**
 * Which remembered scroll position a path uses in the shell's one scroller
 * (#666). Every page keeps its own, except the exercise card, which floats
 * over the Exercises list and must leave it where it was.
 */
export function scrollKey(pathname: string): string {
  return isExerciseCardPath(pathname) ? "/exercises" : pathname;
}
