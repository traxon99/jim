"use client";

import { Avatar } from "@/components/friends/avatar";
import { CommentsSheet } from "@/components/friends/comments-sheet";
import { POST_KIND_ICONS } from "@/components/friends/post-kind-icons";
import type { FeedItem } from "@/lib/friends/feed";
import { describeExercise, reactionButtons, workoutMinutes } from "@/lib/friends/format";
import {
  RECORD_TINT,
  formatVolume,
  muscleBarPercent,
  postTint,
  recordLines,
  splitRecordDetail,
  timeAgo,
  workoutHeaderLine,
} from "@/lib/friends/post-media";
import type {
  CommentSummary,
  CommentTarget,
  FeedComment,
  FriendPost,
  FriendWorkout,
  WorkoutReaction,
} from "@/lib/friends/types";
import { REACTION_EMOJI, REACTION_LABELS, type ReactionKind } from "@jim/core";
import { Activity, Dumbbell, MessageCircle, Trophy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { PostCarousel } from "./post-carousel";

export type OnReact = (sessionId: string, current: WorkoutReaction[], kind: ReactionKind) => void;

/** A thread's comments after the sheet loaded or changed them (issue #749). */
export type OnComments = (target: CommentTarget, comments: FeedComment[]) => void;

/**
 * One full-width post in Home's feed (issue #747): a header with who and
 * when, an edge-to-edge square tinted by the routine's color with swipeable
 * slides, the reactions, then the caption.
 */
export function FeedPost({
  item,
  onReact,
  onComments,
}: {
  item: FeedItem;
  onReact: OnReact;
  onComments: OnComments;
}) {
  if (item.type === "workout") {
    const { workout } = item;
    return (
      <PostFrame
        username={workout.username}
        avatar={workout.avatar}
        subtitle={workoutHeaderLine(workout)}
        media={
          <PostCarousel
            label={`@${workout.username}'s ${workout.name ?? "workout"}`}
            className={postTint(workout.routineColor)}
            slides={workoutSlides(workout)}
          />
        }
        reactions={workout.reactions}
        onReact={(kind) => onReact(workout.sessionId, workout.reactions, kind)}
        caption={item.post?.caption ?? null}
        commentTarget={{ sessionId: workout.sessionId }}
        comments={workout.comments}
        onComments={onComments}
      />
    );
  }

  const { post } = item;
  const sessionId = post.sessionId;
  return (
    <PostFrame
      username={post.username}
      avatar={post.avatar}
      subtitle={`${POST_KIND_LABELS[post.kind]} · ${timeAgo(post.createdAt)}`}
      media={
        <PostCarousel
          label={`@${post.username}'s ${POST_KIND_LABELS[post.kind].toLowerCase()}`}
          className={`bg-linear-to-br ${RECORD_TINT}`}
          slides={[<PostSlide key="post" post={post} />]}
        />
      }
      reactions={post.reactions}
      onReact={sessionId ? (kind) => onReact(sessionId, post.reactions, kind) : null}
      caption={post.caption}
      // A workout post's comments are its workout's (issue #749).
      commentTarget={sessionId ? { sessionId } : { postId: post.postId }}
      comments={post.comments}
      onComments={onComments}
    />
  );
}

const POST_KIND_LABELS: Record<FriendPost["kind"], string> = {
  workout: "Finished a workout",
  record: "New personal record",
  achievement: "Earned an achievement",
};

function PostFrame({
  username,
  avatar,
  subtitle,
  media,
  reactions,
  onReact,
  caption,
  commentTarget,
  comments,
  onComments,
}: {
  username: string;
  avatar: string | null;
  subtitle: string;
  media: ReactNode;
  reactions: WorkoutReaction[];
  onReact: ((kind: ReactionKind) => void) | null;
  caption: string | null;
  commentTarget: CommentTarget;
  comments: CommentSummary;
  onComments: OnComments;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  return (
    <article className="flex flex-col bg-white pb-4 dark:bg-zinc-950">
      <header className="flex items-center gap-3 px-4 py-3">
        <Avatar username={username} avatar={avatar} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="allow-pwa-select truncate text-base font-semibold">{username}</span>
          <span className="allow-pwa-select truncate text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </span>
        </div>
      </header>
      {media}
      <div className="flex flex-col gap-2 px-4 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {onReact && <ReactionButtons reactions={reactions} onReact={onReact} />}
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            aria-label={comments.count > 0 ? `Comments, ${comments.count}` : "Comment"}
            className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm text-zinc-700 dark:text-zinc-300"
          >
            <MessageCircle className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            {comments.count > 0 && <span className="tabular-nums">{comments.count}</span>}
          </button>
        </div>
        {caption && (
          <p className="allow-pwa-select whitespace-pre-line break-words text-sm text-zinc-800 dark:text-zinc-200">
            <span className="font-semibold text-zinc-950 dark:text-zinc-50">{username}</span>{" "}
            {caption}
          </p>
        )}
        {comments.count > 1 && (
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="self-start text-sm text-zinc-500 dark:text-zinc-400"
          >
            View all {comments.count} comments
          </button>
        )}
        {comments.latest && (
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="allow-pwa-select min-w-0 self-stretch truncate text-left text-sm text-zinc-800 dark:text-zinc-200"
          >
            <span className="font-semibold text-zinc-950 dark:text-zinc-50">
              {comments.latest.username}
            </span>{" "}
            {comments.latest.body}
          </button>
        )}
      </div>
      {commentsOpen && (
        <CommentsSheet
          target={commentTarget}
          ownerUsername={username}
          onClose={() => setCommentsOpen(false)}
          onChange={(list) => onComments(commentTarget, list)}
        />
      )}
    </article>
  );
}

function weekday(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
}

const SLIDE_LABEL =
  "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/85";

/** Summary first; the exercises second when the friend shares details. */
function workoutSlides(workout: FriendWorkout): ReactNode[] {
  const slides = [<SummarySlide key="summary" workout={workout} />];
  if (workout.exercises.length > 0) {
    slides.push(<ExercisesSlide key="exercises" workout={workout} />);
  }
  return slides;
}

function SummarySlide({ workout }: { workout: FriendWorkout }) {
  const minutes = workoutMinutes(workout);
  const sets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  const most = workout.muscles[0]?.sets ?? 0;
  const record = workout.records[0];
  const pr = record ? recordLines(record, workout.units) : null;
  return (
    <div className="allow-pwa-select flex h-full min-w-0 flex-col gap-3">
      <span className={SLIDE_LABEL}>
        <Dumbbell className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="truncate">
          {workout.name ?? "Workout"} · {weekday(workout.startedAt)}
        </span>
      </span>
      <div className="flex flex-col text-[2.75rem] leading-[1.05] font-extrabold tracking-tight">
        <span>{minutes} min</span>
        {workout.volume !== null && workout.volume > 0 && (
          <span className="truncate">
            {formatVolume(workout.volume)} {workout.units}
          </span>
        )}
      </div>
      {workout.exercises.length > 0 && (
        <dl className="flex gap-8">
          <Stat value={sets} label={sets === 1 ? "set" : "sets"} />
          <Stat
            value={workout.exercises.length}
            label={workout.exercises.length === 1 ? "exercise" : "exercises"}
          />
          <Stat
            value={workout.records.length}
            label={workout.records.length === 1 ? "PR" : "PRs"}
          />
        </dl>
      )}
      {workout.muscles.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {workout.muscles.map((muscle) => (
            <li key={muscle.muscle} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate capitalize">{muscle.muscle}</span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/25">
                <span
                  className="block h-full rounded-full bg-white/90"
                  style={{ width: `${muscleBarPercent(muscle.sets, most)}%` }}
                />
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums">
                {muscle.sets} {muscle.sets === 1 ? "set" : "sets"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pr && (
        <div className="mt-auto flex shrink-0 items-center gap-3 rounded-2xl border border-white/30 bg-white/15 p-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Trophy className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold">{pr.title}</span>
            <span className="truncate text-sm text-white/85">{pr.detail}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-sm text-white/85">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function ExercisesSlide({ workout }: { workout: FriendWorkout }) {
  return (
    <div className="allow-pwa-select flex h-full min-h-0 flex-col gap-3">
      <span className={SLIDE_LABEL}>
        <Activity className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        Exercises
      </span>
      {/* A long workout scrolls inside the square rather than growing it. */}
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
        {workout.exercises.map((exercise, index) => (
          <li
            key={`${exercise.name}:${index}`}
            className="flex min-w-0 shrink-0 flex-col rounded-2xl border border-white/25 bg-white/15 px-4 py-2.5"
          >
            <span className="truncate text-base font-bold">{exercise.name}</span>
            <span className="truncate text-sm text-white/85">
              {describeExercise(exercise, workout.units)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A shared record, achievement, or a workout the feed doesn't otherwise carry. */
function PostSlide({ post }: { post: FriendPost }) {
  const Icon = POST_KIND_ICONS[post.kind];
  const { label, amount } =
    post.kind === "record"
      ? splitRecordDetail(post.detail)
      : { label: post.detail ?? "", amount: null };
  return (
    <div className="allow-pwa-select flex h-full min-w-0 flex-col">
      <span className={SLIDE_LABEL}>
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        {POST_KIND_LABELS[post.kind]}
      </span>
      <div className="mt-auto flex min-w-0 flex-col gap-1">
        <span className="break-words text-xl font-semibold text-white/90">
          {post.title}
          {amount && label && ` · ${label}`}
        </span>
        {amount ? (
          <span className="break-words text-6xl leading-none font-extrabold tracking-tight">
            {amount}
          </span>
        ) : (
          label && <span className="break-words text-lg text-white/85">{label}</span>
        )}
      </div>
    </div>
  );
}

function ReactionButtons({
  reactions,
  onReact,
}: {
  reactions: WorkoutReaction[];
  onReact: (kind: ReactionKind) => void;
}) {
  return (
    <div className="flex gap-2">
      {reactionButtons(reactions).map((reaction) => (
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
  );
}
