import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeAuth } from "../fake-auth";

const USER = { id: "00000000-0000-4000-8000-000000000de0", email: "dev@jim.test", password: "pw" };
const PORT = 54399;
const BASE = `http://127.0.0.1:${PORT}/auth/v1`;

let stop: () => Promise<void>;
beforeAll(async () => {
  stop = await startFakeAuth(USER, PORT);
});
afterAll(() => stop());

async function signIn(password: string) {
  return fetch(`${BASE}/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: USER.email, password }),
  });
}

describe("dev stack auth stand-in", () => {
  it("signs the seeded user in, and /user accepts that token", async () => {
    const session = await (await signIn("pw")).json();
    expect(session.user.id).toBe(USER.id);
    const user = await fetch(`${BASE}/user`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    expect(user.status).toBe(200);
  });

  it("rejects a wrong password and a token it didn't sign", async () => {
    expect((await signIn("nope")).status).toBe(400);
    const session = await (await signIn("pw")).json();
    const [header, payload] = session.access_token.split(".");
    const forged = await fetch(`${BASE}/user`, {
      headers: { authorization: `Bearer ${header}.${payload}.forged` },
    });
    expect(forged.status).toBe(401);
  });

  it("swaps a refresh token once", async () => {
    const session = await (await signIn("pw")).json();
    const refresh = () =>
      fetch(`${BASE}/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
    expect((await refresh()).status).toBe(200);
    expect((await refresh()).status).toBe(400);
  });
});
