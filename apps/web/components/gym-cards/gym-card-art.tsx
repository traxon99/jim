"use client";

import { db } from "@/lib/db/schema";
import { drawGymCardSvg, gymCardArtKey, gymCardShape, gymCardSvg } from "@/lib/gym-cards/render";
import type { GymCardFormat } from "@jim/core";
import { useEffect, useState } from "react";

interface CodeSource {
  /** A saved card's id: its drawing is read from, and stored to, this phone. */
  id?: string;
  format: string;
  code: string;
}

type Art = { key: string; svg: string } | { key: string; failed: true };

/**
 * The card's code drawn as SVG (issue #878): a saved card's stored drawing,
 * or a fresh one for a card being set up. Null until it's ready; "failed"
 * when the code can't be drawn in its format.
 */
export function useGymCardSvg(source: CodeSource | null): string | null | "failed" {
  const key = source
    ? `${source.id ?? "draft"}|${gymCardArtKey(source.format as GymCardFormat, source.code)}`
    : "";
  const [art, setArt] = useState<Art | null>(null);
  const id = source?.id;
  const format = source?.format;
  const code = source?.code;
  useEffect(() => {
    if (!key || format === undefined || code === undefined) return;
    let cancelled = false;
    const draw = id
      ? gymCardSvg({ id, format, code }, db)
      : drawGymCardSvg(format as GymCardFormat, code);
    draw.then(
      (svg) => {
        if (!cancelled) setArt({ key, svg });
      },
      () => {
        if (!cancelled) setArt({ key, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, id, format, code]);
  if (!art || art.key !== key) return null;
  return "svg" in art ? art.svg : "failed";
}

/**
 * The drawn code as an image: black bars on white, stretched to the width
 * for linear codes (which keeps their proportions along the bars) and kept
 * square for QR, Data Matrix and Aztec.
 */
export function GymCardArt({
  source,
  className = "",
  label,
}: {
  source: CodeSource | null;
  className?: string;
  /** Read out in place of the picture; leave out when the number is shown beside it. */
  label?: string;
}) {
  const svg = useGymCardSvg(source);
  const shape = gymCardShape(source?.format ?? "");
  if (svg === "failed") {
    return (
      <p className={`grid place-items-center text-sm text-red-600 ${className}`} role="alert">
        Can't draw this code
      </p>
    );
  }
  if (!svg) return <div aria-hidden="true" className={className} />;
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`${shape === "wide" && source?.format !== "pdf417" ? "object-fill" : "object-contain"} ${className}`}
    />
  );
}
