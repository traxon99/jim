"use client";

import { LoadingText } from "@/components/loading-text";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { SharedSnapshotView } from "@/components/sharing/shared-snapshot-view";
import { isStandalone } from "@/lib/pwa/standalone";
import { type Result, openShareLink, revokeShareLink, shareBackTarget } from "@/lib/sharing/client";
import { addSharedSnapshot } from "@/lib/sharing/local";
import type { OpenedShareLink } from "@/lib/sharing/types";
import { Layers } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A shared routine or program, opened from its link (issue #254): a
 * read-only preview and one button that copies it into the user's own rows.
 * The sharer sees a Revoke button instead of being nudged to add their own.
 */
export function SharedPreview({
  id,
  userId,
  from,
}: {
  id: string;
  userId: string;
  /** Where the link was opened from (`?from=`), so Back returns there. */
  from?: string;
}) {
  const router = useRouter();
  const back = shareBackTarget(from);
  const [loaded, setLoaded] = useState<Result<OpenedShareLink> | null>(null);
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Share pages skip the install gate so anyone can read them (issue #638),
  // but adding writes to IndexedDB, which only the installed app keeps (ADR-010).
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    setInstalled(isStandalone());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void openShareLink(id).then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loaded === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
      </main>
    );
  }

  if (!loaded.ok) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Link not available</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{loaded.error}</p>
        <Link href={back.href} className="text-sm font-medium underline underline-offset-4">
          Back to {back.label.toLowerCase()}
        </Link>
      </main>
    );
  }

  const link = loaded.value;
  const { snapshot } = link;
  const isProgram = snapshot.kind === "program";

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      const added = await addSharedSnapshot(userId, snapshot);
      router.push(
        added.kind === "program"
          ? `/routines/programs/${added.programId}`
          : `/routines/${added.routineId}`,
      );
    } catch {
      setError("Couldn't add it. Try again.");
      setAdding(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke this link? Anyone who opens it after this won't see it.")) return;
    setRevoking(true);
    setError(null);
    const result = await revokeShareLink(id);
    setRevoking(false);
    if (result.ok) {
      setLoaded({ ok: false, error: "You revoked this link, so it doesn't work anymore." });
    } else {
      setError(result.error);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title={link.name} back={back} />
      <div className={PAGE_BODY}>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            {link.isMine ? "Your shared link" : `Shared by ${link.username ?? "a Jim user"}`}
          </p>
          {isProgram && (
            <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-500">
              <Layers className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {snapshot.program?.mode === "weekly" ? "Weekly schedule" : "Sequence"}
              {snapshot.program?.durationWeeks && ` · ${snapshot.program.durationWeeks} weeks`}
            </p>
          )}
          {snapshot.program?.notes && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{snapshot.program.notes}</p>
          )}
        </div>

        {link.isMine ? (
          <button
            type="button"
            onClick={() => void handleRevoke()}
            disabled={revoking}
            className="min-h-11 rounded-lg border border-red-300 px-4 text-base font-medium text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-500"
          >
            Revoke link
          </button>
        ) : installed ? (
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={adding}
            className="flex min-h-14 items-center justify-center rounded-xl bg-accent px-4 text-lg font-semibold text-accent-foreground disabled:opacity-50"
          >
            {isProgram ? "Add to my programs" : "Add to my routines"}
          </button>
        ) : (
          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            To add it to your routines, open this link in Jim on your phone.
          </p>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-red-600 dark:text-red-500">
            {error}
          </p>
        )}
        {(link.isMine || installed) && (
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
            {link.isMine
              ? "This is a copy from when you shared it. Your later edits don't change it."
              : "Adding makes your own copy. Exercises you already have are reused."}
          </p>
        )}

        <SharedSnapshotView snapshot={snapshot} />
      </div>
    </main>
  );
}
