import { ColorSchemeSection } from "@/components/profile/color-scheme-section";
import { ProfileForm } from "@/components/profile/profile-form";
import { PushNotificationsSection } from "@/components/profile/push-notifications-section";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Profile</h1>
        {data?.claims.email && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{data.claims.email}</p>
        )}
      </div>
      <ProfileForm />
      <ColorSchemeSection />
      <PushNotificationsSection />
      <SignOutButton />
    </main>
  );
}
