"use client";

import { PORTAL_PATH, isInstallGateExempt } from "@/lib/pwa/install-gate-exempt";
import { type InstallPlatform, detectInstallPlatform } from "@/lib/pwa/platform";
import { STANDALONE_MEDIA_QUERY, isStandalone } from "@/lib/pwa/standalone";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type InstallState = "checking" | "installed" | "not-installed";

/** Platform-specific steps for getting the app onto the home screen. */
function InstallSteps({ platform }: { platform: InstallPlatform }) {
  if (platform === "ios") {
    return (
      <>
        <li>
          Tap the <strong>Share</strong> button in Safari's toolbar
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

/**
 * Hard-gates the app on home-screen install (ADR-010): iOS evicts storage
 * for non-installed web apps after 7 days, so nothing here should accept
 * data until installed. Not a dismissible banner.
 */
export function InstallGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InstallState>("checking");
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const pathname = usePathname();

  useEffect(() => {
    const update = () => setState(isStandalone() ? "installed" : "not-installed");
    update();
    setPlatform(detectInstallPlatform(window.navigator.userAgent));

    const query = window.matchMedia(STANDALONE_MEDIA_QUERY);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (state === "checking") return null;

  // `window` is safe here: state only leaves "checking" after mount. Read
  // directly rather than via useSearchParams, which would force every page
  // under the root layout into a Suspense boundary for one param.
  if (state === "not-installed" && isInstallGateExempt(pathname, window.location.search)) {
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
        <ol className="max-w-xs list-decimal space-y-1 pl-5 text-left text-sm text-zinc-600 dark:text-zinc-400">
          <InstallSteps platform={platform} />
        </ol>
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
