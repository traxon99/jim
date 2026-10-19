import { PushNotificationsSection } from "@/components/profile/push-notifications-section";
import { SettingsSubPage } from "@/components/profile/settings-sub-page";

/** Settings → Notifications (issue #650). */
export default function NotificationsSettingsPage() {
  return (
    <SettingsSubPage title="Notifications">
      <PushNotificationsSection />
    </SettingsSubPage>
  );
}
