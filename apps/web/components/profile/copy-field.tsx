"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** A read-only value with a copy button, for URLs, commands and tokens in Settings. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be refused (permissions, insecure context); the value
      // is still selectable on screen.
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
      <div className="flex items-center gap-2">
        <code className="allow-pwa-select min-w-0 flex-1 break-all rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={`Copy ${label}`}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700"
        >
          {copied ? (
            <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
