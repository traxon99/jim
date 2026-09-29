"use client";

import { fetchFriends } from "@/lib/friends/client";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Your @username at the top of Profile, read-only (issue #331): it's edited
 * in Settings with the rest of your account details.
 */
export function ProfileHandle() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFriends().then((result) => {
      if (!cancelled && result.ok) setUsername(result.value.username);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-xl font-semibold">{username ? `@${username}` : "\u00a0"}</p>
      <Link
        href="/profile/settings"
        className="text-xs font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
      >
        Edit profile and body stats
      </Link>
    </div>
  );
}
