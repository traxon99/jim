import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loginRoutes } from "../login-routes";
import { issuedAuthorizationCodes, pendingAuthorizations } from "../store";

const signInWithPassword = vi.fn();
vi.mock("../supabase.js", () => ({
  createSignInClient: () => ({ auth: { signInWithPassword } }),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(loginRoutes());
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  signInWithPassword.mockReset();
});

function startLogin(loginId: string): void {
  pendingAuthorizations.set(loginId, {
    client: { client_id: "client-1", client_name: "Claude", redirect_uris: [] },
    params: {
      redirectUri: "https://client.example/callback",
      codeChallenge: "challenge",
      state: "xyz",
    },
    createdAt: Date.now(),
  } as never);
}

function postLogin(fields: Record<string, string>): Promise<Response> {
  return fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

describe("POST /login", () => {
  it("issues an authorization code and redirects to the client on a correct password", async () => {
    startLogin("ok-login");
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "access", refresh_token: "refresh" } },
      error: null,
    });

    const res = await postLogin({ login: "ok-login", email: " me@example.com ", password: "pw" });

    expect(res.status).toBe(303);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "me@example.com", password: "pw" });
    const location = new URL(res.headers.get("location") as string);
    expect(location.origin + location.pathname).toBe("https://client.example/callback");
    expect(location.searchParams.get("state")).toBe("xyz");
    const code = issuedAuthorizationCodes.peek(location.searchParams.get("code") as string);
    expect(code).toMatchObject({
      clientId: "client-1",
      codeChallenge: "challenge",
      supabaseAccessToken: "access",
      supabaseRefreshToken: "refresh",
    });
    // The pending authorization is single-use.
    expect(pendingAuthorizations.peek("ok-login")).toBeUndefined();
  });

  it("re-renders the form on a wrong password and keeps the login retryable", async () => {
    startLogin("retry-login");
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: new Error("Invalid login credentials"),
    });

    const res = await postLogin({ login: "retry-login", email: "me@example.com", password: "no" });

    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain("Incorrect email or password.");
    expect(html).toContain('value="me@example.com"');
    expect(pendingAuthorizations.peek("retry-login")).toBeDefined();
  });

  it("rejects a missing password without calling Supabase", async () => {
    startLogin("empty-login");

    const res = await postLogin({ login: "empty-login", email: "me@example.com", password: "" });

    expect(res.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects an unknown or expired login id", async () => {
    const res = await postLogin({ login: "nope", email: "me@example.com", password: "pw" });

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("expired");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
