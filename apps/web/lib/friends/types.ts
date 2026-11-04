/** Shapes /api/friends and /api/friends/workouts return (issue #35). */

import type { PostKind, PrKind, ReactionKind, RoutineIconColor } from "@jim/core";

/** One row in Home's activity list (#753). */
export type ActivityKind = "workout_reaction" | "post_reaction" | "friend_request" | "comment";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  occurredAt: string;
  actorUserId: string;
  actorUsername: string;
  actorAvatar: string | null;
  sessionId: string | null;
  sessionName: string | null;
  postId: string | null;
  commentId: string | null;
  reactionKind: ReactionKind | null;
}

export interface ActivityPayload {
  unread: boolean;
  items: ActivityItem[];
}

/** A People you may know card (#754). */
export interface FriendSuggestion {
  userId: string;
  username: string;
  avatar: string | null;
  reason: string;
  mutualCount: number;
}

export interface FriendEntry {
  userId: string;
  username: string;
  /** Their profile picture as an image data URL (issue #316), or null. */
  avatar: string | null;
  status: "pending" | "accepted";
  /** Who sent a still-pending request; null once it's accepted. */
  direction: "incoming" | "outgoing" | null;
  /** When they became friends, or when the request was sent. */
  since: string;
}

export interface FriendsPayload {
  /** The signed-in user's own username. */
  username: string | null;
  /** The signed-in user's own profile picture, or null. */
  avatar: string | null;
  friends: FriendEntry[];
}

export type FriendRequestResult =
  | "sent"
  | "accepted"
  | "already_friends"
  | "already_requested"
  | "not_found"
  | "self";

export interface FriendWorkoutExercise {
  name: string;
  sets: number;
  /** The heaviest set, in the friend's own units. */
  topWeight: number | null;
  topReps: number | null;
}

export interface FriendWorkoutMuscle {
  muscle: string;
  sets: number;
}

export interface FriendWorkoutRecord {
  exercise: string;
  kind: PrKind;
  /** The record's value: an estimated 1RM weight, or a rep count. */
  value: number;
  /** The set that set it. */
  weight: number | null;
  reps: number | null;
}

export interface FriendWorkout {
  sessionId: string;
  userId: string;
  username: string;
  avatar: string | null;
  units: "lb" | "kg";
  name: string | null;
  startedAt: string;
  endedAt: string;
  /** The routine's icon color, which tints the post (issue #747); null when it has none. */
  routineColor: RoutineIconColor | null;
  /** The gym it was done at, or null. */
  gymName: string | null;
  /** Working-set volume in the friend's units; null when they share no details. */
  volume: number | null;
  /** The top three muscles by working sets; empty when they share no details. */
  muscles: FriendWorkoutMuscle[];
  /** PRs set in it (estimated 1RM, and reps on bodyweight lifts); empty without details. */
  records: FriendWorkoutRecord[];
  /** Empty when the friend shares no workout details (issue #316). */
  exercises: FriendWorkoutExercise[];
  /** Kinds anyone has reacted with (issue #303); kinds with no reactions are left out. */
  reactions: WorkoutReaction[];
  /** Up to two other reactors' usernames, newest first (issue #748). */
  reactedBy: string[];
  /** Its comments (issue #749). */
  comments: CommentSummary;
}

export interface WorkoutReaction {
  kind: ReactionKind;
  count: number;
  /** Whether the signed-in user is one of those who reacted. */
  mine: boolean;
}

/** A reaction someone left on one of the signed-in user's own workouts. */
export interface ReceivedReaction {
  sessionId: string;
  sessionName: string | null;
  startedAt: string;
  userId: string;
  username: string;
  kind: ReactionKind;
  createdAt: string;
}

/** The signed-in user's picture and sharing settings, from /api/profile (issue #316). */
export interface ProfilePayload {
  username: string | null;
  avatar: string | null;
  displayName: string | null;
  bio: string | null;
  /** Whether friends see this user's finished workouts in their feed. */
  shareWorkouts: boolean;
  /** Whether those workouts show their exercises and weights. */
  shareWorkoutDetails: boolean;
  /** Whether you can show up in friends-of-friends suggestions (#754). */
  discoverableByFriendsOfFriends: boolean;
}

export interface ProfileLiftHighlight {
  key: string;
  label: string;
  e1rm: number;
  units: "lb" | "kg";
}

/** A friend's profile header from `/api/friends/[username]` (issue #751). */
export interface FriendProfilePayload {
  userId: string;
  username: string;
  avatar: string | null;
  displayName: string | null;
  bio: string | null;
  shareWorkouts: boolean;
  shareWorkoutDetails: boolean;
  units: "lb" | "kg";
  weekStart: number;
  timeZone: string | null;
  workoutCount: number;
  friendCount: number;
  sessionDates: string[];
  defaultGymName: string | null;
  liftHighlights: ProfileLiftHighlight[];
}

export interface FriendRecordRow {
  exerciseName: string;
  kind: PrKind;
  value: number;
  weight: number | null;
  reps: number | null;
  achievedAt: string;
}

/** One of the signed-in user's own posts (issue #316). */
export interface OwnPost {
  postId: string;
  kind: PostKind;
  sessionId: string | null;
  title: string;
  detail: string | null;
  caption: string | null;
  createdAt: string;
}

/** A friend's post in the Home feed (issue #316). */
export interface FriendPost extends OwnPost {
  userId: string;
  username: string;
  avatar: string | null;
  /** Workout posts carry their session's reactions; record/achievement carry their own. */
  reactions: WorkoutReaction[];
  /** Up to two other reactors' usernames, newest first (issue #748). */
  reactedBy: string[];
  /** Comments on the post itself, for a record or achievement post (issue #749). */
  comments: CommentSummary;
}

/** What a comment hangs off (issue #749): a workout, or a record or achievement post. */
export type CommentTarget = { sessionId: string } | { postId: string };

/** One comment in a thread, from /api/comments. */
export interface FeedComment {
  commentId: string;
  userId: string;
  username: string;
  avatar: string | null;
  body: string;
  createdAt: string;
  /** Whether the signed-in user wrote it. */
  mine: boolean;
  /** Whether the signed-in user may delete it: its author, or the owner of what it's on. */
  canDelete: boolean;
  reactions: WorkoutReaction[];
}

/** A workout's or post's comment count and newest comment, for the feed. */
export interface CommentSummary {
  count: number;
  latest: { username: string; body: string } | null;
}
