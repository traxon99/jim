import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Tokens at rest are AES-256-GCM under a key derived from STRAVA_TOKEN_KEY
// (issue #836): `v1.<iv>.<tag>.<ciphertext>`, each part base64url.

function key(secret: string): Buffer {
  return createHash("sha256").update(`jim-strava-tokens:${secret}`).digest();
}

export function encryptToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, body]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** The plaintext, or null when the value was tampered with or sealed under another key. */
export function decryptToken(sealed: string, secret: string): string | null {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || body === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

const STATE_TTL_MS = 10 * 60_000;

function stateMac(payload: string, secret: string): string {
  return createHmac("sha256", key(`${secret}:oauth-state`))
    .update(payload)
    .digest("base64url");
}

/** The OAuth `state`: the signed-in user's id and a timestamp, signed, so the callback can't be replayed for another account. */
export function signState(userId: string, secret: string, now = Date.now()): string {
  const payload = `${userId}.${now.toString(36)}.${randomBytes(6).toString("base64url")}`;
  return `${payload}.${stateMac(payload, secret)}`;
}

export function verifyState(
  state: string | null,
  userId: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!state) return false;
  const cut = state.lastIndexOf(".");
  if (cut < 0) return false;
  const payload = state.slice(0, cut);
  const given = Buffer.from(state.slice(cut + 1));
  const expected = Buffer.from(stateMac(payload, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const [stateUser, issued] = payload.split(".");
  if (stateUser !== userId || !issued) return false;
  const age = now - Number.parseInt(issued, 36);
  return age >= 0 && age <= STATE_TTL_MS;
}
