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

  useEffect(() => {
    let cancelled = false;
    void fetchProfile().then((result) => {
      if (!cancelled && result.ok) setProfile(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-1">
      <Avatar
        username={profile?.username ?? null}
        avatar={profile?.avatar ?? null}
        className="mb-1 h-20 w-20 text-3xl"
      />
      <p className="text-xl font-semibold">{profile?.username ? `@${profile.username}` : " "}</p>
      <Link
        href="/profile/settings"
        className="text-xs font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
      >
        Edit profile and sharing
      </Link>
    </div>
  );
}
