import { afterEach, describe, expect, it, vi } from "vitest";

const claims: { sub: string | undefined } = { sub: "11111111-1111-1111-1111-111111111111" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims } }) },
  }),
}));

const { GET } = await import("../route");

function get(query: string) {
  return GET(new Request(`http://localhost/api/places?q=${encodeURIComponent(query)}`));
}

const FEATURE = {
  properties: { name: "Iron Temple", housenumber: "1", street: "Main St", city: "Springfield" },
  geometry: { coordinates: [-89.65, 39.8] },
};

describe("GET /api/places (#462)", () => {
  afterEach(() => {
    claims.sub = "11111111-1111-1111-1111-111111111111";
    vi.unstubAllGlobals();
  });

  it("rejects an unauthenticated request", async () => {
    claims.sub = undefined;
    expect((await get("iron temple")).status).toBe(401);
  });

  it("returns nothing for a too-short query without calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await get("ab")).json()).toEqual({ places: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the places the lookup found", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ features: [FEATURE] })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await get("iron temple");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      places: [
        {
          name: "Iron Temple",
          address: "1 Main St, Springfield",
          latitude: 39.8,
          longitude: -89.65,
        },
      ],
    });
  });

  it("reports a lookup failure as 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    expect((await get("iron temple")).status).toBe(502);
  });
});
