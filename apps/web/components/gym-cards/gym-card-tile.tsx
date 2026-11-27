"use client";

import {
  GYM_CARD_FORMAT_LABELS,
  type GymCardFormat,
  gymCardMonogram,
  isSquareFormat,
} from "@jim/core";
import { GymCardArt } from "./gym-card-art";

export interface GymCardFace {
  id?: string;
  name: string;
  format: string;
  code: string;
  color: string;
}

/** The card's background: its color, deepening to the lower right. */
export function cardBackground(color: string): string {
  return `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 62%, black))`;
}

export function formatLabel(format: string): string {
  return GYM_CARD_FORMAT_LABELS[format as GymCardFormat] ?? format;
}

/**
 * A gym card as an object (issue #878): a credit-card-shaped tile in the
 * card's color with its monogram, name and a miniature of the real code. The
 * same tile is the shelf on Gyms and the preview while setting one up, so the
 * card looks the same everywhere.
 */
export function GymCardTile({ card, className = "" }: { card: GymCardFace; className?: string }) {
  const square = isSquareFormat(card.format as GymCardFormat);
  return (
    <div
      className={`relative flex aspect-[1.586] w-full flex-col overflow-hidden rounded-[18px] p-4 text-white shadow-lg shadow-black/15 ${className}`}
      style={{ background: cardBackground(card.color) }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-white/95 text-[15px] font-extrabold tracking-tight"
          style={{ color: card.color }}
        >
          {gymCardMonogram(card.name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[17px] leading-tight font-semibold">{card.name}</span>
          <span className="text-xs text-white/75">{formatLabel(card.format)}</span>
        </span>
      </div>
      <div
        className={`mt-auto rounded-[10px] bg-white text-black ${
          square ? "ml-auto p-2" : "px-3 pt-2 pb-1.5"
        }`}
      >
        <GymCardArt source={card} className={square ? "h-16 w-16" : "h-10 w-full"} />
        {!square && (
          <p className="mt-0.5 truncate text-center font-mono text-xs tracking-[0.06em] tabular-nums">
            {card.code}
          </p>
        )}
      </div>
    </div>
  );
}
