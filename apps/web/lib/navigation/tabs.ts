/**
 * The bottom tab bar's five tab home screens, in bar order. Each one stays
 * mounted by TabbedShell across tab switches.
 */
export const BASE_TABS = ["/workout", "/routines", "/history", "/exercises", "/home"] as const;

export type BaseTab = (typeof BASE_TABS)[number];

/**
 * Screens that aren't tabs themselves but are reached from one, so that
 * tab stays highlighted while they're open. Profile (and its settings)
 * and Friends live behind the buttons in Home's header.
 */
const NESTED_UNDER: Partial<Record<BaseTab, readonly string[]>> = {
  "/home": ["/profile", "/progression", "/friends"],
};

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Whether `tab` should render as the active tab for `pathname`. */
export function isTabActive(tab: BaseTab, pathname: string): boolean {
  if (matchesPrefix(pathname, tab)) return true;
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
