/** Shapes /api/friends and /api/friends/workouts return (issue #35). */

import type { ReactionKind } from "@jim/core";

export interface FriendEntry {
  userId: string;
  username: string;
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
  units: "lb" | "kg";
  name: string | null;
  startedAt: string;
  endedAt: string;
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
