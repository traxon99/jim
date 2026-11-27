"use client";

import type { GymCardRow } from "@/lib/db/schema";
import { useGymCards } from "@/lib/gym-cards/use-gym-cards";
import { useGyms } from "@/lib/gyms/use-gyms";
import { type ReactNode, useCallback, useState } from "react";
import { GymCardEditor } from "./gym-card-editor";
import { GymCardViewer } from "./gym-card-viewer";

type Overlay =
  | { kind: "view"; id: string }
  | { kind: "add"; gymId: string | null }
  | { kind: "edit"; card: GymCardRow; backTo: string | null };

/**
 * The gym card door view and its add and edit screens (issue #878), shared
 * by Lift and Gyms. `open` shows a card at the door, `add` starts the
 * scanner; editing from the door view goes back to it when done.
 */
export function useGymCardOverlays(userId: string): {
  cards: GymCardRow[] | undefined;
  open: (id: string) => void;
  add: (gymId?: string | null) => void;
  overlays: ReactNode;
} {
  const cards = useGymCards();
  const gyms = useGyms() ?? [];
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const close = useCallback(() => setOverlay(null), []);
  const open = useCallback((id: string) => setOverlay({ kind: "view", id }), []);
  const add = useCallback((gymId: string | null = null) => setOverlay({ kind: "add", gymId }), []);

  let overlays: ReactNode = null;
  if (overlay?.kind === "view" && cards) {
    overlays = (
      <GymCardViewer
        cards={cards}
        startId={overlay.id}
        onClose={close}
        onEdit={(card) => setOverlay({ kind: "edit", card, backTo: card.id })}
      />
    );
  } else if (overlay?.kind === "add") {
    overlays = (
      <GymCardEditor
        userId={userId}
        gyms={gyms}
        defaultGymId={overlay.gymId}
        onClose={close}
        onSaved={(card) => setOverlay({ kind: "view", id: card.id })}
      />
    );
  } else if (overlay?.kind === "edit") {
    const backTo = overlay.backTo;
    overlays = (
      <GymCardEditor
        userId={userId}
        gyms={gyms}
        card={overlay.card}
        // Back to the door view after an edit; a deleted card closes everything.
        onClose={() => (backTo ? open(backTo) : close())}
        onDeleted={close}
      />
    );
  }

  return { cards, open, add, overlays };
}
