import { AccentColorSection } from "@/components/profile/accent-color-section";
import { ColorSchemeSection } from "@/components/profile/color-scheme-section";
import { ConnectClaudeSection } from "@/components/profile/connect-claude-section";
import { DataSection } from "@/components/profile/data-section";
import { FontFamilySection } from "@/components/profile/font-family-section";
import { PushNotificationsSection } from "@/components/profile/push-notifications-section";
import { WorkoutSection } from "@/components/profile/workout-section";
import { APP_VERSION } from "@/lib/version";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

export function SettingsHome({ email, userId }: { email?: string; userId?: string }) {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-4 text-center">
      <div className="flex w-full flex-col items-start gap-2">
        <Link
          href="/profile"
          className="flex min-h-11 items-center gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-500"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Profile
        </Link>
        <h1 className="text-xl font-semibold">Settings</h1>
        {email && <p className="text-sm text-zinc-600 dark:text-zinc-400">{email}</p>}
      </div>
      <WorkoutSection />
      <ColorSchemeSection />
      <AccentColorSection />
      <FontFamilySection />
      <PushNotificationsSection />
      <ConnectClaudeSection />
      {userId && <DataSection userId={userId} />}
      <SignOutButton />
      <p className="text-xs text-zinc-500 dark:text-zinc-500">Jim v{APP_VERSION}</p>
    </main>
  );
}
