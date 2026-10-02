"use client";

import { SWITCH_CLASS } from "@/components/switch-class";
import { fetchProfile, updateProfile } from "@/lib/friends/client";
import type { ProfilePayload } from "@/lib/friends/types";
import { useEffect, useState } from "react";

type SharingPatch = Partial<Pick<ProfilePayload, "shareWorkouts" | "shareWorkoutDetails">>;

/**
 * What friends see of your training (issue #316), saved as you toggle. Posts
 * are shared one at a time on purpose, so they show whatever these say.
 */
export function SharingSection() {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchProfile().then((result) => {
      if (!cancelled && result.ok) setProfile(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(patch: SharingPatch) {
    if (!profile) return;
    const previous = profile;
    setError(null);
    setProfile({ ...profile, ...patch });
    const result = await updateProfile(patch);
    if (result.ok) {
      setProfile(result.value);
    } else {
      setProfile(previous);
      setError(result.error);
    }
  }

  const shareWorkouts = profile?.shareWorkouts ?? true;

  return (
    <div className="flex w-full flex-col gap-1 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Sharing
      </h2>
      <label className="flex min-h-11 items-center justify-between gap-3 text-xs font-medium">
        Show friends my finished workouts
        <input
          type="checkbox"
          role="switch"
          aria-checked={shareWorkouts}
          checked={shareWorkouts}
          disabled={profile === null}
          onChange={(event) => void save({ shareWorkouts: event.target.checked })}
          className={SWITCH_CLASS}
        />
      </label>
      <label
        className={`flex min-h-11 items-center justify-between gap-3 text-xs font-medium ${
          shareWorkouts ? "" : "opacity-50"
        }`}
      >
        Include exercises and weights
        <input
          type="checkbox"
          role="switch"
          aria-checked={profile?.shareWorkoutDetails ?? true}
          checked={profile?.shareWorkoutDetails ?? true}
          disabled={profile === null || !shareWorkouts}
          onChange={(event) => void save({ shareWorkoutDetails: event.target.checked })}
          className={SWITCH_CLASS}
        />
      </label>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Posts you share always show to your friends, whatever these are set to.
      </p>
      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
