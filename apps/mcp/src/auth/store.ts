import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

/** Time to complete the sign-in form, including a retry or two after a mistyped password. */
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

  /**
   * `/authorize` is unauthenticated, so entries that are never read back
   * would otherwise pile up (issue #536): each `set` sweeps expired ones,
   * and past `maxEntries` the oldest go first.
   */
  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 10_000,
  ) {}

  set(key: string, value: V): void {
    const now = Date.now();
    for (const [existingKey, existing] of this.entries) {
      // Insertion order is creation order, so the first live entry ends the sweep.
      if (now - existing.createdAt <= this.ttlMs) break;
      this.entries.delete(existingKey);
    }
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
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

export const pendingAuthorizations = new ExpiringStore<PendingAuthorization>(PENDING_TTL_MS);
export const issuedAuthorizationCodes = new ExpiringStore<IssuedAuthorizationCode>(CODE_TTL_MS);
