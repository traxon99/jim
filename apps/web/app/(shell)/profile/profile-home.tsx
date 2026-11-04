import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { AchievementsSection } from "@/components/profile/achievements-section";
import { ProfileHandle } from "@/components/profile/profile-handle";
import { YourPostsSection } from "@/components/profile/your-posts-section";
import { ChevronRight, Settings } from "lucide-react";
import Link from "next/link";

export function ProfileHome() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Settings' gear moved here from Home's header (issue #747). */}
      <PageHeader
        title="Profile"
        back={{ href: "/home", label: "Home" }}
        actions={
          <Link
            href="/profile/settings"
            aria-label="Settings"
            data-ripple
            className={FLOATING_BUTTON}
          >
            <Settings className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        }
      />
      {/* Issue #331: Profile is yours to look at, not a settings screen —
          username, body stats, Progression and feedback moved to Settings. */}
      <div className={`items-center text-center ${PAGE_BODY}`}>
        <ProfileHandle />
        <Link
          href="/profile/weight"
          data-ripple
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Bodyweight
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <Link
          href="/profile/measurements"
          data-ripple
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Measurements
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <Link
          href="/profile/injuries"
          data-ripple
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Injuries
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <AchievementsSection />
        <YourPostsSection />
      </div>
    </main>
  );
}
