import { describe, expect, it } from "vitest";
import { OFFLINE_MESSAGE, apiRequest } from "../client";

describe("apiRequest (#553)", () => {
  it("returns the body on success and sends JSON only with a body", async () => {
    let headers: HeadersInit | undefined;
    const fetchImpl = (async (_path: string, init?: RequestInit) => {
      headers = init?.headers;
      return Response.json({ id: "x" });
    }) as typeof fetch;
    expect(await apiRequest<{ id: string }>("/api/x", undefined, "nope", fetchImpl)).toEqual({
      ok: true,
      value: { id: "x" },
    });
    expect(headers).toBeUndefined();
  });

  it("uses the route's error, else the fallback", async () => {
    const withError = (async () =>
      Response.json({ error: "Taken" }, { status: 409 })) as typeof fetch;
    const without = (async () => new Response("oops", { status: 500 })) as typeof fetch;
    expect(await apiRequest("/api/x", undefined, "nope", withError)).toEqual({
      ok: false,
      error: "Taken",
    });
    expect(await apiRequest("/api/x", undefined, "nope", without)).toEqual({
      ok: false,
      error: "nope",
    });
  });

  it("says there's no connection when fetch throws", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await apiRequest("/api/x", undefined, "nope", offline)).toEqual({
      ok: false,
      error: OFFLINE_MESSAGE,
    });
  });
});
