import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { AccentColorSection } from "@/components/profile/accent-color-section";
import { BodyStatsSection } from "@/components/profile/body-stats-section";
import { CardStyleSection } from "@/components/profile/card-style-section";
import { ColorSchemeSection } from "@/components/profile/color-scheme-section";
import { ConnectClaudeSection } from "@/components/profile/connect-claude-section";
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
import { ChevronRight } from "lucide-react";
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
        {/* Moved from Profile (issue #331); every section here saves as you go. */}
        <ProfilePictureSection />
        <UsernameSection />
        <SharingSection />
        <SharedLinksSection />
        <BodyStatsSection userId={userId} />
        <WorkoutSection />
        <Link
          href="/progression"
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Progression
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <ColorSchemeSection />
        <AccentColorSection />
        <FontFamilySection />
        <CardStyleSection />
        <PushNotificationsSection />
        <ConnectClaudeSection />
        <FeedbackSection />
        {userId && <DataSection userId={userId} />}
        <SignOutButton />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">Jim v{APP_VERSION}</p>
      </div>
    </main>
  );
}
