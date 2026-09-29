"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFriends } from "./client";
import type { FriendsPayload } from "./types";

export type FriendsLoad =
  | { status: "loading" }
  | { status: "error"; error: string }
  | ({ status: "ready" } & FriendsPayload);

/**
 * The signed-in user's username and friend list. Server data, not IndexedDB,
 * so it refreshes whenever the app comes back to the foreground; a failed
 * refresh keeps what was already shown.
 */
export function useFriends(): { load: FriendsLoad; refresh: () => Promise<void> } {
  const [load, setLoad] = useState<FriendsLoad>({ status: "loading" });

  const refresh = useCallback(async () => {
    const result = await fetchFriends();
    if (result.ok) {
      setLoad({ status: "ready", ...result.value });
    } else {
      setLoad((current) =>
        current.status === "ready" ? current : { status: "error", error: result.error },
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return { load, refresh };
}
