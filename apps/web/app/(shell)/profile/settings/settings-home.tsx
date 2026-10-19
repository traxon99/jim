import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { SettingsMenu } from "@/components/profile/settings-menu";
import { APP_VERSION } from "@/lib/version";
import { SignOutButton } from "./sign-out-button";

export function SettingsHome({
  email,
  fromHome = false,
}: {
  email?: string;
  /** Opened from Home's header (issue #404), so Back returns there instead of Profile. */
  fromHome?: boolean;
}) {
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Settings"
        back={fromHome ? { href: "/home", label: "Home" } : { href: "/profile", label: "Profile" }}
      />
      <div className={`items-center text-center ${PAGE_BODY}`}>
        {email && <p className="text-sm text-zinc-600 dark:text-zinc-400">{email}</p>}
        {/* Each group of settings has its own screen (issue #650). */}
        <SettingsMenu />
        <SignOutButton />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">Jim v{APP_VERSION}</p>
      </div>
    </main>
  );
}
