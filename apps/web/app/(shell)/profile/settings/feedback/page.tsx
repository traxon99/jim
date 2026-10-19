import { FeedbackSection } from "@/components/profile/feedback-section";
import { SettingsSubPage } from "@/components/profile/settings-sub-page";

/** Settings → Send feedback (issue #650). */
export default function FeedbackSettingsPage() {
  return (
    <SettingsSubPage title="Send feedback">
      <FeedbackSection />
    </SettingsSubPage>
  );
}
