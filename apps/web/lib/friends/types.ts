/** Shapes /api/friends and /api/friends/workouts return (issue #35). */

import type { PostKind, ReactionKind } from "@jim/core";

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

export interface FriendWorkout {
  sessionId: string;
  userId: string;
  username: string;
  avatar: string | null;
  units: "lb" | "kg";
  name: string | null;
  startedAt: string;
  endedAt: string;
  /** Empty when the friend shares no workout details (issue #316). */
  exercises: FriendWorkoutExercise[];
  /** Kinds anyone has reacted with (issue #303); kinds with no reactions are left out. */
  reactions: WorkoutReaction[];
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
  /** Whether friends see this user's finished workouts in their feed. */
  shareWorkouts: boolean;
  /** Whether those workouts show their exercises and weights. */
  shareWorkoutDetails: boolean;
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
  /** The shared workout's reactions, for a "workout" post; empty otherwise. */
  reactions: WorkoutReaction[];
}
