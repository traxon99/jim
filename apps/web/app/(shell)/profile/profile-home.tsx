import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { AchievementsSection } from "@/components/profile/achievements-section";
import { ProfileHandle } from "@/components/profile/profile-handle";
import { YourPostsSection } from "@/components/profile/your-posts-section";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function ProfileHome() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Settings' gear lives on Home's header now (issue #404). */}
      <PageHeader title="Profile" back={{ href: "/home", label: "Home" }} />
      {/* Issue #331: Profile is yours to look at, not a settings screen —
          username, body stats, Progression and feedback moved to Settings. */}
      <div className={`items-center text-center ${PAGE_BODY}`}>
        <ProfileHandle />
        <Link
          href="/profile/weight"
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Bodyweight
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <AchievementsSection />
        <YourPostsSection />
      </div>
    </main>
  );
}
