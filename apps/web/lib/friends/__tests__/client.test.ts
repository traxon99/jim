import { describe, expect, it, vi } from "vitest";
import { friendRequestMessage, sendFriendRequest, toggleReaction, updateUsername } from "../client";

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
    expect(await toggleReaction("s1", "fire", fetchImpl)).toEqual({ ok: true, value: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/friends/reactions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "s1", kind: "fire" }),
      }),
    );
  });

  it("surfaces the server's error message", async () => {
    const result = await updateUsername("bob", respond(409, { error: "That username is taken" }));
    expect(result).toEqual({ ok: false, error: "That username is taken" });
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
