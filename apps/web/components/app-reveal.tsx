"use client";

import { useBootReady } from "@/lib/boot/use-boot-ready";

/**
 * Fades the app in as the boot splash (components/loading-screen.tsx) fades
 * out — both driven by the same `useBootReady` signal, so they crossfade
 * instead of the splash dissolving to reveal already-static content.
 */
export function AppReveal({ children }: { children: React.ReactNode }) {
  const ready = useBootReady();

  return (
    <div className="app-reveal flex min-h-0 flex-1 flex-col" data-ready={ready}>
      {children}
    </div>
  );
}
