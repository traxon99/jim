"use client";

import { FloatingCard } from "@/components/floating-card";
import { ShareCardSvg } from "@/components/share-card/share-card-svg";
import type { CardExtras } from "@/lib/share-card/build";
import { cardFontCss } from "@/lib/share-card/fonts";
import { renderShareCardPng } from "@/lib/share-card/render";
import { shareImage, shareImageFileName } from "@/lib/share-card/share";
import { type CardExtrasKey, useCardExtras } from "@/lib/share-card/use-card-extras";
import {
  SHARE_CARD_SIZES,
  type ShareCardInput,
  type ShareCardSize,
  shareCardModel,
} from "@jim/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";

const SIZE_LABELS: Record<ShareCardSize, string> = { story: "Story", square: "Square" };

export interface ShareImageSheetProps extends CardExtrasKey {
  /** The card's content, given what the card needs beyond the data it's about. */
  build: (extras: CardExtras) => ShareCardInput;
  /** Used for the file name. */
  title: string;
  /** Travels with the image where the target app keeps text. */
  text: string;
  onClose: () => void;
}

/**
 * Preview of a share card before the system share sheet opens (issue #838):
 * story or square, with bodyweight off unless turned on for this card. The
 * image is drawn ahead of the tap, so Share can open the sheet inside the
 * tap itself (iOS refuses once the tap's user activation is spent).
 */
export function ShareImageSheet({ build, title, text, onClose, ...key }: ShareImageSheetProps) {
  const titleId = useId();
  const extras = useCardExtras(key);
  const [size, setSize] = useState<ShareCardSize>("story");
  const [includeBodyweight, setIncludeBodyweight] = useState(false);
  const [fontCss, setFontCss] = useState<string | null>(null);
  const [image, setImage] = useState<Blob | null>(null);
  const [sharing, setSharing] = useState(false);
  // State lags a fast double tap by a render; the ref stops the second one.
  const sharingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const source = useMemo(() => (extras ? build(extras) : null), [extras, build]);
  const model = useMemo(
    () => (source ? shareCardModel(source, { includeBodyweight }) : null),
    [source, includeBodyweight],
  );
  // Bodyweight is only offered where the card could show it.
  const canIncludeBodyweight =
    source !== null &&
    source.kind !== "achievement" &&
    source.input.bodyweight != null &&
    source.input.bodyweight > 0;

  useEffect(() => {
    let cancelled = false;
    void cardFontCss().then((css) => {
      if (!cancelled) setFontCss(css);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!model || fontCss === null) return;
    let cancelled = false;
    setImage(null);
    setError(null);
    renderShareCardPng(model, size, fontCss).then(
      (blob) => {
        if (!cancelled) setImage(blob);
      },
      () => {
        if (!cancelled) setError("Couldn't make the image. Try again.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [model, size, fontCss]);

  return (
    <FloatingCard labelledBy={titleId} onClose={onClose}>
      {(close) => {
        async function handleShare() {
          if (!image || sharingRef.current) return;
          sharingRef.current = true;
          setSharing(true);
          setError(null);
          try {
            const outcome = await shareImage(image, shareImageFileName(title, key.on, size), text);
            if (outcome !== "cancelled") close();
          } catch {
            setError("Couldn't share the image. Try again.");
          } finally {
            sharingRef.current = false;
            setSharing(false);
          }
        }

        return (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain p-4 text-left">
            <h2 id={titleId} className="text-base font-semibold">
              Share image
            </h2>

            <div className="flex gap-2">
              {SHARE_CARD_SIZES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={size === option}
                  onClick={() => setSize(option)}
                  className={`min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium transition-transform active:scale-[0.97] ${
                    size === option
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-zinc-300 text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
                  }`}
                >
                  {SIZE_LABELS[option]}
                </button>
              ))}
            </div>

            <div
              className="flex min-h-0 items-center justify-center rounded-xl bg-zinc-100 p-2 dark:bg-zinc-900"
              style={{ height: "min(52svh, 460px)" }}
            >
              {model ? (
                <ShareCardSvg model={model} size={size} fontCss={fontCss ?? ""} fluid />
              ) : (
                <span className="text-sm text-zinc-500">Loading…</span>
              )}
            </div>

            {canIncludeBodyweight && (
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
                Include bodyweight
                <input
                  type="checkbox"
                  checked={includeBodyweight}
                  onChange={(event) => setIncludeBodyweight(event.target.checked)}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
              </label>
            )}

            {error && (
              <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="min-h-11 rounded-lg px-4 text-sm font-medium text-zinc-600 dark:text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!image || sharing}
                onClick={() => void handleShare()}
                className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                {image ? "Share" : "Preparing…"}
              </button>
            </div>
          </div>
        );
      }}
    </FloatingCard>
  );
}
