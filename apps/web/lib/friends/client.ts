import type { FriendRequestResult, FriendWorkout, FriendsPayload } from "./types";

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
