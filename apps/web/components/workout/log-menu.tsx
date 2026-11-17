"use client";

import { Bandage, type IconComponent, Scale, Thermometer } from "@/components/icons/solar";
import { useSickDayAction } from "@/components/sick-days/sick-day-controls";
import { useTodayKey } from "@/lib/injuries/use-injuries";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/** Matches `.menu-popover[data-closing]` in globals.css (ANIMATION.md rule 15). */
const EXIT_MS = 160;

const ITEM =
  "flex min-h-12 w-full items-center gap-3 px-4 text-left text-base font-semibold text-zinc-950 disabled:opacity-50 dark:text-zinc-50";

function ItemBody({ icon: Icon, label }: { icon: IconComponent; label: string }) {
  return (
    <>
      <Icon className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </>
  );
}

/**
 * Lift's Log tile (issue #823), in place of the old Sick day tile: a menu to
 * log a weigh-in, an injury's status or a sick day. It sits at the right of
 * its row, so it anchors `right-0` and grows from the top right (PWA.md §3,
 * ANIMATION.md rules 10–12).
 */
export function LogMenu({
  userId,
  sickToday,
  className,
  content,
}: {
  userId: string;
  /** Hides "Log sick day" once today is already marked (the card above unmarks it). */
  sickToday: boolean | undefined;
  className: string;
  content: React.ReactNode;
}) {
  const today = useTodayKey();
  const { busy, error, set } = useSickDayAction(userId, today);
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const rootRef = useRef<HTMLDivElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback((animate = true) => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    if (!animate) {
      setPhase("closed");
      return;
    }
    setPhase((current) => (current === "open" ? "closing" : current));
    exitTimer.current = setTimeout(() => setPhase("closed"), EXIT_MS);
  }, []);

  // Lift stays mounted while hidden (PWA.md §8): closing on cleanup means the
  // menu isn't still open when the tab comes back.
  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setPhase("closed");
    },
    [],
  );

  useEffect(() => {
    if (phase !== "open") return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [phase, close]);

  function toggle() {
    if (phase === "open") close();
    else {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setPhase("open");
    }
  }

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={phase === "open"}
        aria-label="Log weight, injury status or a sick day"
        className={className}
      >
        {content}
      </button>
      {phase !== "closed" && (
        <div
          role="menu"
          data-closing={phase === "closing" ? "true" : undefined}
          className="menu-popover absolute top-full right-0 z-10 mt-1 flex max-h-[calc(100vh-2rem)] w-64 max-w-[calc(100vw-2rem)] origin-top-right flex-col divide-y divide-zinc-200 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:divide-zinc-700 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <Link
            href="/profile/weight"
            role="menuitem"
            onClick={() => close(false)}
            className={ITEM}
          >
            <ItemBody icon={Scale} label="Log weight" />
          </Link>
          <Link
            href="/profile/injuries"
            role="menuitem"
            onClick={() => close(false)}
            className={ITEM}
          >
            <ItemBody icon={Bandage} label="Log injury status" />
          </Link>
          {sickToday === false && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                close();
                void set(true);
              }}
              className={ITEM}
            >
              <ItemBody icon={Thermometer} label="Log sick day" />
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
