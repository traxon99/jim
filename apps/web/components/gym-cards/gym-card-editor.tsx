"use client";

import { lockPageScroll } from "@/components/floating-card";
import { X } from "@/components/icons/solar";
import type { GymCardRow, GymRow } from "@/lib/db/schema";
import {
  GymCardGoneError,
  type GymCardInput,
  addGymCard,
  cleanGymCardInput,
  deleteGymCard,
  updateGymCard,
} from "@/lib/gym-cards";
import { useKeepScrollOnKeyboard } from "@/lib/pwa/use-keep-scroll-on-keyboard";
import { runSyncCycle } from "@/lib/sync/engine";
import {
  GYM_CARD_COLORS,
  GYM_CARD_FORMATS,
  GYM_CARD_NAME_MAX,
  type GymCardFormat,
  cleanGymCardCode,
  gymCardCodeError,
} from "@jim/core";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GymCardScanner, type ScanResult } from "./gym-card-scanner";
import { GymCardTile, formatLabel } from "./gym-card-tile";

const INPUT_CLASS =
  "w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

type Draft = GymCardInput;

/**
 * Adding or editing a gym card (issue #878), full screen. A new card starts
 * at the camera; a code found (or the keyboard tapped) moves on to the
 * card itself: its live preview, a color (the ones sampled from the photo
 * first), name, gym and the code, which stays editable to fix a misread.
 */
