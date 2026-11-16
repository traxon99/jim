"use client";

import { takeResetNotice } from "@/lib/pwa/remote-commands";
import { useEffect, useState } from "react";

/** How long the one line stays after a reset (issue #808). */
const NOTICE_MS = 6000;

/**
 * The one line an admin's "Reset local data" leaves on the next open
 * (issue #808): the wipe ran in the background, so this says why the app
 * just pulled everything again.
 */
export function ResetNotice() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!takeResetNotice()) return;
    setShown(true);
    const timer = setTimeout(() => setShown(false), NOTICE_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <output className="block px-4 py-1 text-center text-xs text-zinc-500 dark:text-zinc-500">
      Data refreshed from the server
    </output>
  );
}
