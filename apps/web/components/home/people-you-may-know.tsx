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
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * Horizontal People you may know cards in Home's feed (#754).
 */
export function PeopleYouMayKnowRow({ compact = false }: { compact?: boolean }) {
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
    <section className="flex flex-col gap-2" aria-labelledby="people-you-may-know">
      <div className="flex items-baseline justify-between gap-3 px-4">
        <h2 id="people-you-may-know" className="text-base font-semibold tracking-tight">
          People you may know
        </h2>
        {!compact && (
          <Link
            href="/friends"
            className="shrink-0 text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            See all
          </Link>
        )}
      </div>
      {(message || error) && (
        <p
          className={`allow-pwa-select px-4 text-xs ${error ? "text-red-600 dark:text-red-500" : "text-zinc-600 dark:text-zinc-400"}`}
        >
          {error ?? message}
        </p>
      )}
      <ul
        className={`flex w-full min-w-0 gap-3 ${compact ? "px-4" : "snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}`}
      >
        {suggestions.map((person) => (
          <li
            key={person.userId}
            className={`relative flex shrink-0 snap-start flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 ${
              compact ? "w-full max-w-none flex-row justify-between" : "w-[148px]"
            }`}
          >
            <button
              type="button"
              aria-label={`Dismiss @${person.username}`}
              onClick={() => void dismiss(person.userId)}
              className="absolute! top-2 right-2 flex min-h-8 min-w-8 items-center justify-center rounded-full text-zinc-500"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <Avatar
              username={person.username}
              avatar={person.avatar}
              className="h-14 w-14 text-lg"
            />
            <div
              className={`flex min-w-0 flex-col items-center gap-1 ${compact ? "flex-1 items-start" : ""}`}
            >
              <span className="allow-pwa-select truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {person.username}
              </span>
              <span className="allow-pwa-select line-clamp-2 text-center text-xs text-zinc-500 dark:text-zinc-500">
                {person.reason}
              </span>
            </div>
            <button
              type="button"
              disabled={busyId === person.userId}
              onClick={() => void add(person.username, person.userId)}
              data-ripple
              className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full bg-zinc-950 px-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950"
            >
              <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Add
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
