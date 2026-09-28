"use client";

import { fetchFriends, updateUsername } from "@/lib/friends/client";
import { normalizeUsername, usernameError } from "@jim/core";
import { type FormEvent, useEffect, useState } from "react";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * The username friends add you by (issue #35). Everyone starts with the part
 * of their email before the @; this lets them pick something else.
 */
export function UsernameSection() {
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFriends().then((result) => {
      if (cancelled || !result.ok) return;
      setSaved(result.value.username);
      setValue(result.value.username ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const normalized = normalizeUsername(value);
  const unchanged = normalized === (saved ?? "");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid = usernameError(normalized);
    if (invalid) {
      setStatus("error");
      setError(invalid);
      return;
    }
    setStatus("saving");
    setError(null);
    const result = await updateUsername(normalized);
    if (result.ok) {
      setSaved(result.value);
      setValue(result.value);
      setStatus("saved");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex w-full max-w-xs flex-col gap-2 text-left"
    >
      <label
        htmlFor="username"
        className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500"
      >
        Username
      </label>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-zinc-300 bg-white pl-3 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="text-base text-zinc-500 dark:text-zinc-500" aria-hidden="true">
            @
          </span>
          <input
            id="username"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (status !== "saving") setStatus("idle");
            }}
            placeholder={saved === null ? "Loading…" : "username"}
            disabled={saved === null}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-2 pr-3 text-base text-zinc-950 outline-none dark:text-zinc-50"
          />
        </div>
        <button
          type="submit"
          disabled={saved === null || unchanged || status === "saving"}
          className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Friends add you by this exact name from Home.
      </p>
      {status === "error" && error && (
        <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>
      )}
      {status === "saved" && (
        <p className="text-xs text-emerald-600 dark:text-emerald-500">Username saved.</p>
      )}
    </form>
  );
}
