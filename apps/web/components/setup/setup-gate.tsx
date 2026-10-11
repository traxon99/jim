"use client";

import { db } from "@/lib/db/schema";
import { BASE_TABS } from "@/lib/navigation/tabs";
import { needsSetup } from "@/lib/settings/features";
import { SETUP_PATH } from "@/lib/setup/steps";
import { useLiveQuery } from "dexie-react-hooks";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// Once per app launch: leaving the walkthrough without finishing it (a tab,
// the back gesture) isn't sent straight back; it opens again next launch.
let opened = false;

/**
 * Opens the setup walkthrough (issue #464) for a new account, once settings
 * have loaded from the server. Only from a tab's home screen, so it never
 * pulls someone out of a workout or a share link they opened.
 */
export function SetupGate() {
  const row = useLiveQuery(() => db.settings.get("me"), []);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (opened || !needsSetup(row)) return;
    if (!(BASE_TABS as readonly string[]).includes(pathname)) return;
    opened = true;
    router.replace(SETUP_PATH);
  }, [row, pathname, router]);

  return null;
}
