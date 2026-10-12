import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False while server-rendering and hydrating, true after. Dates in the
 * portal format in the browser's own time zone, which the server doesn't
 * know, so they render only once this is true.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
