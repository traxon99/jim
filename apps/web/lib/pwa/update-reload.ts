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
