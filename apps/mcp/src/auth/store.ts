import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

/** Time to complete the magic-link round trip: request it, open the inbox, click it. */
const PENDING_TTL_MS = 10 * 60 * 1000;
/** Authorization codes are single-use and exchanged within the same request/response cycle. */
const CODE_TTL_MS = 60 * 1000;

export interface PendingAuthorization {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
}

export interface IssuedAuthorizationCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  supabaseAccessToken: string;
  supabaseRefreshToken: string;
  createdAt: number;
}

/**
 * A TTL-bounded, single-use-on-`take` map. In-memory rather than persisted:
 * every entry here lives for at most a few minutes inside one login or code
 * exchange, and this process is expected to be long-running (the streamable
 * HTTP transport already keeps session state in memory the same way — see
 * apps/mcp/src/index.ts), not a serverless function recycled between these
 * two round trips.
 */
export class ExpiringStore<V extends { createdAt: number }> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly ttlMs: number) {}

  set(key: string, value: V): void {
    this.entries.set(key, value);
  }

  /** Non-destructive read — used where the same key is read more than once during a flow. */
  peek(key: string): V | undefined {
    const value = this.entries.get(key);
    if (!value) return undefined;
    if (Date.now() - value.createdAt > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return value;
  }

  /** Reads and removes in one step — used at the point a key is consumed for good. */
  take(key: string): V | undefined {
    const value = this.peek(key);
    this.entries.delete(key);
    return value;
  }
}

/** Dynamically registered OAuth clients (RFC 7591) — never expire; there's no client-secret rotation story here. */
export const clients = new Map<string, OAuthClientInformationFull>();

export const pendingAuthorizations = new ExpiringStore<PendingAuthorization>(PENDING_TTL_MS);
export const issuedAuthorizationCodes = new ExpiringStore<IssuedAuthorizationCode>(CODE_TTL_MS);
