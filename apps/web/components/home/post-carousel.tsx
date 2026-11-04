"use client";

import { type ReactNode, useRef, useState } from "react";

/**
 * A post's swipeable media (issue #747): full-width square slides on a
 * native scroll-snap strip, with a "1/3" counter and dots. Native horizontal
 * scrolling keeps iOS's own axis lock, so a vertical drag that starts on a
 * slide still scrolls the feed. One slide shows no counter or dots.
 */
export function PostCarousel({
  slides,
  label,
  className,
}: {
  slides: ReactNode[];
  /** What the slides show, for screen readers (e.g. "maya's Push Day"). */
  label: string;
  /** The background behind every slide (the post's tint). */
  className: string;
}) {
  const [index, setIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const many = slides.length > 1;

  function onScroll() {
    const strip = stripRef.current;
    if (!strip || strip.clientWidth === 0) return;
    const next = Math.round(strip.scrollLeft / strip.clientWidth);
    setIndex(Math.max(0, Math.min(slides.length - 1, next)));
  }

  return (
    <div className="flex flex-col">
      <section
        aria-roledescription="carousel"
        aria-label={label}
        className={`relative aspect-square w-full overflow-hidden text-white ${className}`}
      >
        <div
          ref={stripRef}
          onScroll={many ? onScroll : undefined}
          className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        >
          {slides.map((slide, i) => (
            <section
              // Slides are positional and never reorder.
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed slide order
              key={i}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
              className="flex h-full w-full shrink-0 snap-start snap-always flex-col overflow-hidden p-5"
            >
              {slide}
            </section>
          ))}
        </div>
        {many && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-4 right-4 rounded-full bg-black/35 px-2.5 py-1 text-xs font-semibold tabular-nums"
          >
            {index + 1}/{slides.length}
          </span>
        )}
      </section>
      {many && (
        <div aria-hidden="true" className="flex justify-center gap-1.5 pt-2.5">
          {slides.map((_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: one dot per fixed slide
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${
                i === index ? "bg-accent" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
