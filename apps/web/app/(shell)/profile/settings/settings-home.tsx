import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { AccentColorSection } from "@/components/profile/accent-color-section";
import { ColorSchemeSection } from "@/components/profile/color-scheme-section";
import { ConnectClaudeSection } from "@/components/profile/connect-claude-section";
import { DataSection } from "@/components/profile/data-section";
import { FontFamilySection } from "@/components/profile/font-family-section";
import { PushNotificationsSection } from "@/components/profile/push-notifications-section";
import { WorkoutSection } from "@/components/profile/workout-section";
import { APP_VERSION } from "@/lib/version";
import { SignOutButton } from "./sign-out-button";

export function SettingsHome({ email, userId }: { email?: string; userId?: string }) {
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Settings" back={{ href: "/profile", label: "Profile" }} />
      <div className={`items-center text-center ${PAGE_BODY}`}>
        {email && <p className="text-sm text-zinc-600 dark:text-zinc-400">{email}</p>}
        <WorkoutSection />
        <ColorSchemeSection />
        <AccentColorSection />
        <FontFamilySection />
        <PushNotificationsSection />
        <ConnectClaudeSection />
        {userId && <DataSection userId={userId} />}
        <SignOutButton />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">Jim v{APP_VERSION}</p>
      </div>
    </main>
  );
}
