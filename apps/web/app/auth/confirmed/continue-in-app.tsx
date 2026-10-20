"use client";

import { isStandalone } from "@/lib/pwa/standalone";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Where the link did open in the installed app (Android can), carry on from here. */
export function ContinueInApp({ next }: { next: string }) {
  const [installed, setInstalled] = useState(false);
  useEffect(() => setInstalled(isStandalone()), []);
  if (!installed) return null;
  return (
    <Link
      href={next}
      className="flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
    >
      Continue to Jim
    </Link>
  );
}
