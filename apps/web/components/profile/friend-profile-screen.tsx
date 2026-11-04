"use client";

import { Avatar } from "@/components/friends/avatar";
import { FeedPost } from "@/components/home/feed-post";
import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { ProfileLiftHighlights } from "@/components/profile/profile-lift-highlights";
import { ProfilePostsGrid } from "@/components/profile/profile-posts-grid";
import { ProfileRecordsTab } from "@/components/profile/profile-records-tab";
import { ProfileStatRow } from "@/components/profile/profile-stat-row";
import { type ProfileTab, ProfileTabs } from "@/components/profile/profile-tabs";
import { ProfileWeekRing } from "@/components/profile/profile-week-ring";
import {
  fetchFriendPosts,
  fetchFriendProfile,
  fetchFriendRecords,
  fetchFriendWorkouts,
  removeFriend,
  toggleReaction,
} from "@/lib/friends/client";
import { type FeedItem, buildFeed } from "@/lib/friends/feed";
import { withReaction } from "@/lib/friends/format";
import type { FriendProfilePayload, FriendRecordRow, FriendWorkout } from "@/lib/friends/types";
import { weekActivity } from "@/lib/home/stats";
import { profileTilesFromFeed } from "@/lib/profile/post-tiles";
import { useToday } from "@/lib/pwa/use-today";
import { trainingStreak, weeklyStreakTarget } from "@jim/core";
import type { ReactionKind } from "@jim/core";
import { BarChart2, Bell, Check, Ellipsis } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

