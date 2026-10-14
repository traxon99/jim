import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { AccentColorSection } from "@/components/profile/accent-color-section";
import { BodyStatsSection } from "@/components/profile/body-stats-section";
import { CardStyleSection } from "@/components/profile/card-style-section";
import { ColorSchemeSection } from "@/components/profile/color-scheme-section";
import { DataSection } from "@/components/profile/data-section";
import { FeedbackSection } from "@/components/profile/feedback-section";
import { FontFamilySection } from "@/components/profile/font-family-section";
import { ProfilePictureSection } from "@/components/profile/profile-picture-section";
import { PushNotificationsSection } from "@/components/profile/push-notifications-section";
import { SharedLinksSection } from "@/components/profile/shared-links-section";
import { SharingSection } from "@/components/profile/sharing-section";
import { UsernameSection } from "@/components/profile/username-section";
import { WorkoutSection } from "@/components/profile/workout-section";
import { APP_VERSION } from "@/lib/version";
import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

export function SettingsHome({
  email,
  userId,
  fromHome = false,
}: {
  email?: string;
  userId?: string;
  /** Opened from Home's header (issue #404), so Back returns there instead of Profile. */
  fromHome?: boolean;
}) {
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Settings"
        back={fromHome ? { href: "/home", label: "Home" } : { href: "/profile", label: "Profile" }}
      />
      <div className={`items-center text-center ${PAGE_BODY}`}>
        {email && <p className="text-sm text-zinc-600 dark:text-zinc-400">{email}</p>}
        {/* Reruns the new-user walkthrough any time (issue #464). */}
        <Link
          href="/profile/setup?from=settings"
          data-ripple
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-zinc-300 px-4 py-2 text-left text-sm font-medium dark:border-zinc-700"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Sparkles
              className="h-4 w-4 shrink-0 text-accent"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-col">
              Setup walkthrough
              <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
                Home gym, program, PRP and theme in a few steps
              </span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        {/* Moved from Profile (issue #331); every section here saves as you go. */}
        <ProfilePictureSection />
        <UsernameSection />
        <SharingSection />
        <SharedLinksSection />
        <BodyStatsSection userId={userId} />
        <WorkoutSection />
        {/* Advanced features, PRP and Connect Claude live on their own page (issue #640). */}
        <Link
          href="/profile/settings/advanced"
          data-ripple
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-zinc-300 px-4 py-2 text-left text-sm font-medium dark:border-zinc-700"
        >
          <span className="flex min-w-0 flex-col">
            Advanced
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
              RPE, PRP, pace tracker, set types and Claude
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <Link
          href="/profile/gyms"
          data-ripple
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Gyms
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <ColorSchemeSection />
        <AccentColorSection />
        <FontFamilySection />
        <CardStyleSection />
        <PushNotificationsSection />
        <FeedbackSection />
        {userId && <DataSection userId={userId} />}
        <SignOutButton />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">Jim v{APP_VERSION}</p>
      </div>
    </main>
  );
}
