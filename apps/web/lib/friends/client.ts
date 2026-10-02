import type { PostDraft, ReactionKind } from "@jim/core";
import type {
  FriendPost,
  FriendRequestResult,
  FriendWorkout,
  FriendsPayload,
  OwnPost,
  ProfilePayload,
  ReceivedReaction,
} from "./types";

// Friends are server data (issue #35): unlike training, nothing here is
// written to IndexedDB first, so each call can fail offline and says so.

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const OFFLINE = "No connection — try again once you're back online";

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  fallbackError: string,
  fetchImpl: typeof fetch,
): Promise<Result<T>> {
  try {
    const response = await fetchImpl(path, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || body === null) {
      return { ok: false, error: body?.error ?? fallbackError };
    }
    return { ok: true, value: body };
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

export function fetchFriends(fetchImpl: typeof fetch = fetch) {
  return request<FriendsPayload>("/api/friends", undefined, "Couldn't load friends", fetchImpl);
}

export async function fetchFriendWorkouts(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<FriendWorkout[]>> {
  const result = await request<{ workouts: FriendWorkout[] }>(
    "/api/friends/workouts",
    undefined,
    "Couldn't load your friends' workouts",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.workouts } : result;
}

export async function fetchFriendPosts(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<FriendPost[]>> {
  const result = await request<{ posts: FriendPost[] }>(
    "/api/friends/posts",
    undefined,
    "Couldn't load your friends' posts",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.posts } : result;
}

export function fetchProfile(fetchImpl: typeof fetch = fetch) {
  return request<ProfilePayload>(
    "/api/profile",
    undefined,
    "Couldn't load your profile",
    fetchImpl,
  );
}

/** Changes the picture (null removes it) or sharing settings; the value is the saved profile. */
export function updateProfile(
  patch: Partial<Pick<ProfilePayload, "avatar" | "shareWorkouts" | "shareWorkoutDetails">>,
  fetchImpl: typeof fetch = fetch,
) {
  return request<ProfilePayload>(
    "/api/profile",
    { method: "PATCH", body: JSON.stringify(patch) },
    "Couldn't save your profile",
    fetchImpl,
  );
}

export async function fetchOwnPosts(fetchImpl: typeof fetch = fetch): Promise<Result<OwnPost[]>> {
  const result = await request<{ posts: OwnPost[] }>(
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
  const result = await request<{ postId: string }>(
    "/api/posts",
    { method: "POST", body: JSON.stringify(draft) },
    "Couldn't share your post",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.postId } : result;
}

export function deletePost(postId: string, fetchImpl: typeof fetch = fetch) {
  return request<{ ok: boolean }>(
    "/api/posts",
    { method: "DELETE", body: JSON.stringify({ postId }) },
    "Couldn't delete the post",
    fetchImpl,
  );
}

export async function fetchReceivedReactions(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<ReceivedReaction[]>> {
  const result = await request<{ reactions: ReceivedReaction[] }>(
    "/api/friends/reactions",
    undefined,
    "Couldn't load reactions",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.reactions } : result;
}

/** Adds or takes back a reaction; the value is whether it's now there. */
export async function toggleReaction(
  sessionId: string,
  kind: ReactionKind,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<boolean>> {
  const result = await request<{ reacted: boolean }>(
    "/api/friends/reactions",
    { method: "POST", body: JSON.stringify({ sessionId, kind }) },
    "Couldn't save your reaction",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.reacted } : result;
}

export async function sendFriendRequest(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<FriendRequestResult>> {
  const result = await request<{ result: FriendRequestResult }>(
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
  return request<{ ok: boolean }>(
    "/api/friends",
    { method: "PATCH", body: JSON.stringify({ userId, accept }) },
    "Couldn't answer the request",
    fetchImpl,
  );
}

export function removeFriend(userId: string, fetchImpl: typeof fetch = fetch) {
  return request<{ ok: boolean }>(
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
  const result = await request<{ username: string }>(
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
