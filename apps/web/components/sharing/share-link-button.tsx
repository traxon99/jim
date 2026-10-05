"use client";

import { FloatingCard } from "@/components/floating-card";
import { createShareLink, sharePath } from "@/lib/sharing/client";
import { shareUrl } from "@/lib/sharing/share-url";
import type { ShareSnapshot } from "@jim/core";
import { Share } from "lucide-react";
import { useCallback, useId, useState } from "react";

interface Props {
  /** What's being shared, for the share sheet's title and the button's label. */
  title: string;
  /** Builds the snapshot when tapped; null when there's nothing to share anymore. */
  build: () => Promise<ShareSnapshot | null>;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

function LinkReadyCard({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  const headingId = useId();
  const [note, setNote] = useState<string | null>(null);

  // Its own tap, not the one that created the link: iOS only opens the share
  // sheet or writes the clipboard straight from a tap, and creating the link
  // waits on the network first.
  async function handleShare() {
    const outcome = await shareUrl(title, url);
    if (outcome === "copied") setNote("Link copied");
    else if (outcome === "unavailable") setNote("Copy the link above to share it");
  }

  return (
    <FloatingCard labelledBy={headingId} onClose={onClose}>
      {(close) => (
        <div className="flex flex-col gap-3 p-4">
          <h2 id={headingId} className="text-lg font-semibold">
            Link ready
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Anyone with Jim who opens it can add a copy of {title}. Later edits you make won't
            change it. Revoke it any time from the link itself or in Settings.
          </p>
          <p className="allow-pwa-select break-all rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
            {url}
          </p>
          {note && <output className="text-sm text-zinc-500 dark:text-zinc-500">{note}</output>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground"
            >
              Share link
            </button>
          </div>
        </div>
      )}
    </FloatingCard>
  );
}

/**
 * Shares a routine or program by link (issue #254): freezes it into a new
 * read-only snapshot, then shows the link with a button for the share sheet.
 * Each tap makes a new link; revoking lives on the link's own page and in
 * Settings.
 */
export function ShareLinkButton({ title, build }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const closeCard = useCallback(() => setStatus({ kind: "idle" }), []);

  async function handleCreate() {
    setStatus({ kind: "busy" });
    try {
      const snapshot = await build();
      if (!snapshot) {
        setStatus({ kind: "error", message: "There's nothing to share yet" });
        return;
      }
      const created = await createShareLink(snapshot);
      if (!created.ok) {
        setStatus({ kind: "error", message: created.error });
        return;
      }
      const url = new URL(sharePath(created.value), window.location.origin).toString();
      setStatus({ kind: "ready", url });
    } catch {
      setStatus({ kind: "error", message: "Couldn't create the link" });
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={status.kind === "busy"}
        aria-label={`Share ${title} by link`}
        data-ripple
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-zinc-500 disabled:opacity-50 dark:text-zinc-500"
      >
        <Share className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </button>
      {status.kind === "error" && (
        <p role="alert" className="max-w-48 text-right text-xs text-red-600 dark:text-red-500">
          {status.message}
        </p>
      )}
      {status.kind === "ready" && (
        <LinkReadyCard title={title} url={status.url} onClose={closeCard} />
      )}
    </div>
  );
}
