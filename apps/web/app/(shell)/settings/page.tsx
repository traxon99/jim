import { PushNotificationsSection } from "@/components/settings/push-notifications-section";
import { SettingsForm } from "@/components/settings/settings-form";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        {data?.claims.email && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{data.claims.email}</p>
        )}
      </div>
      <SettingsForm />
      <PushNotificationsSection />
      <SignOutButton />
    </main>
  );
}
