export type SyncStatus =
  | { kind: "synced" }
  | { kind: "pending"; count: number }
  | { kind: "error"; count: number };

type Listener = () => void;

let status: SyncStatus = { kind: "synced" };
const listeners = new Set<Listener>();

export function getSyncStatus(): SyncStatus {
  return status;
}

export function setSyncStatus(next: SyncStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore` in React components. */
export function subscribeSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
