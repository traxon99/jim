"use client";

import { FLOATING_BUTTON, PageHeader } from "@/components/page-header";
import { useFriends } from "@/lib/friends/use-friends";
import { CircleUserRound, Settings, UsersRound } from "lucide-react";
import Link from "next/link";
import { FriendsFeed } from "./friends-feed";
import { HomeShortcuts, HomeSummary } from "./home-summary";

/**
 * The Home tab. It opens like a mini profile — your streak, this week and
 * your recent stats — then scrolls into your friends' workouts (issue #35).
 * Settings, Friends (badged with pending requests) and Profile are one tap
 * away from the buttons floating in the header, which blurs the page
 * scrolling under it (issues #311, #404).
 */
export function HomeScreen() {
  const { load } = useFriends();
  const username = load.status === "ready" ? load.username : null;
  const requests =
    load.status === "ready" ? load.friends.filter((f) => f.direction === "incoming").length : 0;
  const hasFriends = load.status === "ready" && load.friends.some((f) => f.status === "accepted");

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Home"
        actions={
          <>
            <Link
              href="/profile/settings?from=home"
              aria-label="Settings"
              data-ripple
              className={FLOATING_BUTTON}
            >
              <Settings className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </Link>
            {/* The badge sits beside the link, not in it: [data-ripple] clips its overflow. */}
            <span className="relative flex">
              <Link
                href="/friends"
                aria-label={requests > 0 ? `Friends, ${requests} new requests` : "Friends"}
                data-ripple
                className={FLOATING_BUTTON}
              >
                <UsersRound className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
              </Link>
              {requests > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold tabular-nums text-white"
                >
                  {requests}
                </span>
              )}
            </span>
            <Link href="/profile" aria-label="Profile" data-ripple className={FLOATING_BUTTON}>
              <CircleUserRound className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </>
        }
      />
      <HomeSummary username={username} />
      <div className="flex flex-1 flex-col gap-6 bg-zinc-100 pt-5 pb-6 dark:bg-zinc-900/50">
        <HomeShortcuts />
        <div className="px-4">
          <FriendsFeed hasFriends={hasFriends} />
        </div>
      </div>
    </main>
  );
}
