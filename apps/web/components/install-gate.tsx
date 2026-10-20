"use client";

import { PORTAL_PATH, isInstallGateExempt } from "@/lib/pwa/install-gate-exempt";
import { takeEarlyInstallPrompt } from "@/lib/pwa/install-prompt";
import { type InstallPlatform, detectInstallPlatform } from "@/lib/pwa/platform";
import { STANDALONE_MEDIA_QUERY, isStandalone } from "@/lib/pwa/standalone";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type InstallState = "checking" | "installed" | "not-installed";

/** Platform-specific steps for getting the app onto the home screen. */
function InstallSteps({ platform }: { platform: InstallPlatform }) {
  if (platform === "ios") {
    return (
      <>
        <li>
          Tap <strong>Share</strong> in Safari (on iOS 26, tap <strong>•••</strong> first)
        </li>
        <li>
          Choose <strong>Add to Home Screen</strong>
        </li>
        <li>Open Jim from your home screen</li>
      </>
    );
  }

  if (platform === "android") {
    return (
      <>
        <li>
          Tap the <strong>⋮ menu</strong> in Chrome's toolbar
        </li>
        <li>
          Choose <strong>Install app</strong> (or <strong>Add to Home screen</strong>)
        </li>
        <li>Open Jim from your home screen</li>
      </>
    );
  }

  if (platform === "in-app") {
    // Instagram, Gmail and friends open links in their own browser, which
    // can't add to the home screen (#676).
    return (
      <>
        <li>
          Open this page in <strong>Safari</strong> (iPhone) or <strong>Chrome</strong> (Android):
          tap <strong>•••</strong> or the share icon, then <strong>Open in browser</strong>
        </li>
        <li>Add Jim to your home screen from there</li>
        <li>Open Jim from your home screen</li>
      </>
    );
  }

  return (
    <>
      <li>
        Open this page in <strong>Safari</strong> (iPhone/iPad) or <strong>Chrome</strong> (Android)
      </li>
      <li>Use that browser's menu to add Jim to your home screen</li>
      <li>Open Jim from your home screen</li>
    </>
  );
}

/** Chrome's install prompt event, which TypeScript's DOM types don't include. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * Hard-gates the app on home-screen install (ADR-010): iOS evicts storage
 * for non-installed web apps after 7 days, so nothing here should accept
 * data until installed. Not a dismissible banner.
 */
export function InstallGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InstallState>("checking");
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  // Android Chrome offers a one-tap install; keep its event for the button.
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const pathname = usePathname();
  // From the router, not window.location: during a client-side navigation
  // this renders before the URL bar updates, so window.location.search still
  // held the previous page's query and the gate stuck until a refresh (#444).
  const searchParams = useSearchParams();

  useEffect(() => {
    const update = () => setState(isStandalone() ? "installed" : "not-installed");
    update();
    setPlatform(
      detectInstallPlatform(window.navigator.userAgent, window.navigator.maxTouchPoints ?? 0),
    );

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    const early = takeEarlyInstallPrompt();
    if (early) setInstallPrompt(early as BeforeInstallPromptEvent);

    const query = window.matchMedia(STANDALONE_MEDIA_QUERY);
    query.addEventListener("change", update);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      query.removeEventListener("change", update);
    };
  }, []);

  if (state === "checking") return null;

  if (state === "not-installed" && isInstallGateExempt(pathname, searchParams.toString())) {
    return children;
  }

  if (state === "not-installed") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">Install Jim to continue</h1>
        <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
          Jim only works installed to your home screen — that's what keeps your training data from
          being cleared after a week away.
        </p>
        {installPrompt ? (
          <button
            type="button"
            onClick={() => {
              void installPrompt.prompt().catch(() => {});
              setInstallPrompt(null);
            }}
            className="min-h-11 w-full max-w-xs rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground"
          >
            Install Jim
          </button>
        ) : (
          <ol className="max-w-xs list-decimal space-y-1 pl-5 text-left text-sm text-zinc-600 dark:text-zinc-400">
            <InstallSteps platform={platform} />
          </ol>
        )}
        <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
          On a computer?{" "}
          <Link href={PORTAL_PATH} className="font-medium underline underline-offset-4">
            Open the web portal
          </Link>{" "}
          to analyze your training.
        </p>
      </div>
    );
  }

  return children;
}
