import type { FriendPost, FriendWorkout } from "./types";

/** One card in Home's friends feed (issue #316). */
export type FeedItem =
  | {
      type: "workout";
      workout: FriendWorkout;
      /** The friend's post sharing this workout, whose caption the card shows. */
      post: FriendPost | null;
      at: string;
    }
  | { type: "post"; post: FriendPost; at: string };

/**
 * Friends' finished workouts and posts as one feed, newest first. A post that
 * shares a workout already in the feed becomes that workout's caption rather
 * than a second card; one whose workout isn't (its owner shares posts but not
 * every workout, or it's older than the feed reaches) stands on its own.
 */
export function buildFeed(workouts: FriendWorkout[], posts: FriendPost[]): FeedItem[] {
  const postBySession = new Map<string, FriendPost>();
  for (const post of posts) {
    // Posts arrive newest first, so the latest post of a workout wins.
    if (post.sessionId && !postBySession.has(post.sessionId)) {
      postBySession.set(post.sessionId, post);
    }
  }
  const workoutIds = new Set(workouts.map((workout) => workout.sessionId));

  const items: FeedItem[] = [
    ...workouts.map(
      (workout): FeedItem => ({
        type: "workout",
        workout,
        post: postBySession.get(workout.sessionId) ?? null,
        at: workout.endedAt,
      }),
    ),
    ...posts
      .filter((post) => !(post.sessionId && workoutIds.has(post.sessionId)))
      .map((post): FeedItem => ({ type: "post", post, at: post.createdAt })),
  ];
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
