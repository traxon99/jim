import { type ReactionKind, commentError, normalizeComment } from "@jim/core";
import { sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";

/**
 * Friends' activity and comments (issues #746, #749): what the app's Home
 * feed and comments sheet show, through the same SECURITY DEFINER functions
 * (ADR-017), so a comment written here is checked the same way.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CommentTargetInput {
  workoutId?: string;
  postId?: string;
}

function target(input: CommentTargetInput): { sessionId: string | null; postId: string | null } {
  const { workoutId, postId } = input;
  if ((workoutId === undefined) === (postId === undefined)) {
    throw new Error("Pass exactly one of workoutId or postId.");
  }
  const id = workoutId ?? postId ?? "";
  if (!UUID_RE.test(id)) throw new Error(`"${id}" isn't an id from list_friend_activity.`);
  return { sessionId: workoutId ?? null, postId: postId ?? null };
}

const NOT_VISIBLE =
  "That isn't a finished workout or post of yours or a friend's. Find ids with list_friend_activity.";

interface WorkoutRow extends Record<string, unknown> {
  session_id: string;
  username: string;
  name: string | null;
  started_at: Date | string;
  ended_at: Date | string;
  exercises: { name: string; sets: number }[];
  reactions: { kind: string; count: number; mine: boolean }[];
}

interface PostRow extends Record<string, unknown> {
  post_id: string;
  username: string;
  kind: string;
  session_id: string | null;
  title: string;
  detail: string | null;
  caption: string | null;
  created_at: Date | string;
}

interface SummaryRow extends Record<string, unknown> {
  session_id: string | null;
  post_id: string | null;
  comment_count: number;
}

/** Friends' latest finished workouts and posts, newest first, with their comment counts. */
export async function listFriendActivity(context: UserContext, input: { limit?: number } = {}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  return withUser(context, async (tx) => {
    const workouts = await tx.execute<WorkoutRow>(sql`SELECT * FROM friend_workouts(${limit})`);
    const posts = await tx.execute<PostRow>(sql`SELECT * FROM friend_posts(${limit})`);
    const sessionIds = [
      ...workouts.map((w) => w.session_id),
      ...posts.flatMap((p) => (p.session_id ? [p.session_id] : [])),
    ];
    const postIds = posts.flatMap((p) => (p.session_id ? [] : [p.post_id]));
    const summaries = await tx.execute<SummaryRow>(
      sql`SELECT * FROM comment_summaries(${`{${sessionIds.join(",")}}`}::uuid[], ${`{${postIds.join(",")}}`}::uuid[])`,
    );
    const counts = new Map(
      summaries.map((s) => [s.session_id ?? s.post_id ?? "", Number(s.comment_count)]),
    );
    return {
      workouts: workouts.map((w) => ({
        workoutId: w.session_id,
        friend: w.username,
        name: w.name,
        startedAt: new Date(w.started_at).toISOString(),
        minutes: Math.round(
          (new Date(w.ended_at).getTime() - new Date(w.started_at).getTime()) / 60_000,
        ),
        exercises: w.exercises.map((e) => `${e.name} (${Number(e.sets)} sets)`),
        reactions: w.reactions.map((r) => ({ kind: r.kind, count: Number(r.count), mine: r.mine })),
        comments: counts.get(w.session_id) ?? 0,
      })),
      posts: posts.map((p) => ({
        postId: p.post_id,
        friend: p.username,
        kind: p.kind,
        // A workout post's comments live on its workout: comment with workoutId.
        workoutId: p.session_id,
        title: p.title,
        detail: p.detail,
        caption: p.caption,
        createdAt: new Date(p.created_at).toISOString(),
        comments: counts.get(p.session_id ?? p.post_id) ?? 0,
      })),
    };
  });
}

interface CommentRow extends Record<string, unknown> {
  comment_id: string;
  username: string;
  body: string;
  created_at: Date | string;
  mine: boolean;
  can_delete: boolean;
  reactions: { kind: string; count: number; mine: boolean }[];
}

/** A workout's or post's comments, oldest first. */
export async function listComments(context: UserContext, input: CommentTargetInput) {
  const { sessionId, postId } = target(input);
  return withUser(context, async (tx) => {
    const rows = await tx.execute<CommentRow>(
      sql`SELECT * FROM list_comments(${sessionId}::uuid, ${postId}::uuid)`,
    );
    return rows.map((row) => ({
      commentId: row.comment_id,
      author: row.username,
      text: row.body,
      createdAt: new Date(row.created_at).toISOString(),
      mine: row.mine,
      canDelete: row.can_delete,
      reactions: row.reactions.map((r) => ({ kind: r.kind, count: Number(r.count), mine: r.mine })),
    }));
  });
}

/** Comments on a friend's (or the user's own) finished workout or post. */
export async function addComment(
  context: UserContext,
  input: CommentTargetInput & { text: string; dryRun?: boolean },
) {
  const { sessionId, postId } = target(input);
  const text = normalizeComment(input.text);
  const invalid = commentError(text);
  if (invalid || text === null) throw new Error(invalid ?? "Write something first");
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const [row] = await tx.execute<{ id: string | null }>(
      sql`SELECT add_comment(${sessionId}::uuid, ${postId}::uuid, ${text}) AS id`,
    );
    if (!row?.id) throw new Error(NOT_VISIBLE);
    return { commentId: row.id, text };
  });
}

/** Sets or takes back the user's one reaction on a comment they can see. */
export async function reactToComment(
  context: UserContext,
  input: { commentId: string; kind: ReactionKind; dryRun?: boolean },
) {
  if (!UUID_RE.test(input.commentId)) {
    throw new Error(`"${input.commentId}" isn't a comment id from list_comments.`);
  }
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const [row] = await tx.execute<{ reacted: boolean | null }>(
      sql`SELECT set_comment_reaction(${input.commentId}::uuid, ${input.kind}::reaction_kind) AS reacted`,
    );
    if (row?.reacted === null || row?.reacted === undefined) {
      throw new Error("No such comment, or it isn't on a workout or post you can see.");
    }
    return { commentId: input.commentId, kind: input.kind, reacted: row.reacted };
  });
}

/** Deletes the user's own comment, or any comment on their own workout or post. */
export async function deleteComment(
  context: UserContext,
  input: { commentId: string; dryRun?: boolean },
) {
  if (!UUID_RE.test(input.commentId)) {
    throw new Error(`"${input.commentId}" isn't a comment id from list_comments.`);
  }
  return withUserWrite(context, input.dryRun ?? true, async (tx) => {
    const [row] = await tx.execute<{ ok: boolean }>(
      sql`SELECT delete_comment(${input.commentId}::uuid) AS ok`,
    );
    if (!row?.ok) {
      throw new Error("No such comment, or it isn't yours or on your own workout or post.");
    }
    return { deleted: input.commentId };
  });
}
