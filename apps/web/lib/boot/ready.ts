type Listener = () => void;

let pending = 0;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Registers one unit of boot work (e.g. warming a route's cache). Call the
 * returned function once it settles — safe to call more than once, only the
 * first call counts.
 */
export function registerBootTask(): () => void {
  pending += 1;
  notify();

  let settled = false;
  return () => {
    if (settled) return;
    settled = true;
    pending -= 1;
    notify();
  };
}

export function isBootReady(): boolean {
  return pending === 0;
}

/** For `useSyncExternalStore` in components. */
export function subscribeBootReady(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
