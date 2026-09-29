import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { AchievementsSection } from "@/components/profile/achievements-section";
import { BodyStatsSection } from "@/components/profile/body-stats-section";
import { FeedbackSection } from "@/components/profile/feedback-section";
import { UsernameSection } from "@/components/profile/username-section";
import { ChevronRight, Settings } from "lucide-react";
import Link from "next/link";

export function ProfileHome() {
  return (
    <main className="flex flex-1 flex-col">
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
      <div className={`items-center text-center ${PAGE_BODY}`}>
        <UsernameSection />
        <AchievementsSection />
        <BodyStatsSection />
        <Link
          href="/progression"
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Progression
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <FeedbackSection />
      </div>
    </main>
  );
}
