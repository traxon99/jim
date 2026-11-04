"use client";

import { Avatar } from "@/components/friends/avatar";
import {
  dismissFriendSuggestion,
  fetchFriendSuggestions,
  friendRequestMessage,
  sendFriendRequest,
} from "@/lib/friends/client";
import type { FriendSuggestion } from "@/lib/friends/types";
import { refreshFriends } from "@/lib/friends/use-friends";
import { UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const SECTION_HEADING =
  "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

/**
 * People you may know on the Friends page (#754, #764): same row layout as friend lists.
 */
export function FriendsSuggestionsSection() {
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await fetchFriendSuggestions();
    if (result.ok) setSuggestions(result.value);
  }, []);

  useEffect(() => {
    void refresh();
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  async function dismiss(userId: string) {
    setSuggestions((current) => current.filter((s) => s.userId !== userId));
    const result = await dismissFriendSuggestion(userId);
    if (!result.ok) {
      setError(result.error);
      void refresh();
    }
  }

  async function add(username: string, userId: string) {
    setBusyId(userId);
    setError(null);
    setMessage(null);
    const result = await sendFriendRequest(username);
    if (result.ok) {
      setMessage(friendRequestMessage(result.value, username));
      setSuggestions((current) => current.filter((s) => s.userId !== userId));
      await refreshFriends();
    } else {
      setError(result.error);
    }
    setBusyId(null);
  }

  if (suggestions.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="friends-people-you-may-know">
      <h2 id="friends-people-you-may-know" className={SECTION_HEADING}>
        People you may know
      </h2>
      {(message || error) && (
        <p
          className={`allow-pwa-select text-xs ${error ? "text-red-600 dark:text-red-500" : "text-zinc-600 dark:text-zinc-400"}`}
        >
          {error ?? message}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {suggestions.map((person) => (
          <li key={person.userId}>
            <FriendSuggestionRow
              person={person}
              busy={busyId === person.userId}
              onAdd={() => void add(person.username, person.userId)}
              onDismiss={() => void dismiss(person.userId)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shared row for Friends suggestions and username search hits (#764). */
export function FriendSuggestionRow({
  person,
  busy,
  onAdd,
  onDismiss,
}: {
  person: Pick<FriendSuggestion, "username" | "avatar" | "reason">;
  busy?: boolean;
  onAdd: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 py-1 pl-2 pr-1 dark:border-zinc-800">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar username={person.username} avatar={person.avatar} className="h-9 w-9 text-sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="allow-pwa-select truncate text-sm font-medium">@{person.username}</span>
          {person.reason && (
            <span className="allow-pwa-select truncate text-xs text-zinc-500 dark:text-zinc-500">
              {person.reason}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onAdd}
        aria-label={`Add @${person.username}`}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground disabled:opacity-50"
      >
        <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      {onDismiss && (
        <button
          type="button"
          aria-label={`Dismiss @${person.username}`}
          onClick={onDismiss}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-500"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
