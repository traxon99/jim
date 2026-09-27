"use client";

import { shareWorkoutText } from "@/lib/workout/share-text";
import { useState } from "react";

interface Props {
  title: string;
  text: string;
  className?: string;
}

/** "Share" button for a finished workout — used on the finalize summary and history detail. */
export function ShareWorkoutButton({ title, text, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if ((await shareWorkoutText(title, text)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button type="button" onClick={handleShare} data-ripple className={className}>
      {copied ? "Copied!" : "Share"}
    </button>
  );
}
