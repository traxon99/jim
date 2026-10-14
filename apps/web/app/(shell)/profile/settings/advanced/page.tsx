import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { AdvancedSection } from "@/components/profile/advanced-section";
import { ConnectClaudeSection } from "@/components/profile/connect-claude-section";

/** Settings → Advanced (issue #640): feature switches, PRP and Connect Claude. */
export default function AdvancedSettingsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Advanced" back={{ href: "/profile/settings", label: "Settings" }} />
      <div className={`items-center ${PAGE_BODY}`}>
        <AdvancedSection />
        <ConnectClaudeSection />
      </div>
    </main>
  );
}
