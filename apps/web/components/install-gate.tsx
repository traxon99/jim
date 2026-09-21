"use client";

import { STANDALONE_MEDIA_QUERY, isStandalone } from "@/lib/pwa/standalone";
import { useEffect, useState } from "react";

type InstallState = "checking" | "installed" | "not-installed";

/**
 * Hard-gates the app on home-screen install (ADR-010): iOS evicts storage
 * for non-installed web apps after 7 days, so nothing here should accept
 * data until installed. Not a dismissible banner.
 */
export function InstallGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InstallState>("checking");

  useEffect(() => {
    const update = () => setState(isStandalone() ? "installed" : "not-installed");
    update();

    const query = window.matchMedia(STANDALONE_MEDIA_QUERY);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (state === "checking") return null;

  if (state === "not-installed") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">Install Jim to continue</h1>
        <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
          Jim only works installed to your home screen — that's what keeps your training data from
          being cleared after a week away.
        </p>
        <ol className="max-w-xs list-decimal space-y-1 pl-5 text-left text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            Tap the <strong>Share</strong> button in Safari's toolbar
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>
          </li>
          <li>Open Jim from your home screen</li>
        </ol>
      </div>
    );
  }

  return children;
}