export function FriendProfileScreen({ username }: { username: string }) {
  const today = useToday();
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [profile, setProfile] = useState<FriendProfilePayload | null>(null);
  const [records, setRecords] = useState<FriendRecordRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [workouts, setWorkouts] = useState<FriendWorkout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<FriendWorkout | null>(null);

  const refresh = useCallback(async () => {
    const header = await fetchFriendProfile(username);
    if (!header.ok) {
      setError(header.error);
      return;
    }
    setProfile(header.value);
    setError(null);
    const [workoutResult, postResult, recordResult] = await Promise.all([
      fetchFriendWorkouts(header.value.userId),
      fetchFriendPosts(header.value.userId),
      fetchFriendRecords(username),
    ]);
    const workoutList = workoutResult.ok ? workoutResult.value : [];
    const postList = postResult.ok ? postResult.value : [];
    setWorkouts(workoutList);
    setFeed(buildFeed(workoutList, postList));
    setRecords(recordResult.ok ? recordResult.value : []);
  }, [username]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const streak = useMemo(() => {
    if (!profile) return null;
    return trainingStreak(
      profile.sessionDates.map((iso) => new Date(iso)),
      weeklyStreakTarget(null),
      profile.weekStart,
      today,
      profile.timeZone ?? undefined,
    );
  }, [profile, today]);

  const weekDays = useMemo(() => {
    if (!profile) return [];
    return weekActivity(
      profile.sessionDates.map((iso) => new Date(iso)),
      profile.weekStart,
      today,
    );
  }, [profile, today]);

  const streakWeeks = streak?.current ?? 0;

  const tiles = useMemo(() => profileTilesFromFeed(feed), [feed]);

  async function onRemoveFriend() {
    if (!profile) return;
    if (!window.confirm(`Remove @${profile.username} from your friends?`)) return;
    await removeFriend(profile.userId);
    window.history.back();
  }

  async function shareProfile() {
    if (!profile) return;
    const url = `${window.location.origin}/friends/${encodeURIComponent(profile.username)}`;
    if (navigator.share) {
      await navigator.share({ title: `@${profile.username} on Jim`, url });
    } else {
      await navigator.clipboard.writeText(url);
      window.alert("Profile link copied.");
    }
    setMenuOpen(false);
  }

  async function react(sessionId: string, current: FriendWorkout["reactions"], kind: ReactionKind) {
    const wasMine = current.some((reaction) => reaction.kind === kind && reaction.mine);
    setWorkouts((list) =>
      list.map((workout) =>
        workout.sessionId === sessionId
          ? { ...workout, reactions: withReaction(workout.reactions, kind, !wasMine) }
          : workout,
      ),
    );
    const result = await toggleReaction(sessionId, kind);
    if (result.ok) {
      setWorkouts((list) =>
        list.map((workout) =>
          workout.sessionId === sessionId
            ? { ...workout, reactions: withReaction(workout.reactions, kind, result.value) }
            : workout,
        ),
      );
    }
  }

  if (error) {
    return (
      <main className="flex flex-1 flex-col">
        <PageHeader title={username} back={{ href: "/friends", label: "Friends" }} />
        <p className="px-4 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">{error}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex flex-1 flex-col">
        <PageHeader title={username} back={{ href: "/friends", label: "Friends" }} />
        <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  const displayTitle = profile.displayName ?? `@${profile.username}`;
  const gymLine =
    profile.defaultGymName && profile.shareWorkouts && streak
      ? `${profile.defaultGymName} · ${streak.thisWeek} of ${streak.weeklyTarget} this week`
      : null;

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={profile.username}
        back={{ href: "/friends", label: "Friends" }}
        actions={
          <div className="relative">
            <button
              type="button"
              aria-label="More"
              data-ripple
              className={FLOATING_BUTTON}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Ellipsis className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className="absolute top-full right-0 z-10 mt-1 min-w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                <button
                  type="button"
                  className="flex w-full px-4 py-2.5 text-left text-sm"
                  onClick={() => void shareProfile()}
                >
                  Share profile
                </button>
                <button
                  type="button"
                  className="flex w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-500"
                  onClick={() => void onRemoveFriend()}
                >
                  Remove friend
                </button>
              </div>
            )}
          </div>
        }
      />
      <div className={`flex flex-col gap-4 ${PAGE_BODY}`}>
        <div className="flex w-full items-center gap-4 px-4">
          <ProfileWeekRing days={weekDays}>
            <Avatar
              username={profile.username}
              avatar={profile.avatar}
              className="h-16 w-16 text-2xl"
            />
          </ProfileWeekRing>
          <ProfileStatRow
            workouts={profile.workoutCount}
            friends={profile.friendCount}
            streakWeeks={streakWeeks}
          />
        </div>

        <div className="flex w-full flex-col gap-1 px-4 text-left">
          <p className="text-base font-semibold">{displayTitle}</p>
          {profile.bio && <p className="text-sm text-zinc-600 dark:text-zinc-400">{profile.bio}</p>}
          {gymLine && <p className="text-sm font-medium text-accent">🏋️ {gymLine}</p>}
        </div>

        <div className="flex w-full gap-2 px-4">
          <button
            type="button"
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-100 text-sm font-semibold dark:bg-zinc-900"
            onClick={() => setMenuOpen(true)}
          >
            <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Friends
          </button>
          <Link
            href="/portal/compare"
            data-ripple
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-100 text-sm font-semibold dark:bg-zinc-900"
          >
            <BarChart2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Compare
          </Link>
          <button
            type="button"
            aria-label="Follow their PRs"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900"
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <ProfileLiftHighlights lifts={profile.liftHighlights} />
        <ProfileTabs active={tab} onChange={setTab} showBody={false} />

        {tab === "posts" &&
          (profile.shareWorkouts || feed.length > 0 ? (
            <ProfilePostsGrid
              tiles={tiles}
              emptyMessage="No posts yet."
              onSelect={(tile) => {
                const workout = workouts.find((row) => row.sessionId === tile.id);
                if (workout) setSelectedWorkout(workout);
              }}
            />
          ) : (
            <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
              @{profile.username} turned workout sharing off.
            </p>
          ))}

        {tab === "records" && <ProfileRecordsTab mode="friend" friendRecords={records} />}
      </div>

      {selectedWorkout && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
          <button
            type="button"
            className="flex-1"
            aria-label="Close"
            onClick={() => setSelectedWorkout(null)}
          />
          <div className="max-h-[85vh] overflow-y-auto overscroll-contain bg-white dark:bg-zinc-950">
            <FeedPost
              item={{
                type: "workout",
                workout: selectedWorkout,
                post: null,
                at: selectedWorkout.endedAt,
              }}
              onReact={(sessionId, current, kind) => void react(sessionId, current, kind)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
