"use client";

import {
  fetchFriendWorkouts,
  fetchFriends,
  friendRequestMessage,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from "@/lib/friends/client";
import { describeExercise, workoutMinutes } from "@/lib/friends/format";
import type { FriendEntry, FriendWorkout } from "@/lib/friends/types";
import { normalizeUsername } from "@jim/core";
import { Check, UserPlus, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";

type Load =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; username: string | null; friends: FriendEntry[]; workouts: FriendWorkout[] };

const SECTION_HEADING =
  "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

/**
 * Friends on the Home tab (issue #35): add someone by their exact username,
 * answer requests, and follow friends' finished workouts. Server data, not
 * IndexedDB — it refreshes whenever the app comes back to the foreground.
 */
export function FriendsPanel() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [friends, workouts] = await Promise.all([fetchFriends(), fetchFriendWorkouts()]);
    if (!friends.ok) {
      setLoad((current) =>
        current.status === "ready" ? current : { status: "error", error: friends.error },
      );
      return;
    }
    setLoad({
      status: "ready",
      username: friends.value.username,
      friends: friends.value.friends,
      workouts: workouts.ok ? workouts.value : [],
    });
  }, []);

  useEffect(() => {
    void refresh();
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  async function act(userId: string, run: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyUserId(userId);
    setActionError(null);
    const result = await run();
    if (!result.ok) setActionError(result.error ?? "Something went wrong");
    await refresh();
    setBusyUserId(null);
  }

  if (load.status === "loading") {
    return <p className="px-4 py-10 text-sm text-zinc-500 dark:text-zinc-500">Loading friends…</p>;
  }
  if (load.status === "error") {
    return (
      <section className="flex w-full flex-col items-center gap-3 px-4 py-10">
        <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">{load.error}</p>
        <button
          type="button"
          onClick={() => {
            setLoad({ status: "loading" });
            void refresh();
          }}
          className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Try again
        </button>
      </section>
    );
  }

  const incoming = load.friends.filter((f) => f.direction === "incoming");
  const outgoing = load.friends.filter((f) => f.direction === "outgoing");
  const accepted = load.friends.filter((f) => f.status === "accepted");

  return (
    <div className="route-fade flex w-full flex-col gap-6 px-4 py-4 text-left">
      {load.username && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Friends can add you as{" "}
          <span className="allow-pwa-select font-medium text-zinc-950 dark:text-zinc-50">
            @{load.username}
          </span>
          .{" "}
          <Link href="/profile" data-ripple className="underline underline-offset-2">
            Change
          </Link>
        </p>
      )}

      <AddFriendForm onSent={refresh} />

      {actionError && (
        <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{actionError}</p>
      )}

      {incoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={SECTION_HEADING}>Friend requests</h2>
          {incoming.map((friend) => (
            <PersonRow key={friend.userId} username={friend.username}>
              <button
                type="button"
                aria-label={`Accept @${friend.username}`}
                disabled={busyUserId === friend.userId}
                onClick={() =>
                  void act(friend.userId, () => respondToFriendRequest(friend.userId, true))
                }
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground disabled:opacity-50"
              >
                <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Decline @${friend.username}`}
                disabled={busyUserId === friend.userId}
                onClick={() =>
                  void act(friend.userId, () => respondToFriendRequest(friend.userId, false))
                }
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-300 disabled:opacity-50 dark:border-zinc-700"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </PersonRow>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_HEADING}>Friends&apos; workouts</h2>
        {load.workouts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <UsersRound
              className="h-8 w-8 text-zinc-400 dark:text-zinc-600"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {accepted.length === 0
                ? "Add a friend by their username to see their workouts here."
                : "Your friends' finished workouts will show up here."}
            </p>
          </div>
        ) : (
          load.workouts.map((workout) => <WorkoutCard key={workout.sessionId} workout={workout} />)
        )}
      </section>

      {(accepted.length > 0 || outgoing.length > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className={SECTION_HEADING}>Friends</h2>
          {accepted.map((friend) => (
            <PersonRow key={friend.userId} username={friend.username}>
              <button
                type="button"
                disabled={busyUserId === friend.userId}
                onClick={() => {
                  if (!window.confirm(`Remove @${friend.username} from your friends?`)) return;
                  void act(friend.userId, () => removeFriend(friend.userId));
                }}
                className="min-h-11 rounded-lg px-3 text-sm text-zinc-500 disabled:opacity-50 dark:text-zinc-500"
              >
                Remove
              </button>
            </PersonRow>
          ))}
          {outgoing.map((friend) => (
            <PersonRow key={friend.userId} username={friend.username} note="Request sent">
              <button
                type="button"
                disabled={busyUserId === friend.userId}
                onClick={() => void act(friend.userId, () => removeFriend(friend.userId))}
                className="min-h-11 rounded-lg px-3 text-sm text-zinc-500 disabled:opacity-50 dark:text-zinc-500"
              >
                Cancel
              </button>
            </PersonRow>
          ))}
        </section>
      )}
    </div>
  );
}

function AddFriendForm({ onSent }: { onSent: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const username = normalizeUsername(value);
    if (username === "") return;
    setSending(true);
    setMessage(null);
    const result = await sendFriendRequest(username);
    if (result.ok) {
      const sent = result.value === "sent" || result.value === "accepted";
      setMessage({ text: friendRequestMessage(result.value, username), error: !sent });
      if (sent) {
        setValue("");
        await onSent();
      }
    } else {
      setMessage({ text: result.error, error: true });
    }
    setSending(false);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-2">
      <label htmlFor="add-friend" className={SECTION_HEADING}>
        Add a friend
      </label>
      <div className="flex gap-2">
        <input
          id="add-friend"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setMessage(null);
          }}
          placeholder="Exact username"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="send"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          aria-label="Send friend request"
          disabled={sending || normalizeUsername(value) === ""}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {message && (
        <p
          className={`allow-pwa-select text-xs ${
            message.error
              ? "text-red-600 dark:text-red-500"
              : "text-emerald-600 dark:text-emerald-500"
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

function PersonRow({
  username,
  note,
  children,
}: {
  username: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 py-1 pl-3 pr-1 dark:border-zinc-800">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="allow-pwa-select truncate text-sm font-medium">@{username}</span>
        {note && <span className="text-xs text-zinc-500 dark:text-zinc-500">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function WorkoutCard({ workout }: { workout: FriendWorkout }) {
  const date = new Date(workout.startedAt).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const minutes = workoutMinutes(workout);

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <header className="flex items-baseline justify-between gap-2">
        <span className="allow-pwa-select min-w-0 truncate text-sm font-semibold">
          @{workout.username}
        </span>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
          {date}
          {minutes > 0 && ` · ${minutes} min`}
        </span>
      </header>
      {workout.name && (
        <p className="allow-pwa-select text-sm text-zinc-700 dark:text-zinc-300">{workout.name}</p>
      )}
      {workout.exercises.length > 0 && (
        <ul className="flex flex-col gap-1">
          {workout.exercises.map((exercise, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: an exercise can repeat within a workout
              key={index}
              className="allow-pwa-select flex flex-col text-xs text-zinc-600 dark:text-zinc-400"
            >
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{exercise.name}</span>
              <span>{describeExercise(exercise, workout.units)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
