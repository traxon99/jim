import { describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_PREFIX,
  accessTokenDisplayPrefix,
  accessTokenExpiresAt,
  accessTokenNameError,
  generateAccessToken,
  hashAccessToken,
  isAccessToken,
  isAccessTokenExpiryDays,
} from "../access-tokens";

describe("access tokens", () => {
  it("generates distinct, prefixed, URL-safe tokens", () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(a).not.toBe(b);
    expect(a.startsWith(ACCESS_TOKEN_PREFIX)).toBe(true);
    expect(a.slice(ACCESS_TOKEN_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isAccessToken(a)).toBe(true);
  });

  it("doesn't mistake a Supabase JWT for a token", () => {
    expect(isAccessToken("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig")).toBe(false);
  });

  it("hashes with SHA-256 to lowercase hex", async () => {
    expect(await hashAccessToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("keeps only a short display prefix", () => {
    expect(accessTokenDisplayPrefix("jim_pat_AbCdEfGh")).toBe("jim_pat_AbCd");
  });

  it("computes expiry from the offered choices only", () => {
    const now = new Date("2026-09-30T00:00:00Z");
    expect(accessTokenExpiresAt(30, now)?.toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(accessTokenExpiresAt(null, now)).toBeNull();
    expect(isAccessTokenExpiryDays(90)).toBe(true);
    expect(isAccessTokenExpiryDays(null)).toBe(true);
    expect(isAccessTokenExpiryDays(7)).toBe(false);
    expect(isAccessTokenExpiryDays("30")).toBe(false);
  });

  it("requires a short, non-blank name", () => {
    expect(accessTokenNameError("  ")).toBe("Give the token a name");
    expect(accessTokenNameError("x".repeat(61))).toMatch(/under 60/);
    expect(accessTokenNameError("Nightly script")).toBeNull();
  });
});
