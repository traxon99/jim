import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loginRoutes } from "../login-routes";
import { issuedAuthorizationCodes, pendingAuthorizations } from "../store";

const signInWithPassword = vi.fn();
const getAuthenticatorAssuranceLevel = vi.fn();
const setSession = vi.fn();
const listFactors = vi.fn();
const challengeAndVerify = vi.fn();
vi.mock("../supabase.js", () => ({
  createSignInClient: () => ({
    auth: {
      signInWithPassword,
      setSession,
      mfa: { getAuthenticatorAssuranceLevel, listFactors, challengeAndVerify },
    },
  }),
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
  for (const mock of [signInWithPassword, setSession, listFactors, challengeAndVerify]) {
    mock.mockReset();
  }
  getAuthenticatorAssuranceLevel.mockReset();
  getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
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

function postCode(fields: Record<string, string>): Promise<Response> {
  return fetch(`${baseUrl}/login/code`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

describe("POST /login with an authenticator app (ADR-023)", () => {
  async function passwordStep(loginId: string): Promise<string> {
    startLogin(loginId);
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "aal1-access", refresh_token: "aal1-refresh" } },
      error: null,
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    const res = await postLogin({ login: loginId, email: "me@example.com", password: "pw" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('action="/login/code"');
    const match = html.match(/name="code_id" value="([^"]+)"/);
    return match?.[1] as string;
  }

  it("asks for the code before handing over an aal2 session", async () => {
    const codeId = await passwordStep("mfa-login");
    // No code is issued for the password-only session.
    expect(pendingAuthorizations.peek("mfa-login")).toBeUndefined();

    setSession.mockResolvedValue({ data: {}, error: null });
    listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });
    challengeAndVerify
      .mockResolvedValueOnce({ data: null, error: new Error("Invalid TOTP code") })
      .mockResolvedValueOnce({
        data: { access_token: "aal2-access", refresh_token: "aal2-refresh" },
        error: null,
      });

    const wrong = await postCode({ code_id: codeId, code: "000000" });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain("That code didn&#39;t work");

    const res = await postCode({ code_id: codeId, code: "123 456" });
    expect(res.status).toBe(303);
    expect(setSession).toHaveBeenCalledWith({
      access_token: "aal1-access",
      refresh_token: "aal1-refresh",
    });
    expect(challengeAndVerify).toHaveBeenLastCalledWith({ factorId: "factor-1", code: "123456" });
    const location = new URL(res.headers.get("location") as string);
    expect(location.searchParams.get("state")).toBe("xyz");
    expect(
      issuedAuthorizationCodes.peek(location.searchParams.get("code") as string),
    ).toMatchObject({ supabaseAccessToken: "aal2-access", supabaseRefreshToken: "aal2-refresh" });

    // The code step is single-use too.
    expect((await postCode({ code_id: codeId, code: "123456" })).status).toBe(400);
  });

  it("rejects a malformed code without calling Supabase", async () => {
    const codeId = await passwordStep("mfa-bad");
    const res = await postCode({ code_id: codeId, code: "12ab" });
    expect(res.status).toBe(401);
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });
});

describe("GET /login", () => {
  it("can't be framed by another site and names the redirect host (#509)", async () => {
    startLogin("frame-login");
    const res = await fetch(`${baseUrl}/login?login=frame-login`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(await res.text()).toContain("<strong>client.example</strong>");
  });
});
