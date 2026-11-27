"use client";

import { Barcode, Plus } from "@/components/icons/solar";
import type { GymCardRow } from "@/lib/db/schema";
import { GymCardTile } from "./gym-card-tile";

/** How much of each card above the front one shows, Wallet style. */
const PEEK = 58;

/**
 * Settings → Gyms' Cards shelf (issue #878): the cards stacked like Wallet,
 * the last one in full. Tapping a card opens it for the door.
 */
export function GymCardsShelf({
  cards,
  onOpen,
  onAdd,
}: {
  cards: readonly GymCardRow[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Cards
        </h2>
        {cards.length > 0 && (
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add card"
            className="press grid h-11 w-11 place-items-center rounded-full text-zinc-900 dark:text-zinc-100"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-200/80 dark:bg-zinc-800">
              <Plus className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      {cards.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="press flex aspect-[3.2] w-full flex-col items-center justify-center gap-1.5 rounded-[18px] border-2 border-dashed border-zinc-300 text-[15px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          <Barcode className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
          Add card
        </button>
      ) : (
        <ul className="flex flex-col">
          {cards.map((card, i) => (
            <li
              key={card.id}
              className="relative"
              // Every card but the front one is tucked under the next,
              // showing only its top strip. A tile is the body width over 1.586.
              style={
                i === 0 ? undefined : { marginTop: `calc(${PEEK}px - (100vw - 2rem) / 1.586)` }
              }
            >
              <button
                type="button"
                onClick={() => onOpen(card.id)}
                aria-label={`Show ${card.name}`}
                className="press block w-full text-left"
              >
                <GymCardTile card={card} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
