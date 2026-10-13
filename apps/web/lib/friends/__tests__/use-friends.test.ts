import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchFriends = vi.fn();
vi.mock("../client", () => ({ fetchFriends: () => fetchFriends() }));

const { getFriendsLoad, refreshFriends, subscribeFriends } = await import("../use-friends");

const payload = { username: "jim", friends: [] };

describe("shared friends state (#524)", () => {
  beforeEach(() => {
    fetchFriends.mockReset();
  });

  it("tells every subscriber when any screen refreshes", async () => {
    const home = vi.fn();
    const friends = vi.fn();
    const stopHome = subscribeFriends(home);
    const stopFriends = subscribeFriends(friends);

    fetchFriends.mockResolvedValue({ ok: true, value: payload });
    await refreshFriends();
    expect(getFriendsLoad()).toEqual({ status: "ready", ...payload });
    expect(home).toHaveBeenCalled();
    expect(friends).toHaveBeenCalled();

    // A failed refresh keeps what was already shown.
    fetchFriends.mockResolvedValue({ ok: false, error: "offline" });
    await refreshFriends();
    expect(getFriendsLoad()).toMatchObject({ status: "ready" });

    stopHome();
    stopFriends();
  });

  it("forgets the list once nothing shows it, so the next account starts clean", async () => {
    const stop = subscribeFriends(() => {});
    fetchFriends.mockResolvedValue({ ok: true, value: payload });
    await refreshFriends();
    stop();
    expect(getFriendsLoad()).toEqual({ status: "loading" });
  });
});
