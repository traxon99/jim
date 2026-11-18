"use client";

import {
  ShareImageSheet,
  type ShareImageSheetProps,
} from "@/components/share-card/share-image-sheet";
import { type ReactNode, useState } from "react";

type Props = Omit<ShareImageSheetProps, "onClose"> & {
  className?: string;
  /** The button's text; `children` replaces it (an icon), and `label` is then its accessible name. */
  label?: string;
  children?: ReactNode;
};

/** "Share image": opens the card preview for a workout, record or achievement (issue #838). */
export function ShareImageButton({ className, label = "Share image", children, ...sheet }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={children ? label : undefined}
        data-ripple
        className={className}
      >
        {children ?? label}
      </button>
      {open && <ShareImageSheet {...sheet} onClose={() => setOpen(false)} />}
    </>
  );
}
