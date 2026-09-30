"use client";

import {
  createAccessToken,
  fetchAccessTokens,
  revokeAccessToken,
} from "@/lib/access-tokens/client";
import {
  describeExpiry,
  describeLastUsed,
  expiryLabel,
  isExpired,
} from "@/lib/access-tokens/format";
import type { AccessTokenEntry, CreatedAccessToken } from "@/lib/access-tokens/types";
import { claudeCodeAddCommandWithToken } from "@/lib/mcp/connect";
import {
  ACCESS_TOKEN_EXPIRY_DAYS,
  ACCESS_TOKEN_NAME_MAX_LENGTH,
  type AccessTokenExpiryDays,
  accessTokenNameError,
} from "@jim/core";
import { type FormEvent, useEffect, useState } from "react";
import { CopyField } from "./copy-field";

const DEFAULT_EXPIRY: AccessTokenExpiryDays = 90;

/**
 * Settings → Connect Claude → Access tokens (issue #246): bearer tokens for
 * scripts and MCP clients that can't sign in with OAuth. A new token's
 * plaintext is shown once, right after it's created; the list only ever has
 * its first few characters.
 */
export function AccessTokensSection({ endpoint }: { endpoint: string }) {
  const [tokens, setTokens] = useState<AccessTokenEntry[] | null>(null);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<AccessTokenExpiryDays>(DEFAULT_EXPIRY);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedAccessToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAccessTokens().then((result) => {
      if (cancelled) return;
      if (result.ok) setTokens(result.value);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    const invalid = accessTokenNameError(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setCreating(true);
    setError(null);
    const result = await createAccessToken(name.trim(), expiry);
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreated(result.value);
    setTokens((current) => [result.value.entry, ...(current ?? [])]);
    setName("");
  }

  async function handleRevoke(token: AccessTokenEntry) {
    if (!confirm(`Revoke "${token.name}"? Anything using it stops working right away.`)) return;
    setError(null);
    const result = await revokeAccessToken(token.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTokens((current) => (current ?? []).filter((entry) => entry.id !== token.id));
    if (created?.entry.id === token.id) setCreated(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs text-zinc-500 dark:text-zinc-500">Access tokens</h3>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        For scripts and MCP clients that can't sign in. A token can do anything the connector can,
        so keep it secret and revoke it when you're done with it.
      </p>

      <form onSubmit={(event) => void handleCreate(event)} className="flex flex-col gap-2">
        <input
          aria-label="Token name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name, e.g. Nightly script"
          maxLength={ACCESS_TOKEN_NAME_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="done"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <div className="flex gap-2">
          <select
            aria-label="Expires after"
            value={expiry === null ? "never" : String(expiry)}
            onChange={(event) =>
              setExpiry(
                event.target.value === "never"
                  ? null
                  : (Number(event.target.value) as AccessTokenExpiryDays),
              )
            }
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {ACCESS_TOKEN_EXPIRY_DAYS.map((days) => (
              <option key={days ?? "never"} value={days === null ? "never" : String(days)}>
                {expiryLabel(days)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creating || name.trim() === ""}
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create token"}
          </button>
        </div>
      </form>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}

      {created && (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-600/40 p-3 dark:border-emerald-500/40">
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Copy &ldquo;{created.entry.name}&rdquo; now. You won&rsquo;t be able to see it again.
          </p>
          <CopyField label="Token" value={created.token} />
          <CopyField
            label="Claude Code"
            value={claudeCodeAddCommandWithToken(endpoint, created.token)}
          />
        </div>
      )}

      {tokens !== null && tokens.length > 0 && (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center gap-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-zinc-950 dark:text-zinc-50">
                  {token.name}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  <code>{token.prefix}…</code> ·{" "}
                  <span className={isExpired(token) ? "text-red-600 dark:text-red-500" : undefined}>
                    {describeExpiry(token)}
                  </span>{" "}
                  · {describeLastUsed(token)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleRevoke(token)}
                aria-label={`Revoke ${token.name}`}
                className="min-h-11 rounded-lg px-2 text-sm text-red-600 dark:text-red-500"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
