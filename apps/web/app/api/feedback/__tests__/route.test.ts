import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const claims: { sub: string | undefined; email?: string } = {
  sub: "11111111-1111-1111-1111-111111111111",
  email: "a@example.com",
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims } }) },
  }),
}));

const { POST } = await import("../route");

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/feedback", () => {
  const originalRepo = process.env.GITHUB_FEEDBACK_REPO;
  const originalToken = process.env.GITHUB_FEEDBACK_TOKEN;

  beforeEach(() => {
    claims.sub = "11111111-1111-1111-1111-111111111111";
    process.env.GITHUB_FEEDBACK_REPO = "acme/jim";
    process.env.GITHUB_FEEDBACK_TOKEN = "test-token";
  });

  afterEach(() => {
    process.env.GITHUB_FEEDBACK_REPO = originalRepo;
    process.env.GITHUB_FEEDBACK_TOKEN = originalToken;
    vi.unstubAllGlobals();
  });

  it("rejects an unauthenticated request", async () => {
    claims.sub = undefined;
    const response = await post({ message: "hello" });
    expect(response.status).toBe(401);
  });

  it("rejects an empty message", async () => {
    const response = await post({ message: "  " });
    expect(response.status).toBe(400);
  });

  it("files a GitHub issue and returns its URL", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      expect(url).toBe("https://api.github.com/repos/acme/jim/issues");
      return new Response(JSON.stringify({ html_url: "https://github.com/acme/jim/issues/1" }), {
        status: 201,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ message: "Add dark mode toggle" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ url: "https://github.com/acme/jim/issues/1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ authorization: "Bearer test-token" });
    const sentBody = JSON.parse(init?.body as string);
    expect(sentBody.title).toBe("Add dark mode toggle");
    expect(sentBody.body).toContain("a@example.com");
    expect(sentBody.labels).toEqual(["feedback"]);
  });

  it("returns 502 when GitHub rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 422 })),
    );
    const response = await post({ message: "hello" });
    expect(response.status).toBe(502);
  });

  it("returns 500 when feedback isn't configured", async () => {
    process.env.GITHUB_FEEDBACK_REPO = "";
    const response = await post({ message: "hello" });
    expect(response.status).toBe(500);
  });
});
