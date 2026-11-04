import type { FeedItem } from "@/lib/friends/feed";
import { RECORD_TINT, formatVolume, postTint, timeAgo } from "@/lib/friends/post-media";
import type { FriendWorkout, OwnPost } from "@/lib/friends/types";

export interface ProfilePostTile {
  id: string;
  title: string;
  subtitle: string;
  tintClass: string;
  hasPr: boolean;
  href: string | null;
}

function workoutTile(workout: FriendWorkout): ProfilePostTile {
  const hasPr = workout.records.length > 0;
  const volume =
    workout.volume !== null && workout.volume > 0
      ? `${formatVolume(workout.volume)} ${workout.units}`
      : null;
  const subtitle = [timeAgo(workout.endedAt), volume].filter(Boolean).join(" · ");
  return {
    id: workout.sessionId,
    title: workout.name ?? "Workout",
    subtitle,
    tintClass: postTint(workout.routineColor),
    hasPr,
    href: null,
  };
}

/** Tiles for a profile Posts tab from workouts and explicit posts. */
export function profileTilesFromFeed(items: readonly FeedItem[]): ProfilePostTile[] {
  return items.map((item) => {
    if (item.type === "workout") return workoutTile(item.workout);
    const { post } = item;
    return {
      id: post.postId,
      title: post.title,
      subtitle: timeAgo(post.createdAt),
      tintClass: `bg-linear-to-br ${RECORD_TINT}`,
      hasPr: post.kind === "record",
      href: null,
    };
  });
}

/** Own shared posts as tiles; workout posts link to History when we know the session. */
export function profileTilesFromOwnPosts(posts: readonly OwnPost[]): ProfilePostTile[] {
  return posts.map((post) => ({
    id: post.postId,
    title: post.title,
    subtitle: timeAgo(post.createdAt),
    tintClass: `bg-linear-to-br ${RECORD_TINT}`,
    hasPr: post.kind === "record",
    href: post.sessionId ? `/history/${post.sessionId}` : null,
  }));
}