export function GymCardEditor({
  userId,
  gyms,
  card,
  defaultGymId,
  onClose,
  onSaved,
  onDeleted,
}: {
  userId: string;
  gyms: readonly GymRow[];
  /** The card to edit; leave out to add one. */
  card?: GymCardRow;
  /** The gym a new card is for, when it's added from that gym. */
  defaultGymId?: string | null;
  onClose: () => void;
  /** Replaces closing after a save. */
  onSaved?: (card: GymCardRow) => void;
  /** Replaces closing after a delete. */
  onDeleted?: () => void;
}) {
  const [step, setStep] = useState<"scan" | "details">(card ? "details" : "scan");
  const [sampled, setSampled] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>(() =>
    card
      ? {
          name: card.name,
          format: card.format as GymCardFormat,
          code: card.code,
          exactCode: card.code,
          color: card.color,
          gymId: card.gymId,
        }
      : {
          name: gyms.find((gym) => gym.id === defaultGymId)?.name ?? gyms[0]?.name ?? "",
          format: "code128",
          code: "",
          color: GYM_CARD_COLORS[0],
          gymId: defaultGymId ?? gyms[0]?.id ?? null,
        },
  );

  useEffect(() => lockPageScroll(), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function found(result: ScanResult) {
    setSampled(result.colors);
    setDraft((current) => ({
      ...current,
      format: result.format,
      code: result.code,
      exactCode: result.code,
      color: result.colors[0] ?? current.color,
    }));
    setStep("details");
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    // z-20: full-screen, above the tab bar and in-flow chrome (docs/PWA.md §4).
    // Opened from Lift and Gyms, never during a workout.
    <section
      aria-label={card ? `Edit ${card.name}` : "Add a gym card"}
      className="route-fade safe-x fixed inset-0 z-20 flex flex-col overscroll-none bg-zinc-100 text-zinc-950 dark:bg-black dark:text-zinc-50"
    >
      {step === "scan" ? (
        <GymCardScanner onFound={found} onType={() => setStep("details")} onClose={onClose} />
      ) : (
        <CardDetails
          userId={userId}
          gyms={gyms}
          card={card}
          draft={draft}
          setDraft={setDraft}
          sampled={sampled}
          onClose={onClose}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </section>,
    document.body,
  );
}

function CardDetails({
  userId,
  gyms,
  card,
  draft,
  setDraft,
  sampled,
  onClose,
  onSaved,
  onDeleted,
}: {
  userId: string;
  gyms: readonly GymRow[];
  card?: GymCardRow;
  draft: Draft;
  setDraft: (update: (current: Draft) => Draft) => void;
  sampled: string[];
  onClose: () => void;
  onSaved?: (card: GymCardRow) => void;
  onDeleted?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useKeepScrollOnKeyboard(scroller);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveGuard = useRef(false);

  // The swatch row is fixed once shown, so picking one doesn't reorder it.
  const [colors] = useState(() =>
    [...new Set([...sampled, draft.color, ...GYM_CARD_COLORS])].slice(0, 7),
  );
  const cleanedCode =
    draft.code === draft.exactCode ? draft.code : cleanGymCardCode(draft.format, draft.code);
  const codeError = draft.code.trim() === "" ? null : gymCardCodeError(draft.format, cleanedCode);
  const previewCode = codeError ? "" : cleanedCode;

  async function save() {
    if (saveGuard.current) return;
    const cleaned = cleanGymCardInput(draft);
    if (!cleaned.ok) {
      setError(cleaned.error);
      return;
    }
    saveGuard.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = card
        ? await updateGymCard(card, draft)
        : await addGymCard({ userId, ...draft });
      void runSyncCycle();
      if (onSaved) onSaved(saved);
      else onClose();
    } catch (caught) {
      if (caught instanceof GymCardGoneError) {
        (onDeleted ?? onClose)();
        return;
      }
      setError("Couldn't save the card. Try again.");
      saveGuard.current = false;
      setSaving(false);
    }
  }

  async function remove() {
    if (!card || saveGuard.current) return;
    if (!confirm(`Delete ${card.name}?`)) return;
    saveGuard.current = true;
    try {
      await deleteGymCard(card);
      void runSyncCycle();
      (onDeleted ?? onClose)();
    } catch {
      setError("Couldn't delete the card. Try again.");
      saveGuard.current = false;
    }
  }

  return (
    <>
      <header
        className="flex touch-none items-center justify-between px-4 pb-3"
        style={{ paddingTop: "max(16px, var(--top-inset))" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="press grid h-11 w-11 place-items-center rounded-full bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>
        <h2 className="text-[17px] font-semibold">{card ? "Edit card" : "New card"}</h2>
        <span className="w-11" />
      </header>
      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <GymCardTile
          card={{
            id: undefined,
            name: draft.name.trim() || "Gym card",
            format: draft.format,
            code: previewCode,
            color: draft.color,
          }}
        />
        <fieldset className="flex flex-wrap justify-center gap-1">
          <legend className="sr-only">Color</legend>
          {colors.map((color) => (
            <label key={color} className="press grid h-11 w-11 shrink-0 place-items-center">
              <input
                type="radio"
                name="gym-card-color"
                value={color}
                checked={draft.color === color}
                onChange={() => setDraft((current) => ({ ...current, color }))}
                aria-label={`Color ${color}`}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-zinc-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-blue-500 dark:ring-offset-black ${
                  draft.color === color
                    ? "ring-[2.5px] ring-zinc-900 dark:ring-zinc-100"
                    : "ring-1 ring-black/10 dark:ring-white/20"
                }`}
                style={{ background: color }}
              />
            </label>
          ))}
        </fieldset>
        <div className="surface flex flex-col gap-3 p-4">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
            Name
            <input
              type="text"
              value={draft.name}
              maxLength={GYM_CARD_NAME_MAX}
              autoComplete="off"
              onChange={(event) => {
                const name = event.target.value;
                setDraft((current) => ({ ...current, name }));
              }}
              className={INPUT_CLASS}
            />
          </label>
          {gyms.length > 0 && (
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
              Gym
              <select
                aria-label="Gym"
                value={draft.gymId ?? ""}
                onChange={(event) => {
                  const gymId = event.target.value || null;
                  setDraft((current) => ({ ...current, gymId }));
                }}
                className={INPUT_CLASS}
              >
                <option value="">None</option>
                {gyms.map((gym) => (
                  <option key={gym.id} value={gym.id}>
                    {gym.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex min-w-0 gap-2">
            <label className="flex w-32 shrink-0 flex-col gap-1 text-xs font-medium">
              Format
              <select
                aria-label="Format"
                value={draft.format}
                onChange={(event) => {
                  const format = event.target.value as GymCardFormat;
                  setDraft((current) => ({ ...current, format }));
                }}
                className={INPUT_CLASS}
              >
                {GYM_CARD_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {formatLabel(format)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
              Code
              <input
                type="text"
                value={draft.code}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => {
                  const code = event.target.value;
                  setDraft((current) => ({ ...current, code }));
                }}
                className={`${INPUT_CLASS} font-mono`}
              />
            </label>
          </div>
          {(error ?? codeError) && (
            <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500" role="alert">
              {error ?? codeError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={
            saving || draft.name.trim() === "" || draft.code.trim() === "" || codeError !== null
          }
          className="press flex min-h-[52px] items-center justify-center rounded-full bg-accent px-4 text-[17px] font-semibold text-accent-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {card && (
          <button
            type="button"
            onClick={() => void remove()}
            className="flex min-h-11 items-center justify-center text-[15px] font-medium text-red-600 dark:text-red-500"
          >
            Delete card
          </button>
        )}
      </div>
    </>
  );
}
