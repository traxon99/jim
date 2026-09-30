/** One personal access token as Settings lists it (issue #246); never the token itself. */
export interface AccessTokenEntry {
  id: string;
  name: string;
  /** The token's first few characters, e.g. "jim_pat_Ab3x". */
  prefix: string;
  createdAt: string;
  /** Null never expires. */
  expiresAt: string | null;
  lastUsedAt: string | null;
}

/** A just-created token: the one time its plaintext is available. */
export interface CreatedAccessToken {
  entry: AccessTokenEntry;
  token: string;
}
