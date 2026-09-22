"use client";

import { registerBootTask } from "@/lib/boot/ready";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The four tabs someone actually bounces between during a session — Settings
// is left out since it's rarely the first thing opened after boot.
const BASE_ROUTES = ["/workout", "/routines", "/history", "/exercises"] as const;

// A gym is reliably signal-hostile (ADR-002), so a stalled fetch shouldn't
// hold the boot splash open indefinitely — give the warm-up a bounded window
// and move on regardless of how it finishes.
const READY_TIMEOUT_MS = 2500;

function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

/**
 * Warms the client router cache for every base tab as soon as the shell
 * mounts, so switching tabs after boot is instant instead of each one
 * fetching from scratch. Registers a boot task (lib/boot/ready.ts) so the
 * boot splash covers this real work instead of dismissing before any of it
 * has happened.
 */
export function PrefetchBaseRoutes() {
  const router = useRouter();

  useEffect(() => {
    const done = registerBootTask();

    for (const href of BASE_ROUTES) router.prefetch(href);

    void settleWithin(
      Promise.allSettled(BASE_ROUTES.map((href) => fetch(href))),
      READY_TIMEOUT_MS,
    ).finally(done);
  }, [router]);

  return null;
}
