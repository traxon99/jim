/**
 * Reloads the page once after a new service worker takes control (an app
 * update), but not while the user is looking at it (#507): an immediate
 * reload could land mid-set and wipe a weight or note being typed. The
 * reload waits for the next `visibilitychange`, which is the user leaving
 * the app or, if iOS froze it before the reload ran, coming back to it.
 *
 * Returns a cleanup that removes every listener.
 */
export function reloadOnUpdateWhenAway(
  container: Pick<ServiceWorkerContainer, "addEventListener" | "removeEventListener">,
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
  reload: () => void,
): () => void {
  let pending = false;
  let reloaded = false;

  const reloadIfPending = () => {
    if (!pending || reloaded) return;
    reloaded = true;
    reload();
  };
  const onControllerChange = () => {
    pending = true;
    if (doc.visibilityState === "hidden") reloadIfPending();
  };

  container.addEventListener("controllerchange", onControllerChange);
  doc.addEventListener("visibilitychange", reloadIfPending);
  return () => {
    container.removeEventListener("controllerchange", onControllerChange);
    doc.removeEventListener("visibilitychange", reloadIfPending);
  };
}

/** At most one update check per this long when the app comes back to the foreground. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Asks the browser to look for a new service worker whenever the app comes
 * back to the foreground, at most once per `UPDATE_CHECK_INTERVAL_MS` (#671).
 * A suspended PWA is never reloaded, so without this someone with
 * notifications off (no release push) kept the old build until iOS killed
 * the app. `reloadOnUpdateWhenAway` then applies the update safely.
 *
 * Returns a cleanup that removes the listener.
 */
export function checkForUpdateOnReturn(
  registration: Pick<ServiceWorkerRegistration, "update">,
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
  now: () => number = Date.now,
): () => void {
  let lastCheck = now();
  const onVisibilityChange = () => {
    if (doc.visibilityState !== "visible") return;
    if (now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = now();
    registration.update().catch(() => {});
  };
  doc.addEventListener("visibilitychange", onVisibilityChange);
  return () => doc.removeEventListener("visibilitychange", onVisibilityChange);
}

/** The path a notification tap asks the running app to open, or null (#667). */
export function navigateMessagePath(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, path } = data as Record<string, unknown>;
  if (type !== "jim-navigate" || typeof path !== "string") return null;
  // Only a path on this origin, never "//host" or a full URL.
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}
