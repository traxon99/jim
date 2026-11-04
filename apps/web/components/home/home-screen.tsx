"use client";

import { FLOATING_BUTTON, PageHeader } from "@/components/page-header";
import { fetchActivity } from "@/lib/friends/client";
import { useFriends } from "@/lib/friends/use-friends";
import { Bell, CircleUserRound } from "lucide-react";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ActivitySheet } from "./activity-sheet";
import { FriendsFeed } from "./friends-feed";
import { HomeShortcuts, HomeSummary } from "./home-summary";
import { NewPostButton } from "./new-post-button";
import { WeekRingsStrip } from "./week-rings-strip";

/**
 * The Home tab. It opens like a mini profile — your streak, this week and
 * your recent stats — then scrolls into your friends' workouts (issue #35).
 * New post, the activity bell and Profile are one tap away in the header
 * (issues #311, #404, #747, #753).
 */
export function HomeScreen() {
  const { load } = useFriends();
  const username = load.status === "ready" ? load.username : null;
  const avatar = load.status === "ready" ? load.avatar : null;
  const hasFriends = load.status === "ready" && load.friends.some((f) => f.status === "accepted");
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityUnread, setActivityUnread] = useState(false);

  const refreshActivityUnread = useCallback(async () => {
    const result = await fetchActivity();
    if (result.ok) setActivityUnread(result.value.unread);
  }, []);

  useEffect(() => {
    void refreshActivityUnread();
    function onVisible() {
      if (document.visibilityState === "visible") void refreshActivityUnread();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshActivityUnread]);

  function closeActivity() {
    setActivityOpen(false);
    setActivityUnread(false);
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Home"
        actions={
          <>
            <NewPostButton />
            <span className="relative flex">
              <button
                type="button"
                aria-label={activityUnread ? "Activity, unread" : "Activity"}
                data-ripple
                className={FLOATING_BUTTON}
                onClick={() => setActivityOpen(true)}
              >
                <Bell className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
              </button>
              {activityUnread && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full bg-red-600"
                />
              )}
            </span>
            <Link href="/profile" aria-label="Profile" data-ripple className={FLOATING_BUTTON}>
              <CircleUserRound className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </>
        }
      />
      {activityOpen && <ActivitySheet onClose={closeActivity} />}
      <WeekRingsStrip />
      <HomeSummary username={username} avatar={avatar} />
      <div className="flex flex-1 flex-col gap-6 bg-zinc-100 pt-5 pb-6 dark:bg-zinc-900/50">
        <HomeShortcuts />
        <Suspense fallback={null}>
          <FriendsFeed hasFriends={hasFriends} />
        </Suspense>
      </div>
    </main>
  );
}
