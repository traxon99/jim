import { type Result, apiRequest } from "@/lib/api/client";
import type { PostDraft, ReactionKind } from "@jim/core";
import type { WeekRingPerson } from "@jim/core";
import type {
  ActivityPayload,
  CommentTarget,
  FeedComment,
  FriendPost,
  FriendProfilePayload,
  FriendRecordRow,
  FriendRequestResult,
  FriendSuggestion,
  FriendWorkout,
  FriendsPayload,
  OwnPost,
  ProfilePayload,
  ReceivedReaction,
} from "./types";

// Friends are server data (issue #35): unlike training, nothing here is
// written to IndexedDB first, so each call can fail offline and says so.

export function fetchFriends(fetchImpl: typeof fetch = fetch) {
  return apiRequest<FriendsPayload>("/api/friends", undefined, "Couldn't load friends", fetchImpl);
}

export async function fetchWeekRings(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<WeekRingPerson[]>> {
  const result = await apiRequest<{ people: WeekRingPerson[] }>(
    "/api/friends/week-rings",
    undefined,
    "Couldn't load week rings",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.people } : result;
}

export async function fetchFriendWorkouts(
  friendId?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<FriendWorkout[]>> {
  const path = friendId
    ? `/api/friends/workouts?friendId=${encodeURIComponent(friendId)}`
    : "/api/friends/workouts";
  const result = await apiRequest<{ workouts: FriendWorkout[] }>(
    path,
    undefined,
    "Couldn't load your friends' workouts",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.workouts } : result;
}

export async function fetchFriendPosts(
  friendId?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<FriendPost[]>> {
  const path = friendId
    ? `/api/friends/posts?friendId=${encodeURIComponent(friendId)}`
    : "/api/friends/posts";
  const result = await apiRequest<{ posts: FriendPost[] }>(
    path,
    undefined,
    "Couldn't load your friends' posts",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.posts } : result;
}

export function fetchActivity(fetchImpl: typeof fetch = fetch) {
  return apiRequest<ActivityPayload>(
    "/api/activity",
    undefined,
    "Couldn't load activity",
    fetchImpl,
  );
}

export function markActivitySeen(fetchImpl: typeof fetch = fetch) {
  return apiRequest<{ ok: boolean; lastSeenAt: string | null }>(
    "/api/activity",
    { method: "POST", body: JSON.stringify({ action: "mark_seen" }) },
    "Couldn't update activity",
    fetchImpl,
  );
}

export async function fetchFriendSuggestions(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<FriendSuggestion[]>> {
  const result = await apiRequest<{ suggestions: FriendSuggestion[] }>(
    "/api/friends/suggestions",
    undefined,
    "Couldn't load suggestions",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.suggestions } : result;
}

export function dismissFriendSuggestion(userId: string, fetchImpl: typeof fetch = fetch) {
  return apiRequest<{ ok: boolean }>(
    "/api/friends/suggestions",
    { method: "DELETE", body: JSON.stringify({ userId }) },
    "Couldn't dismiss the suggestion",
    fetchImpl,
  );
}

export function fetchFriendProfile(username: string, fetchImpl: typeof fetch = fetch) {
  return apiRequest<FriendProfilePayload>(
    `/api/friends/${encodeURIComponent(username)}`,
    undefined,
    "Couldn't load their profile",
    fetchImpl,
  );
}

export async function fetchFriendRecords(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<FriendRecordRow[]>> {
  const result = await apiRequest<{ records: FriendRecordRow[] }>(
    `/api/friends/${encodeURIComponent(username)}/records`,
    undefined,
    "Couldn't load their records",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.records } : result;
}

export function fetchProfile(fetchImpl: typeof fetch = fetch) {
  return apiRequest<ProfilePayload>(
    "/api/profile",
    undefined,
    "Couldn't load your profile",
    fetchImpl,
  );
}

/** Changes the picture (null removes it) or sharing settings; the value is the saved profile. */
export function updateProfile(
  patch: Partial<
    Pick<
      ProfilePayload,
      | "avatar"
      | "displayName"
      | "bio"
      | "shareWorkouts"
      | "shareWorkoutDetails"
      | "discoverableByFriendsOfFriends"
    >
  >,
  fetchImpl: typeof fetch = fetch,
) {
  return apiRequest<ProfilePayload>(
    "/api/profile",
    { method: "PATCH", body: JSON.stringify(patch) },
    "Couldn't save your profile",
    fetchImpl,
  );
}

export async function fetchOwnPosts(fetchImpl: typeof fetch = fetch): Promise<Result<OwnPost[]>> {
  const result = await apiRequest<{ posts: OwnPost[] }>(
    "/api/posts",
    undefined,
    "Couldn't load your posts",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.posts } : result;
}

/** Shares a post with friends; the value is the new post's id. */
export async function createPost(
  draft: PostDraft,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<string>> {
  const result = await apiRequest<{ postId: string }>(
    "/api/posts",
    { method: "POST", body: JSON.stringify(draft) },
    "Couldn't share your post",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.postId } : result;
}

export function deletePost(postId: string, fetchImpl: typeof fetch = fetch) {
  return apiRequest<{ ok: boolean }>(
    "/api/posts",
    { method: "DELETE", body: JSON.stringify({ postId }) },
    "Couldn't delete the post",
    fetchImpl,
  );
}

export async function fetchReceivedReactions(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<ReceivedReaction[]>> {
  const result = await apiRequest<{ reactions: ReceivedReaction[] }>(
    "/api/friends/reactions",
    undefined,
    "Couldn't load reactions",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.reactions } : result;
}

/** Adds or takes back a reaction on a workout or post; the value is whether it's now there. */
export async function toggleReaction(
  target: CommentTarget,
  kind: ReactionKind,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<boolean>> {
  const body =
    "sessionId" in target ? { sessionId: target.sessionId, kind } : { postId: target.postId, kind };
  const result = await apiRequest<{ reacted: boolean }>(
    "/api/friends/reactions",
    { method: "POST", body: JSON.stringify(body) },
    "Couldn't save your reaction",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.reacted } : result;
}

export async function sendFriendRequest(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<FriendRequestResult>> {
  const result = await apiRequest<{ result: FriendRequestResult }>(
    "/api/friends",
    { method: "POST", body: JSON.stringify({ username }) },
    "Couldn't send the request",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.result } : result;
}

export function respondToFriendRequest(
  userId: string,
  accept: boolean,
  fetchImpl: typeof fetch = fetch,
) {
  return apiRequest<{ ok: boolean }>(
    "/api/friends",
    { method: "PATCH", body: JSON.stringify({ userId, accept }) },
    "Couldn't answer the request",
    fetchImpl,
  );
}

export function removeFriend(userId: string, fetchImpl: typeof fetch = fetch) {
  return apiRequest<{ ok: boolean }>(
    "/api/friends",
    { method: "DELETE", body: JSON.stringify({ userId }) },
    "Couldn't remove them",
    fetchImpl,
  );
}

export async function updateUsername(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<string>> {
  const result = await apiRequest<{ username: string }>(
    "/api/username",
    { method: "PUT", body: JSON.stringify({ username }) },
    "Couldn't save your username",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.username } : result;
}

/** What to tell the user after sending a request. */
export function friendRequestMessage(result: FriendRequestResult, username: string): string {
  switch (result) {
    case "sent":
      return `Request sent to @${username}`;
    case "accepted":
      return `You and @${username} are now friends`;
    case "already_friends":
      return `You're already friends with @${username}`;
    case "already_requested":
      return `You've already sent @${username} a request`;
    case "not_found":
      return `No one has the username @${username}`;
    case "self":
      return "That's your own username";
  }
}

function targetQuery(target: CommentTarget): string {
  return "sessionId" in target
    ? `sessionId=${encodeURIComponent(target.sessionId)}`
    : `postId=${encodeURIComponent(target.postId)}`;
}

/** A workout's or post's comments, oldest first (issue #749). */
export async function fetchComments(
  target: CommentTarget,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<FeedComment[]>> {
  const result = await apiRequest<{ comments: FeedComment[] }>(
    `/api/comments?${targetQuery(target)}`,
    undefined,
    "Couldn't load comments",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.comments } : result;
}

/** Posts a comment; the value is its id. */
export async function addComment(
  target: CommentTarget,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<string>> {
  const result = await apiRequest<{ commentId: string }>(
    "/api/comments",
    { method: "POST", body: JSON.stringify({ ...target, body }) },
    "Couldn't post your comment",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.commentId } : result;
}

export function deleteComment(commentId: string, fetchImpl: typeof fetch = fetch) {
  return apiRequest<{ ok: boolean }>(
    "/api/comments",
    { method: "DELETE", body: JSON.stringify({ commentId }) },
    "Couldn't delete the comment",
    fetchImpl,
  );
}

/** Sets or takes back your reaction on a comment; the value is whether `kind` is now yours. */
export async function reactToComment(
  commentId: string,
  kind: ReactionKind,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<boolean>> {
  const result = await apiRequest<{ reacted: boolean }>(
    "/api/comments/reactions",
    { method: "POST", body: JSON.stringify({ commentId, kind }) },
    "Couldn't save your reaction",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.reacted } : result;
}
