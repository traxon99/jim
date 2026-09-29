import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { AchievementsSection } from "@/components/profile/achievements-section";
import { ProfileHandle } from "@/components/profile/profile-handle";
import { Settings } from "lucide-react";
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
      {/* Issue #331: Profile is yours to look at, not a settings screen —
          username, body stats, Progression and feedback moved to Settings. */}
      <div className={`items-center text-center ${PAGE_BODY}`}>
        <ProfileHandle />
        <AchievementsSection />
      </div>
    </main>
  );
}
