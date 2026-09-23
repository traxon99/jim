import { AccentColorSection } from "@/components/profile/accent-color-section";
import { BodyStatsSection } from "@/components/profile/body-stats-section";
import { ColorSchemeSection } from "@/components/profile/color-scheme-section";
import { FeedbackSection } from "@/components/profile/feedback-section";
import { FontFamilySection } from "@/components/profile/font-family-section";
import { ProfileForm } from "@/components/profile/profile-form";
import { PushNotificationsSection } from "@/components/profile/push-notifications-section";
import { APP_VERSION } from "@/lib/version";
import { SignOutButton } from "./sign-out-button";

export function ProfileHome({ email }: { email?: string }) {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Profile</h1>
        {email && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{email}</p>}
      </div>
      <ProfileForm />
      <BodyStatsSection />
      <ColorSchemeSection />
      <AccentColorSection />
      <FontFamilySection />
      <PushNotificationsSection />
      <FeedbackSection />
      <SignOutButton />
      <p className="text-xs text-zinc-500 dark:text-zinc-500">Jim v{APP_VERSION}</p>
    </main>
  );
}
