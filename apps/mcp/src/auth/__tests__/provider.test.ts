import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseOAuthProvider } from "../provider";
import { issuedAuthorizationCodes } from "../store";

const refreshSession = vi.fn();
const getClaims = vi.fn();
vi.mock("../supabase.js", () => ({
  getSupabase: () => ({ auth: { refreshSession, getClaims } }),
}));
vi.mock("../../db.js", () => ({ getDb: () => undefined }));

const client = {
  client_id: "client-1",
  redirect_uris: [],
} as unknown as OAuthClientInformationFull;
const provider = new SupabaseOAuthProvider();

beforeEach(() => {
  refreshSession.mockReset();
  getClaims.mockReset();
});

// Token refresh and code exchange (issue #541): every token is a Supabase
// session token, so a refresh must hand back Supabase's rotated pair.
describe("exchangeRefreshToken", () => {
  it("returns Supabase's rotated access and refresh tokens", async () => {
    refreshSession.mockResolvedValue({
      data: {
        session: { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 },
      },
      error: null,
    });
    await expect(provider.exchangeRefreshToken(client, "old-refresh")).resolves.toEqual({
      access_token: "new-access",
      refresh_token: "new-refresh",
      token_type: "bearer",
      expires_in: 3600,
    });
    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: "old-refresh" });
  });

  it("rejects a refresh token Supabase refuses as an invalid grant", async () => {
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid Refresh Token: Already Used" },
    });
    await expect(provider.exchangeRefreshToken(client, "used")).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
  });
});

describe("exchangeAuthorizationCode", () => {
  function issue(code: string) {
    issuedAuthorizationCodes.set(code, {
      clientId: "client-1",
      codeChallenge: "challenge",
      redirectUri: "https://client.example/callback",
      supabaseAccessToken: "access",
      supabaseRefreshToken: "refresh",
      createdAt: Date.now(),
    });
  }

  it("exchanges a code once for the Supabase session it was issued with", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { exp: Math.round(Date.now() / 1000) + 3600 } },
      error: null,
    });
    issue("code-1");
    const tokens = await provider.exchangeAuthorizationCode(
      client,
      "code-1",
      undefined,
      "https://client.example/callback",
    );
    expect(tokens).toMatchObject({ access_token: "access", refresh_token: "refresh" });
    await expect(provider.exchangeAuthorizationCode(client, "code-1")).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
  });

  it("refuses a code issued to another client or for another redirect", async () => {
    issue("code-2");
    const stranger = { ...client, client_id: "client-2" } as OAuthClientInformationFull;
    await expect(provider.exchangeAuthorizationCode(stranger, "code-2")).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
    issue("code-3");
    await expect(
      provider.exchangeAuthorizationCode(client, "code-3", undefined, "https://evil.example/cb"),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });
});
