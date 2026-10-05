"use client";

import { FloatingCard } from "@/components/floating-card";
import { shareIdFromText, sharePath } from "@/lib/sharing/client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

/**
 * Pastes a routine or program share link (issue #254). An installed iPhone
 * app can't be opened from a link (it opens in Safari instead), so this is
 * how a link someone sent reaches Jim.
 */
export function OpenShareLinkCard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const headingId = useId();
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);

  return (
    <FloatingCard labelledBy={headingId} onClose={onClose}>
      {(close) => (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const id = shareIdFromText(text);
            if (!id) {
              setInvalid(true);
              return;
            }
            onClose();
            router.push(sharePath(id));
          }}
        >
          <h2 id={headingId} className="text-lg font-semibold">
            Add from a link
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Paste a routine or program link someone shared with you.
          </p>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setInvalid(false);
            }}
            placeholder="https://…/share/…"
            aria-invalid={invalid}
            aria-label="Share link"
            className="min-h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
          />
          {invalid && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-500">
              That doesn't look like a Jim share link.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={text.trim() === ""}
              className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground disabled:opacity-50"
            >
              Open
            </button>
          </div>
        </form>
      )}
    </FloatingCard>
  );
}
