import { DataSection } from "@/components/profile/data-section";
import { ProfilePictureSection } from "@/components/profile/profile-picture-section";
import { SettingsSubPage } from "@/components/profile/settings-sub-page";
import { UsernameSection } from "@/components/profile/username-section";
import { createClient } from "@/lib/supabase/server";

/** Settings → Account (issue #650): who you are, and your data. */
export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  return (
    <SettingsSubPage title="Account">
      <ProfilePictureSection />
      <UsernameSection />
      {userId && <DataSection userId={userId} />}
    </SettingsSubPage>
  );
}
