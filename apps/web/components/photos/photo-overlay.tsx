"use client";

import { lockPageScroll } from "@/components/floating-card";
import { X } from "@/components/icons/solar";
import { type AnimationEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A full-screen overlay for the photo viewer and Compare, following docs/PWA.md
 * §2: portaled to <body>, page scroll locked, `touch-none` bars, safe areas
 * padded. It fades in and out like a sheet backdrop; the exit waits on
 * `animationend` with a timeout backstop, since iOS drops it when an animation
 * is interrupted, and skips straight to closing under reduced motion.
 */
export function PhotoOverlay({
  title,
  onClose,
  headerRight,
  children,
}: {
  title: string;
  onClose: () => void;
  headerRight?: ReactNode;
  /** Gets `close`, which plays the exit before calling onClose. */
  children: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) onClose();
    else setClosing(true);
  }, [onClose]);
  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (closing && event.target === event.currentTarget) onClose();
  };
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, 400);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  useEffect(() => lockPageScroll(), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    // z-20: a full-screen overlay, above the tab bar and in-flow chrome
    // (docs/PWA.md §4); the rest timer bar (z-10) and the sync slot sit below.
    <section
      aria-label={title}
      data-closing={closing}
      onAnimationEnd={handleAnimationEnd}
      className="sheet-backdrop safe-x fixed inset-0 z-20 flex flex-col overscroll-none bg-white dark:bg-zinc-950"
      style={{
        paddingTop: "var(--top-inset)",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex shrink-0 touch-none items-center justify-between gap-2 px-2 py-1">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="press flex min-h-11 min-w-11 items-center justify-center rounded-full"
        >
          <X className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-center text-base font-semibold">{title}</h2>
        <div className="flex min-w-11 items-center justify-end">{headerRight}</div>
      </div>
      {children}
    </section>,
    document.body,
  );
}
