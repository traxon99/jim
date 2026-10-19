import { SettingsSubPage } from "@/components/profile/settings-sub-page";
import { SharedLinksSection } from "@/components/profile/shared-links-section";
import { SharingSection } from "@/components/profile/sharing-section";

/** Settings → Social (issue #650): what friends see, and links you've shared. */
export default function SocialSettingsPage() {
  return (
    <SettingsSubPage title="Social">
      <SharingSection />
      <SharedLinksSection />
    </SettingsSubPage>
  );
}
