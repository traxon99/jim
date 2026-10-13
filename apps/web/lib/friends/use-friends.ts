"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { fetchFriends } from "./client";
import type { FriendsPayload } from "./types";

export type FriendsLoad =
  | { status: "loading" }
  | { status: "error"; error: string }
  | ({ status: "ready" } & FriendsPayload);

const LOADING: FriendsLoad = { status: "loading" };

// One copy for every screen (#524): Home and Friends both stay mounted under
// TabbedShell, so separate copies left Home's request badge and feed stale
// after accepting a request on Friends.
let shared: FriendsLoad = LOADING;
const listeners = new Set<() => void>();

function setShared(next: FriendsLoad) {
  shared = next;
  for (const listener of listeners) listener();
}

export function subscribeFriends(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Nothing on screen uses it (e.g. after signing out), so the next
    // account doesn't start from this one's friends.
    if (listeners.size === 0) shared = LOADING;
  };
}

export function getFriendsLoad(): FriendsLoad {
  return shared;
}

/** Fetches the friend list into the shared copy; a failed refresh keeps what was already shown. */
export async function refreshFriends(): Promise<void> {
  const result = await fetchFriends();
  if (result.ok) {
    setShared({ status: "ready", ...result.value });
  } else if (shared.status !== "ready") {
    setShared({ status: "error", error: result.error });
  }
}

/**
 * The signed-in user's username and friend list, shared by every screen
 * that shows it. Server data, not IndexedDB, so it refreshes whenever the
 * app comes back to the foreground; a refresh from any screen updates all.
 */
export function useFriends(): { load: FriendsLoad; refresh: () => Promise<void> } {
  const load = useSyncExternalStore(subscribeFriends, getFriendsLoad, () => LOADING);
  const refresh = useCallback(() => refreshFriends(), []);

  useEffect(() => {
    void refreshFriends();
    function onVisible() {
      if (document.visibilityState === "visible") void refreshFriends();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return { load, refresh };
}
