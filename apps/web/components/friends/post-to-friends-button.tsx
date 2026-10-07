"use client";

import { FloatingCard } from "@/components/floating-card";
import { createPost } from "@/lib/friends/client";
import { POST_CAPTION_MAX_LENGTH, type PostDraft } from "@jim/core";
import { Check, Send } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";

type Shareable = Omit<PostDraft, "caption">;

/**
 * Posts a workout, record or achievement to your friends' feeds (issue
 * #316). Opens a card previewing what they'll see, with an optional caption.
 * Once posted it reads "Posted" and can't post the same thing twice from here.
 */
export function PostToFriendsButton({
  draft,
  label = "Post to friends",
  className,
  children,
}: {
  draft: Shareable;
  label?: string;
  className?: string;
  /** Replaces the icon and label inside the button; `label` becomes its accessible name. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [posted, setPosted] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={posted}
        aria-label={children ? (posted ? `${label}: posted` : label) : undefined}
        onClick={() => setOpen(true)}
        className={`flex items-center justify-center gap-1.5 disabled:opacity-60 ${className ?? ""}`}
      >
        {children ?? (
          <>
            {posted ? (
              <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
            {posted ? "Posted" : label}
          </>
        )}
      </button>
      {open && (
        <ComposePostCard
          draft={draft}
          onClose={() => setOpen(false)}
          onPosted={() => setPosted(true)}
        />
      )}
    </>
  );
}

function ComposePostCard({
  draft,
  onClose,
  onPosted,
}: {
  draft: Shareable;
  onClose: () => void;
  onPosted: () => void;
}) {
  const titleId = useId();
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <FloatingCard labelledBy={titleId} onClose={onClose}>
      {(close) => {
        async function handleSubmit(event: FormEvent) {
          event.preventDefault();
          setSending(true);
          setError(null);
          const result = await createPost({ ...draft, caption });
          setSending(false);
          if (result.ok) {
            onPosted();
            close();
          } else {
            setError(result.error);
          }
        }

        return (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4 text-left"
          >
            <h2 id={titleId} className="text-base font-semibold">
              Post to friends
            </h2>
            <div className="allow-pwa-select flex flex-col rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
              <span className="truncate text-sm font-medium">{draft.title}</span>
              {draft.detail && (
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{draft.detail}</span>
              )}
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Caption (optional)
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                maxLength={POST_CAPTION_MAX_LENGTH}
                rows={3}
                placeholder="How did it go?"
                className="resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
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
                type="submit"
                disabled={sending}
                className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {sending ? "Posting…" : "Post"}
              </button>
            </div>
          </form>
        );
      }}
    </FloatingCard>
  );
}
