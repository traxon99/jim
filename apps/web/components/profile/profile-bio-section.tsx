"use client";

import { fetchProfile, updateProfile } from "@/lib/friends/client";
import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  bioError,
  displayNameError,
  normalizeBio,
  normalizeDisplayName,
} from "@jim/core";
import { useEffect, useState } from "react";

/** Display name and bio on Settings → Account (issues #751/#752). */
export function ProfileBioSection() {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProfile().then((result) => {
      if (!result.ok) return;
      setDisplayName(result.value.displayName ?? "");
      setBio(result.value.bio ?? "");
    });
  }, []);

  async function saveDisplayName() {
    const normalized = normalizeDisplayName(displayName);
    const invalid = normalized === "" ? null : displayNameError(normalized);
    if (invalid) {
      setError(invalid);
      return;
    }
    setStatus("saving");
    setError(null);
    const result = await updateProfile({ displayName: normalized === "" ? null : normalized });
    setStatus(result.ok ? "idle" : "error");
    if (!result.ok) setError(result.error);
  }

  async function saveBio() {
    const normalized = normalizeBio(bio);
    const invalid = normalized === "" ? null : bioError(normalized);
    if (invalid) {
      setError(invalid);
      return;
    }
    setStatus("saving");
    setError(null);
    const result = await updateProfile({ bio: normalized === "" ? null : normalized });
    setStatus(result.ok ? "idle" : "error");
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Display name
        <input
          type="text"
          value={displayName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          onChange={(event) => setDisplayName(event.target.value)}
          onBlur={() => void saveDisplayName()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal normal-case dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Bio
        <textarea
          value={bio}
          maxLength={BIO_MAX_LENGTH}
          rows={2}
          onChange={(event) => setBio(event.target.value)}
          onBlur={() => void saveBio()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal normal-case dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-500">{error}</p>}
      {status === "saving" && <p className="text-xs text-zinc-500 dark:text-zinc-500">Saving…</p>}
    </div>
  );
}
