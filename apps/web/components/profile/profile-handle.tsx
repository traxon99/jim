"use client";

import { Avatar } from "@/components/friends/avatar";
import { fetchProfile } from "@/lib/friends/client";
import type { ProfilePayload } from "@/lib/friends/types";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Your picture and @username at the top of Profile, read-only (issues #331,
 * #316): both are edited in Settings with the rest of your account details.
 */
export function ProfileHandle() {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // `attempt` re-runs the fetch from Try again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger
  useEffect(() => {
    let cancelled = false;
    void fetchProfile().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setLoadError(null);
        setProfile(result.value);
      } else setLoadError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="flex flex-col items-center gap-1">
      <Avatar
        username={profile?.username ?? null}
        avatar={profile?.avatar ?? null}
        className="mb-1 h-20 w-20 text-3xl"
      />
      <p className="text-xl font-semibold">{profile?.username ? `@${profile.username}` : " "}</p>
      {!profile && loadError && (
        <>
          <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{loadError}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="min-h-11 self-center rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
          >
            Try again
          </button>
        </>
      )}
      <Link
        href="/profile/settings"
        data-ripple
        className="text-xs font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
      >
        Edit profile and sharing
      </Link>
    </div>
  );
}
