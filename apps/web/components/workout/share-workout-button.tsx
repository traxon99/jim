"use client";

import { shareWorkoutText } from "@/lib/workout/share-text";
import { type ReactNode, useState } from "react";

interface Props {
  title: string;
  text: string;
  className?: string;
  /** An icon shown before the label. */
  icon?: ReactNode;
}

/** "Share" button for a finished workout — used on the finalize summary and history detail. */
export function ShareWorkoutButton({ title, text, className, icon }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if ((await shareWorkoutText(title, text)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button type="button" onClick={handleShare} data-ripple className={className}>
      {icon}
      {copied ? "Copied!" : "Share"}
    </button>
  );
}
