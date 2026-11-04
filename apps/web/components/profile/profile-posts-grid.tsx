"use client";

import type { ProfilePostTile } from "@/lib/profile/post-tiles";
import { Trophy } from "lucide-react";
import Link from "next/link";

/** Three-column grid of tinted workout/post tiles (issues #751/#752). */
export function ProfilePostsGrid({
  tiles,
  onSelect,
  emptyMessage,
}: {
  tiles: readonly ProfilePostTile[];
  onSelect?: (tile: ProfilePostTile) => void;
  emptyMessage: string;
}) {
  if (tiles.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-0.5">
      {tiles.map((tile) => {
        const inner = (
          <>
            {tile.hasPr && (
              <Trophy
                className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-white/90"
                strokeWidth={2}
                aria-hidden="true"
              />
            )}
            <span className="line-clamp-2 text-left text-xs font-semibold leading-tight text-white">
              {tile.title}
            </span>
            <span className="text-left text-[10px] leading-tight text-white/85">
              {tile.subtitle}
            </span>
          </>
        );
        const className = `relative flex aspect-square min-w-0 flex-col justify-end gap-0.5 p-2 ${tile.tintClass}`;
        if (tile.href) {
          return (
            <li key={tile.id}>
              <Link href={tile.href} data-ripple className={className}>
                {inner}
              </Link>
            </li>
          );
        }
        return (
          <li key={tile.id}>
            <button
              type="button"
              data-ripple
              className={`${className} w-full text-left`}
              onClick={() => onSelect?.(tile)}
            >
              {inner}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
