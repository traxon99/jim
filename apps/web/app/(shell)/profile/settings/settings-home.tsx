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
        back={
          fromHome ? { href: "/home", label: "Friends" } : { href: "/profile", label: "Profile" }
        }
      />
      <div className={`items-center text-center ${PAGE_BODY}`}>
        {email && <p className="text-sm text-zinc-600 dark:text-zinc-400">{email}</p>}
        {/* Each group of settings has its own screen (issue #650). */}
        <SettingsMenu />
        <SignOutButton />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">Jim v{APP_VERSION}</p>
        {/* Solar is CC BY 4.0, which asks for a credit (#788). */}
        <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-500">
          Tab icons:{" "}
          <a
            href="https://www.figma.com/community/file/1166831539721848736"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Solar
          </a>{" "}
          by 480 Design,{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            CC BY 4.0
          </a>
        </p>
      </div>
    </main>
  );
}
