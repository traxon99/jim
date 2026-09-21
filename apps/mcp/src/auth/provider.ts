import { randomUUID } from "node:crypto";
import {
  InvalidClientError,
  InvalidGrantError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Response } from "express";
import { clients, issuedAuthorizationCodes, pendingAuthorizations } from "./store.js";
import { getSupabase } from "./supabase.js";

/**
 * OAuth 2.1 authorization server (ADR-006): this MCP server *is* the AS, but
 * it never issues its own credentials — every access/refresh token handed
 * out is literally the Supabase session token for the signed-in user, and
 * `verifyAccessToken` validates it the same way apps/web does (`getClaims`).
 * An MCP bug here is therefore bounded by RLS, exactly like the web app.
 *
 * The actual "prove who you are" step is a magic-link login page this
 * server renders itself (see pages.ts and login-routes.ts) — Supabase has
 * no hosted authorize page of its own to redirect to.
 */
export class SupabaseOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = {
    getClient(clientId: string): OAuthClientInformationFull | undefined {
      return clients.get(clientId);
    },
    registerClient(client: OAuthClientInformationFull): OAuthClientInformationFull {
      clients.set(client.client_id, client);
      return client;
    },
  };

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const loginId = randomUUID();
    pendingAuthorizations.set(loginId, { client, params, createdAt: Date.now() });
    res.redirect(302, `/login?login=${loginId}`);
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const entry = issuedAuthorizationCodes.peek(authorizationCode);
    if (!entry || entry.clientId !== client.client_id) {
      throw new InvalidGrantError("authorization code is invalid or expired");
    }
    return entry.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const entry = issuedAuthorizationCodes.take(authorizationCode);
    if (!entry || entry.clientId !== client.client_id) {
      throw new InvalidGrantError("authorization code is invalid or expired");
    }
    if (redirectUri !== undefined && redirectUri !== entry.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request");
    }

    return await tokensFor(entry.supabaseAccessToken, entry.supabaseRefreshToken);
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    const { data, error } = await getSupabase().auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session) {
      throw new InvalidGrantError(error?.message ?? "refresh token is invalid or expired");
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: "bearer",
      expires_in: data.session.expires_in,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const { data, error } = await getSupabase().auth.getClaims(token);
    if (error || !data?.claims) {
      throw new InvalidTokenError("access token is invalid or expired");
    }

    const { sub, email, exp } = data.claims;
    return {
      token,
      clientId: "supabase", // not meaningful here: every client shares the same Supabase-backed grant
      scopes: [],
      expiresAt: exp,
      extra: { userId: sub, email: email ?? "" },
    };
  }

  // No revokeToken: revoking an arbitrary user's Supabase session from here
  // would need either a service-role key (forbidden by ADR-006) or mutating
  // a shared client's session state, which isn't safe across concurrent
  // requests. Tokens still expire on Supabase's own short TTL.
}

async function tokensFor(accessToken: string, refreshToken: string): Promise<OAuthTokens> {
  const { data, error } = await getSupabase().auth.getClaims(accessToken);
  if (error || !data?.claims) {
    throw new InvalidClientError("could not read the issued session");
  }
  const expiresIn = Math.max(1, Math.round(data.claims.exp - Date.now() / 1000));

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: expiresIn,
  };
}
