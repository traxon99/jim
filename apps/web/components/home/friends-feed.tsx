"use client";

import { fetchFriendWorkouts, fetchReceivedReactions, toggleReaction } from "@/lib/friends/client";
import {
  describeExercise,
  reactionButtons,
  withReaction,
  workoutMinutes,
} from "@/lib/friends/format";
import type { FriendWorkout, ReceivedReaction, WorkoutReaction } from "@/lib/friends/types";
import { REACTION_EMOJI, REACTION_LABELS, type ReactionKind } from "@jim/core";
import { UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Load =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; workouts: FriendWorkout[]; received: ReceivedReaction[] };

const SECTION_HEADING =
  "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

/** How many of the latest reactions to your own workouts Home lists. */
const RECEIVED_SHOWN = 5;

/**
 * The social half of Home (issue #35), below your own summary: friends'
 * finished workouts to react to (issue #303), and who reacted to yours.
 * Finding and managing friends lives on the Friends page. Server data, not
 * IndexedDB — it refreshes whenever the app comes back to the foreground.
 */
export function FriendsFeed({ hasFriends }: { hasFriends: boolean }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [workouts, received] = await Promise.all([
      fetchFriendWorkouts(),
      fetchReceivedReactions(),
    ]);
    if (!workouts.ok) {
      setLoad((current) =>
        current.status === "ready" ? current : { status: "error", error: workouts.error },
      );
      return;
    }
    setLoad({
      status: "ready",
      workouts: workouts.value,
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
    return <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>;
  }
  if (load.status === "error") {
    return (
      <section className="flex w-full flex-col items-center gap-3 py-6">
        <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">{load.error}</p>
        <button
          type="button"
          onClick={() => {
            setLoad({ status: "loading" });
            void refresh();
          }}
          className="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950"
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="route-fade flex flex-col gap-5">
      {actionError && (
        <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{actionError}</p>
      )}

      {load.received.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={SECTION_HEADING}>Reactions to your workouts</h2>
          <ul className="flex flex-col gap-2 rounded-lg bg-white p-3 dark:bg-zinc-950">
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
        <h2 className="text-2xl font-semibold tracking-tight">Friends&apos; workouts</h2>
        {load.workouts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-4 py-6 text-center dark:bg-zinc-950">
            <UsersRound
              className="h-8 w-8 text-zinc-400 dark:text-zinc-600"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {hasFriends
                ? "Your friends' finished workouts will show up here."
                : "Add a friend to see their workouts here."}
            </p>
            {!hasFriends && (
              <Link
                href="/friends"
                data-ripple
                className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground"
              >
                <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Find friends
              </Link>
            )}
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
    <article className="flex flex-col gap-2 rounded-lg bg-white p-3 dark:bg-zinc-950">
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-base font-semibold uppercase text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {workout.username.charAt(0)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="allow-pwa-select truncate text-base font-semibold">
            {workout.name ?? "Workout"}
          </span>
          <span className="allow-pwa-select truncate text-xs font-medium text-zinc-500 dark:text-zinc-500">
            @{workout.username} · {date}
            {minutes > 0 && ` · ${minutes} min`}
          </span>
        </div>
      </header>
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
