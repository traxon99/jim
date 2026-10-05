"use client";

import { Avatar } from "@/components/friends/avatar";
import { photoToAvatar } from "@/lib/friends/avatar-image";
import { fetchProfile, updateProfile } from "@/lib/friends/client";
import type { ProfilePayload } from "@/lib/friends/types";
import { Trash2 } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

/**
 * The profile picture friends see next to your posts and workouts (issue
 * #316). The photo is cropped to a square and shrunk on the phone, then
 * saved straight away, like the rest of Settings.
 */
export function ProfilePictureSection() {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchProfile().then((result) => {
      if (!cancelled && result.ok) setProfile(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(avatar: string | null) {
    const result = await updateProfile({ avatar });
    if (result.ok) setProfile(result.value);
    else setError(result.error);
  }

  async function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so picking the same photo again still fires a change.
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await save(await photoToAvatar(file));
    } catch {
      setError("That photo couldn't be read — try a different one");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    await save(null);
    setBusy(false);
  }

  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Profile picture
      </h2>
      <div className="flex items-center gap-3">
        <Avatar
          username={profile?.username ?? null}
          avatar={profile?.avatar ?? null}
          className="h-16 w-16 text-2xl"
        />
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <button
            type="button"
            disabled={profile === null || busy}
            onClick={() => inputRef.current?.click()}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            {busy ? "Saving…" : profile?.avatar ? "Change photo" : "Choose photo"}
          </button>
          {profile?.avatar && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove()}
              aria-label="Remove photo"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-500 disabled:opacity-50 dark:text-zinc-500"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handlePick(event)}
        />
      </div>
      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
