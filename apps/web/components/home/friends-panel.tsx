"use client";

import {
  fetchFriendWorkouts,
  fetchFriends,
  fetchReceivedReactions,
  friendRequestMessage,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  toggleReaction,
} from "@/lib/friends/client";
import {
  describeExercise,
  reactionButtons,
  withReaction,
  workoutMinutes,
} from "@/lib/friends/format";
import type {
  FriendEntry,
  FriendWorkout,
  ReceivedReaction,
  WorkoutReaction,
} from "@/lib/friends/types";
import { REACTION_EMOJI, REACTION_LABELS, type ReactionKind, normalizeUsername } from "@jim/core";
import { Check, UserPlus, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";

type Load =
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ready";
      username: string | null;
      friends: FriendEntry[];
      workouts: FriendWorkout[];
      received: ReceivedReaction[];
    };

const SECTION_HEADING =
  "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

/** How many of the latest reactions to your own workouts Home lists. */
const RECEIVED_SHOWN = 5;

/**
 * Friends on the Home tab (issue #35): add someone by their exact username,
 * answer requests, follow friends' finished workouts and react to them
 * (issue #303), and see who reacted to yours. Server data, not
 * IndexedDB — it refreshes whenever the app comes back to the foreground.
 */
export function FriendsPanel() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [friends, workouts, received] = await Promise.all([
      fetchFriends(),
      fetchFriendWorkouts(),
      fetchReceivedReactions(),
    ]);
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
      received: received.ok ? received.value : [],
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

  function setReactions(sessionId: string, update: (r: WorkoutReaction[]) => WorkoutReaction[]) {
    setLoad((current) =>
      current.status === "ready"
        ? {
            ...current,
            workouts: current.workouts.map((w) =>
              w.sessionId === sessionId ? { ...w, reactions: update(w.reactions) } : w,
            ),
          }
        : current,
    );
  }

  // Shown straight away, then reconciled with what the server says happened.
  async function react(workout: FriendWorkout, kind: ReactionKind) {
    const wasMine = workout.reactions.some((r) => r.kind === kind && r.mine);
    setActionError(null);
    setReactions(workout.sessionId, (reactions) => withReaction(reactions, kind, !wasMine));
    const result = await toggleReaction(workout.sessionId, kind);
    if (result.ok) {
      setReactions(workout.sessionId, (reactions) => withReaction(reactions, kind, result.value));
    } else {
      setReactions(workout.sessionId, (reactions) => withReaction(reactions, kind, wasMine));
      setActionError(result.error);
    }
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

      {load.received.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={SECTION_HEADING}>Reactions to your workouts</h2>
          <ul className="flex flex-col gap-1">
            {load.received.slice(0, RECEIVED_SHOWN).map((reaction) => (
              <ReceivedReactionRow
                key={`${reaction.sessionId}:${reaction.userId}:${reaction.kind}`}
                reaction={reaction}
              />
            ))}
          </ul>
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
          load.workouts.map((workout) => (
            <WorkoutCard
              key={workout.sessionId}
              workout={workout}
              onReact={(kind) => void react(workout, kind)}
            />
          ))
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

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function ReceivedReactionRow({ reaction }: { reaction: ReceivedReaction }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="text-lg leading-none" aria-hidden="true">
        {REACTION_EMOJI[reaction.kind]}
      </span>
      <span className="allow-pwa-select min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">
        <span className="font-medium text-zinc-950 dark:text-zinc-50">@{reaction.username}</span>
        <span className="sr-only"> reacted {REACTION_LABELS[reaction.kind]}</span> to{" "}
        {reaction.sessionName ?? "your workout"}
      </span>
      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
        {shortDate(reaction.startedAt)}
      </span>
    </li>
  );
}

function WorkoutCard({
  workout,
  onReact,
}: {
  workout: FriendWorkout;
  onReact: (kind: ReactionKind) => void;
}) {
  const date = shortDate(workout.startedAt);
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
      <div className="flex gap-2">
        {reactionButtons(workout.reactions).map((reaction) => (
          <button
            key={reaction.kind}
            type="button"
            aria-pressed={reaction.mine}
            aria-label={`${REACTION_LABELS[reaction.kind]}${
              reaction.count > 0 ? `, ${reaction.count}` : ""
            }`}
            onClick={() => onReact(reaction.kind)}
            className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-3 text-sm ${
              reaction.mine
                ? "border-accent text-accent"
                : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
            }`}
          >
            <span className="text-base leading-none" aria-hidden="true">
              {REACTION_EMOJI[reaction.kind]}
            </span>
            {reaction.count > 0 && <span className="tabular-nums">{reaction.count}</span>}
          </button>
        ))}
      </div>
    </article>
  );
}
