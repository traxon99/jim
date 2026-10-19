import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { SETTINGS_BACK } from "@/lib/settings/menu";
import type { ReactNode } from "react";

/** The shell every Settings sub screen shares (issue #650): header with Back to Settings. */
export function SettingsSubPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title={title} back={SETTINGS_BACK} />
      <div className={`items-center ${PAGE_BODY}`}>{children}</div>
    </main>
  );
}
