import { describe, expect, it, vi } from "vitest";
import {
  createPost,
  fetchLeaderboard,
  fetchLeaderboardLifts,
  friendRequestMessage,
  sendFriendRequest,
  toggleReaction,
  updateProfile,
  updateUsername,
} from "../client";

function respond(status: number, body: unknown) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("friends client", () => {
  it("returns the request's outcome", async () => {
    const fetchImpl = respond(200, { result: "sent" });
    expect(await sendFriendRequest("bob", fetchImpl)).toEqual({ ok: true, value: "sent" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/friends",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "bob" }) }),
    );
  });

  it("toggles a reaction", async () => {
    const fetchImpl = respond(200, { reacted: true });
    expect(await toggleReaction({ sessionId: "s1" }, "fire", fetchImpl)).toEqual({
      ok: true,
      value: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/friends/reactions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "s1", kind: "fire" }),
      }),
    );
  });

  it("creates a post", async () => {
    const fetchImpl = respond(200, { postId: "p1" });
    const draft = {
      kind: "record" as const,
      sessionId: null,
      title: "Bench Press",
      detail: "Estimated 1RM · 225 lb",
      caption: "Finally",
    };
    expect(await createPost(draft, fetchImpl)).toEqual({ ok: true, value: "p1" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/posts",
      expect.objectContaining({ method: "POST", body: JSON.stringify(draft) }),
    );
  });

  it("patches the profile", async () => {
    const saved = {
      username: "bob",
      avatar: null,
      displayName: null,
      bio: null,
      shareWorkouts: false,
      shareWorkoutDetails: true,
    };
    const fetchImpl = respond(200, saved);
    expect(await updateProfile({ shareWorkouts: false }, fetchImpl)).toEqual({
      ok: true,
      value: saved,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ shareWorkouts: false }) }),
    );
  });

  it("surfaces the server's error message", async () => {
    const result = await updateUsername("bob", respond(409, { error: "That username is taken" }));
    expect(result).toEqual({ ok: false, error: "That username is taken" });
  });

  it("asks for a lift's board by slug, with the machine when it has one", async () => {
    const fetchImpl = respond(200, { units: "lb", rows: [] });
    await fetchLeaderboard("bench-press", null, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/friends/leaderboard?slug=bench-press",
      expect.anything(),
    );

    const machine = { brand: "Rogue", model: "X", latitude: 40, longitude: -75 };
    await fetchLeaderboard("leg-press", machine, fetchImpl);
    const url = (fetchImpl as unknown as { mock: { calls: string[][] } }).mock.calls[1]?.[0] ?? "";
    expect(new URL(`http://x${url}`).searchParams.get("machine")).toBe(JSON.stringify(machine));
  });

  it("unwraps the shared lifts", async () => {
    const lift = { slug: "squat", name: "Squat", machine: null, participants: 3 };
    expect(await fetchLeaderboardLifts(respond(200, { lifts: [lift] }))).toEqual({
      ok: true,
      value: [lift],
    });
  });

  it("says so when offline", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const result = await sendFriendRequest("bob", fetchImpl);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/No connection/);
  });

  it("words every request outcome", () => {
    expect(friendRequestMessage("not_found", "bo")).toBe("No one has the username @bo");
    expect(friendRequestMessage("accepted", "bob")).toBe("You and @bob are now friends");
  });
});
