import { AccentColorSection } from "@/components/profile/accent-color-section";
import { CardStyleSection } from "@/components/profile/card-style-section";
import { ColorSchemeSection } from "@/components/profile/color-scheme-section";
import { FontFamilySection } from "@/components/profile/font-family-section";
import { SettingsSubPage } from "@/components/profile/settings-sub-page";

/** Settings → Appearance (issue #650): theme, accent color, font and card style. */
export default function AppearanceSettingsPage() {
  return (
    <SettingsSubPage title="Appearance">
      <ColorSchemeSection />
      <AccentColorSection />
      <FontFamilySection />
      <CardStyleSection />
    </SettingsSubPage>
  );
}
