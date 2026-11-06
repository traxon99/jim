"use client";

import { SharedLinksSection } from "@/components/profile/shared-links-section";
import { SharingSection } from "@/components/profile/sharing-section";
import { X } from "lucide-react";
import { useEffect } from "react";

/**
 * What used to live under Settings → Social (issue #752): sharing switches
 * and shared workout links, opened from Share profile on your profile page.
 */
export function ShareProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const previousHtml = document.documentElement.style.overflow;
    const previousBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousHtml;
      document.body.style.overflow = previousBody;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="safe-x fixed inset-0 z-50 flex flex-col overscroll-none bg-white dark:bg-zinc-950"
      style={{
        paddingTop: "var(--top-inset)",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      <header className="flex shrink-0 touch-none items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Share profile</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg"
        >
          <X className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-4">
        <SharingSection />
        <SharedLinksSection />
      </div>
    </div>
  );
}
