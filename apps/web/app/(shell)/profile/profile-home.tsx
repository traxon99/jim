"use client";

import { Avatar } from "@/components/friends/avatar";
import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { ProfileBodyTab } from "@/components/profile/profile-body-tab";
import { ProfileLiftHighlights } from "@/components/profile/profile-lift-highlights";
import { ProfilePostsGrid } from "@/components/profile/profile-posts-grid";
import { ProfileRecordsTab } from "@/components/profile/profile-records-tab";
import { ProfileStatRow } from "@/components/profile/profile-stat-row";
import { type ProfileTab, ProfileTabs } from "@/components/profile/profile-tabs";
import { ProfileWeekRing } from "@/components/profile/profile-week-ring";
import { ShareProfileSheet } from "@/components/profile/share-profile-sheet";
import { fetchOwnPosts, fetchProfile } from "@/lib/friends/client";
import type { ProfileLiftHighlight, ProfilePayload } from "@/lib/friends/types";
import { ownLiftHighlights } from "@/lib/profile/lift-highlights";
import { useOwnProfileHeader } from "@/lib/profile/own-stats";
import { profileTilesFromOwnPosts } from "@/lib/profile/post-tiles";
import { useToday } from "@/lib/pwa/use-today";
import { Lock, Pencil, Send, Settings, UserPlus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export function ProfileHome() {
  const today = useToday();
  const searchParams = useSearchParams();
  const header = useOwnProfileHeader(today);
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [lifts, setLifts] = useState<ProfileLiftHighlight[]>([]);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("share") === "1") setShareOpen(true);
  }, [searchParams]);

  useEffect(() => {
    void fetchProfile().then((result) => {
      if (result.ok) setProfile(result.value);
    });
    void ownLiftHighlights(header.settings.units, today).then(setLifts);
  }, [header.settings.units, today]);

  const [tiles, setTiles] = useState<ReturnType<typeof profileTilesFromOwnPosts>>([]);
  useEffect(() => {
    void fetchOwnPosts().then((result) => {
      if (result.ok) setTiles(profileTilesFromOwnPosts(result.value));
    });
  }, []);

  const displayName = profile?.displayName ?? null;
  const bio = profile?.bio ?? null;
  const gymLine = header.defaultGym
    ? `${header.defaultGym.name} · ${header.thisWeek} of ${header.weeklyTarget} this week`
    : null;

  const navTitle = header.username ?? "Profile";

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={navTitle}
        back={{ href: "/home", label: "Home" }}
        actions={
          <>
            {header.sharePrivate && (
              <span
                className="flex min-h-11 min-w-11 items-center justify-center"
                aria-label="Private profile"
              >
                <Lock
                  className="h-5 w-5 text-zinc-600 dark:text-zinc-400"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
            )}
            <Link
              href="/profile/settings"
              aria-label="Settings"
              data-ripple
              className={FLOATING_BUTTON}
            >
              <Settings className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </>
        }
      />
      <div className={`flex flex-col gap-4 ${PAGE_BODY}`}>
        <div className="flex w-full items-center gap-4 px-4">
          <ProfileWeekRing days={header.weekDays}>
            <Avatar
              username={header.username}
              avatar={header.avatar}
              className="h-16 w-16 text-2xl"
            />
          </ProfileWeekRing>
          <ProfileStatRow
            workouts={header.workoutCount}
            friends={header.friendCount}
            streakWeeks={header.streakWeeks}
          />
        </div>

        <div className="flex w-full flex-col gap-1 px-4 text-left">
          <p className="text-base font-semibold">
            {displayName ?? (header.username ? `@${header.username}` : "You")}
          </p>
          {bio && <p className="text-sm text-zinc-600 dark:text-zinc-400">{bio}</p>}
          {gymLine && (
            <Link href="/profile/gyms" className="text-sm font-medium text-accent">
              🏋️ {gymLine}
            </Link>
          )}
        </div>

        <div className="flex w-full gap-2 px-4">
          <Link
            href="/profile/settings/account"
            data-ripple
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-100 text-sm font-semibold dark:bg-zinc-900"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Edit profile
          </Link>
          <button
            type="button"
            data-ripple
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-100 text-sm font-semibold dark:bg-zinc-900"
            onClick={() => setShareOpen(true)}
          >
            <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Share profile
          </button>
          <Link
            href="/friends"
            aria-label="Add friend"
            data-ripple
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900"
          >
            <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>

        <ProfileLiftHighlights lifts={lifts} />
        <ProfileTabs active={tab} onChange={setTab} showBody />
        {tab === "posts" && (
          <ProfilePostsGrid
            tiles={tiles}
            emptyMessage="Share a workout or PR to fill your Posts tab."
          />
        )}
        {tab === "records" && <ProfileRecordsTab mode="own" />}
        {tab === "body" && <ProfileBodyTab />}
      </div>
      <ShareProfileSheet open={shareOpen} onClose={() => setShareOpen(false)} />
    </main>
  );
}
