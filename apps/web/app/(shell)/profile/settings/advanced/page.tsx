import { AdvancedSection } from "@/components/profile/advanced-section";
import { ConnectClaudeSection } from "@/components/profile/connect-claude-section";
import { SettingsSubPage } from "@/components/profile/settings-sub-page";

/** Settings → Advanced (issue #640): feature switches, PRP and Connect Claude. */
export default function AdvancedSettingsPage() {
  return (
    <SettingsSubPage title="Advanced">
      <AdvancedSection />
      <ConnectClaudeSection />
    </SettingsSubPage>
  );
}
