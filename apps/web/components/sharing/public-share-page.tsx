import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { SharedSnapshotView } from "@/components/sharing/shared-snapshot-view";
import type { SharePreview } from "@/lib/sharing/preview";
import { shareSummaryStats } from "@jim/core";
import { Layers } from "lucide-react";

/**
 * A share link opened by someone who isn't signed in (issue #638): the
 * routine or program, read-only and rendered on the server, so anyone can
 * look at it in a browser. Adding it takes Jim on their phone.
 */
export function PublicSharePage({ preview }: { preview: SharePreview | null }) {
  if (!preview) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Link not available</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This link doesn't work anymore. It may have been revoked.
        </p>
      </main>
    );
  }

  const { snapshot, summary, username } = preview;
  const program = snapshot.kind === "program" ? snapshot.program : null;

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title={summary.name} />
      <div className={PAGE_BODY}>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            {`${program ? "Program" : "Routine"} shared by ${username ?? "a Jim user"}`}
          </p>
          <p className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
            {shareSummaryStats(summary).join(" · ")}
          </p>
          {program && (
            <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-500">
              <Layers className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {program.mode === "weekly" ? "Weekly schedule" : "Sequence"}
              {program.durationWeeks && ` · ${program.durationWeeks} weeks`}
            </p>
          )}
          {program?.notes && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{program.notes}</p>
          )}
        </div>

        <p className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {`To add it to your ${program ? "programs" : "routines"}, open this link in Jim on your phone.`}
        </p>

        <SharedSnapshotView snapshot={snapshot} />
      </div>
    </main>
  );
}
