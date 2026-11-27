"use client";

import { lockPageScroll } from "@/components/floating-card";
import { Pencil, X } from "@/components/icons/solar";
import type { GymCardRow } from "@/lib/db/schema";
import { useWakeLock } from "@/lib/wake-lock";
import { type GymCardFormat, gymCardMonogram, isSquareFormat } from "@jim/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GymCardArt } from "./gym-card-art";
import { formatLabel } from "./gym-card-tile";

const ROUND_BUTTON =
  "press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

/**
 * A gym card at the door (issue #878): the code on a pure white panel at
 * full width in either theme, since door scanners need dark bars on white
 * and white is the brightest a web page can make the screen. The number is
 * printed under it for staff to key in. The screen stays awake while it's
 * open; swiping moves between cards. Everything here is local, so it works
 * with no signal.
 */
export function GymCardViewer({
  cards,
  startId,
  onClose,
  onEdit,
}: {
  cards: readonly GymCardRow[];
  startId: string;
  onClose: () => void;
  onEdit: (card: GymCardRow) => void;
}) {
  // A card that was just saved can reach the live list a moment after the
  // viewer opens on it, so the viewer waits for it instead of opening blank.
  const startAt = cards.findIndex((card) => card.id === startId);
  const [opened, setOpened] = useState(startAt >= 0);
  const [index, setIndex] = useState(Math.max(0, startAt));
  useEffect(() => {
    if (opened || startAt < 0) return;
    setIndex(startAt);
    setOpened(true);
  }, [opened, startAt]);
  const current = cards[Math.min(index, cards.length - 1)];
  const strip = useRef<HTMLDivElement>(null);

  useWakeLock(true);
  // A fixed overlay doesn't stop the page underneath from scrolling (docs/PWA.md §2).
  useEffect(() => lockPageScroll(), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Open on the card that was tapped, once its panel is on screen.
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    const element = strip.current;
    if (!element || scrolled.current) return;
    scrolled.current = true;
    element.scrollLeft = index * element.clientWidth;
  });

  // Closes when the last card is deleted from under it.
  useEffect(() => {
    if (opened && cards.length === 0) onClose();
  }, [opened, cards.length, onClose]);

  if (!mounted || !opened || !current) return null;

  function onScroll() {
    const element = strip.current;
    if (!element || element.clientWidth === 0) return;
    setIndex(Math.round(element.scrollLeft / element.clientWidth));
  }

  return createPortal(
    // z-20: a full-screen overlay above the tab bar and in-flow chrome, like
    // FocusView (docs/PWA.md §4). Opened from Lift and Gyms only, never during
    // a workout, so the rest timer is never under it.
    <section
      aria-label={`${current.name} card`}
      className="route-fade safe-x fixed inset-0 z-20 flex flex-col overscroll-none bg-zinc-100 text-zinc-950 dark:bg-black dark:text-zinc-50"
      style={{
        paddingTop: "max(16px, var(--top-inset))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <header className="flex touch-none items-center gap-3 px-4 pt-2 pb-4">
        <span
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-extrabold tracking-tight text-white"
          style={{ background: current.color }}
        >
          {gymCardMonogram(current.name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-[22px] leading-tight font-bold tracking-[-0.02em]">
            {current.name}
          </h2>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {formatLabel(current.format)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onEdit(current)}
          aria-label={`Edit ${current.name}`}
          className={ROUND_BUTTON}
        >
          <Pencil className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className={ROUND_BUTTON}>
          <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>
      </header>
      <div
        ref={strip}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none]"
      >
        {cards.map((card) => (
          <CardPanel key={card.id} card={card} />
        ))}
      </div>
      {cards.length > 1 && (
        <div className="flex touch-none justify-center gap-2 py-4" aria-hidden="true">
          {cards.map((card, i) => (
            <span
              key={card.id}
              className={`h-2 w-2 rounded-full ${
                i === index ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            />
          ))}
        </div>
      )}
    </section>,
    document.body,
  );
}

function CardPanel({ card }: { card: GymCardRow }) {
  const square = isSquareFormat(card.format as GymCardFormat);
  return (
    <section
      aria-label={card.name}
      className="flex w-full shrink-0 snap-center flex-col justify-center px-3 pb-[8vh]"
    >
      {/* Always white, whatever the theme: scanners read dark bars on white. */}
      <div className="rounded-[28px] bg-white px-6 pt-8 pb-6 text-black shadow-sm shadow-black/5">
        <GymCardArt
          source={card}
          label={`${formatLabel(card.format)} code`}
          className={square ? "mx-auto aspect-square w-full max-w-[280px]" : "h-[150px] w-full"}
        />
        <p
          className={`allow-pwa-select mt-4 text-center font-mono font-semibold tracking-[0.06em] tabular-nums break-all ${
            card.code.length > 16 ? "text-lg" : "text-[26px]"
          }`}
        >
          {card.code}
        </p>
      </div>
    </section>
  );
}
