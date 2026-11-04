import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import {
  addComment,
  deleteComment,
  listComments,
  listFriendActivity,
  reactToComment,
  reactToWorkout,
} from "../comments.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("comment tools (#749)", () => {
  let admin: postgres.Sql;
  let me: UserContext;
  let friend: UserContext;
  let workoutId: string;

  beforeAll(async () => {
    admin = await resetTestDb();
    me = testContext(USER_A);
    friend = testContext(USER_B);
    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at)
      VALUES (${USER_A}, ${USER_B}, 'accepted', now())`;
    const [session] = await admin<{ id: string }[]>`
      INSERT INTO sessions (user_id, name, device_id, started_at, ended_at)
      VALUES (${USER_B}, 'Pull Day', 'b', now() - interval '50 minutes', now()) RETURNING id`;
    workoutId = session?.id ?? "";
  });

  afterAll(async () => {
    await admin.end();
    await me.db.$client.end();
    await friend.db.$client.end();
  });

  it("finds a friend's workout, comments on it and lists the thread", async () => {
    const activity = await listFriendActivity(me);
    expect(activity.workouts).toMatchObject([
      { workoutId, friend: "b", name: "Pull Day", minutes: 50, comments: 0 },
    ]);

    const preview = await addComment(me, { workoutId, text: "nice", dryRun: true });
    expect(preview).toMatchObject({ dryRun: true, text: "nice" });
    expect(await listComments(me, { workoutId })).toEqual([]);

    await addComment(me, { workoutId, text: "  strong pulls  " });
    const thread = await listComments(friend, { workoutId });
    expect(thread).toMatchObject([
      { author: "a", text: "strong pulls", mine: false, canDelete: true },
    ]);
    expect((await listFriendActivity(me)).workouts[0]?.comments).toBe(1);
  });

  it("refuses bad input and threads the user can't see", async () => {
    await expect(addComment(me, { text: "hi" })).rejects.toThrow(/exactly one/);
    await expect(addComment(me, { workoutId, text: "  " })).rejects.toThrow(/Write something/);
    await expect(
      addComment(me, { workoutId: "00000000-0000-4000-8000-000000000000", text: "hi" }),
    ).rejects.toThrow(/list_friend_activity/);
  });

  it("reacts to a workout and a grind kind", async () => {
    expect(await reactToWorkout(me, { workoutId, kind: "fire" })).toMatchObject({
      reacted: true,
      kind: "fire",
    });
    await reactToWorkout(me, { workoutId, kind: "grind" });
    const activity = await listFriendActivity(me);
    expect(activity.workouts[0]?.reactions).toEqual([{ kind: "grind", count: 1, mine: true }]);
  });

  it("keeps one reaction per person on a comment", async () => {
    const [comment] = await listComments(friend, { workoutId });
    if (!comment) throw new Error("missing comment");
    expect(
      await reactToComment(friend, { commentId: comment.commentId, kind: "fire" }),
    ).toMatchObject({ reacted: true });
    await reactToComment(friend, { commentId: comment.commentId, kind: "clap" });
    const [seen] = await listComments(me, { workoutId });
    expect(seen?.reactions).toEqual([{ kind: "clap", count: 1, mine: false }]);
  });

  it("deletes with a dry run first by default", async () => {
    const [comment] = await listComments(me, { workoutId });
    if (!comment) throw new Error("missing comment");
    expect(await deleteComment(me, { commentId: comment.commentId })).toMatchObject({
      dryRun: true,
    });
    expect(await listComments(me, { workoutId })).toHaveLength(1);
    await deleteComment(friend, { commentId: comment.commentId, dryRun: false });
    expect(await listComments(me, { workoutId })).toHaveLength(0);
  });
});
