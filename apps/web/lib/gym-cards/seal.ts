import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * A gym card's code at rest (issue #878, ADR-026): AES-256-GCM under a key
 * derived from GYM_CARD_KEY, written `gc1.<iv>.<tag>.<ciphertext>`, each part
 * base64url. Server only: the push route seals before the row reaches
 * Postgres and the pull route opens it for the signed-in owner, so the
 * database, its backups and anything else that reads the table only ever
 * hold ciphertext. The card id is bound in as associated data, so a sealed
 * code copied onto another row doesn't open.
 */

const PREFIX = "gc1";

export class GymCardKeyMissingError extends Error {
  constructor() {
    super("Gym card sealing isn't configured");
  }
}

function key(secret: string): Buffer {
  return createHash("sha256").update(`jim-gym-cards:${secret}`).digest();
}

/** The configured secret, or null when the deploy has none. */
export function gymCardSecret(): string | null {
  const secret = process.env.GYM_CARD_KEY;
  return secret && secret.length >= 16 ? secret : null;
}

export function sealGymCardCode(code: string, cardId: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(cardId, "utf8"));
  const body = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [PREFIX, iv, cipher.getAuthTag(), body]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** The code, or null when the value isn't sealed for this card under this key. */
export function openGymCardCode(sealed: string, cardId: string, secret: string): string | null {
  const [prefix, iv, tag, body] = sealed.split(".");
  if (prefix !== PREFIX || !iv || !tag || body === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(cardId, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Pulled rows with their codes opened. A row whose code won't open (sealed
 * under an older key) is left out, so the phone keeps its own copy rather
 * than losing the code.
 */
export function openPulledGymCards<T extends { id: string; code: string }>(
  rows: readonly T[],
): T[] {
  if (rows.length === 0) return [];
  const secret = gymCardSecret();
  if (!secret) return [];
  const opened: T[] = [];
  for (const row of rows) {
    const code = openGymCardCode(row.code, row.id, secret);
    if (code !== null) opened.push({ ...row, code });
  }
  return opened;
}
