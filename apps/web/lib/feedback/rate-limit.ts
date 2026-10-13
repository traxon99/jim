import { withUserDb } from "@/lib/db/user-scoped";
import { feedbackSubmissions } from "@jim/db";
import { and, count, eq, gt } from "drizzle-orm";

/** Feedback submissions one account may file per `FEEDBACK_WINDOW_MS` (issue #504). */
export const FEEDBACK_LIMIT = 5;
export const FEEDBACK_WINDOW_MS = 60 * 60 * 1000;

/**
 * Records a feedback submission for the signed-in user, or returns false
 * without recording when they've already sent `FEEDBACK_LIMIT` in the last
 * window. The per-user exclusive lock makes two simultaneous submissions
 * count one after the other instead of both slipping under the cap.
 */
export async function claimFeedbackSlot(now: Date = new Date()): Promise<boolean> {
  return withUserDb(
    async (tx, userId) => {
      const since = new Date(now.getTime() - FEEDBACK_WINDOW_MS);
      const [row] = await tx
        .select({ sent: count() })
        .from(feedbackSubmissions)
        .where(
          and(eq(feedbackSubmissions.userId, userId), gt(feedbackSubmissions.createdAt, since)),
        );
      if ((row?.sent ?? 0) >= FEEDBACK_LIMIT) return false;
      await tx.insert(feedbackSubmissions).values({ userId, createdAt: now });
      return true;
    },
    { exclusive: true },
  );
}
