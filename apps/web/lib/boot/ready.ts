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

/**
 * Holds boot open until `promise` settles (resolved or rejected), or until
 * `capMs` passes — for network work like the first sync, where a hung request
 * on bad reception shouldn't keep the splash up for the full backstop.
 */
export function trackBootPromise(promise: Promise<unknown>, capMs: number): void {
  const done = registerBootTask();
  const cap = setTimeout(done, capMs);
  void promise.then(
    () => {
      clearTimeout(cap);
      done();
    },
    () => {
      clearTimeout(cap);
      done();
    },
  );
}
