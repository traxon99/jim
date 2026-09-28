import { AchievementsSection } from "@/components/profile/achievements-section";
import { BodyStatsSection } from "@/components/profile/body-stats-section";
import { FeedbackSection } from "@/components/profile/feedback-section";
import { UsernameSection } from "@/components/profile/username-section";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import Link from "next/link";

export function ProfileHome() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-6 text-center">
      <div className="flex w-full max-w-xs flex-col items-start gap-2">
        <Link
          href="/home"
          className="flex min-h-11 items-center gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-500"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Home
        </Link>
        <div className="flex w-full items-center justify-between">
          <h1 className="text-xl font-semibold">Profile</h1>
          <Link
            href="/profile/settings"
            aria-label="Settings"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700"
          >
            <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <UsernameSection />
      <AchievementsSection />
      <BodyStatsSection />
      <Link
        href="/progression"
        className="flex min-h-11 w-full max-w-xs items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
      >
        Progression
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </Link>
      <FeedbackSection />
    </main>
  );
}
