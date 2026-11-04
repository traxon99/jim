import type { FeedItem } from "./feed";
import { describeExercise, workoutMinutes } from "./format";
import type { FriendPost } from "./types";

const POST_KIND_LABELS: Record<FriendPost["kind"], string> = {
  workout: "Finished a workout",
  record: "New personal record",
  achievement: "Earned an achievement",
};

export type ShareOutcome = "shared" | "copied" | "cancelled" | "unavailable";

type ShareNavigator = Pick<Navigator, "share" | "clipboard">;

/** Plain-text summary of a feed post for sharing (issue #748). */
export function postShareText(item: FeedItem): { title: string; text: string } {
  if (item.type === "workout") {
    const { workout } = item;
    const minutes = workoutMinutes(workout);
    const lines = [`@${workout.username}'s ${workout.name ?? "workout"}`, `${minutes} min`];
    if (workout.volume !== null && workout.volume > 0) {
      lines.push(`${workout.volume} ${workout.units}`);
    }
    for (const exercise of workout.exercises) {
      lines.push(`${exercise.name}: ${describeExercise(exercise, workout.units)}`);
    }
    if (item.post?.caption) lines.push("", item.post.caption);
    return { title: workout.name ?? "Workout", text: lines.join("\n") };
  }

  const { post } = item;
  const lines = [`@${post.username}: ${POST_KIND_LABELS[post.kind]}`, post.title];
  if (post.detail) lines.push(post.detail);
  if (post.caption) lines.push("", post.caption);
  return { title: post.title, text: lines.join("\n") };
}

/** Hands text to the OS share sheet, clipboard fallback (issue #748). */
export async function shareText(
  title: string,
  text: string,
  nav: Partial<ShareNavigator> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): Promise<ShareOutcome> {
  if (nav?.share) {
    try {
      await nav.share({ title, text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  if (nav?.clipboard) {
    try {
      await nav.clipboard.writeText(text);
      return "copied";
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}
