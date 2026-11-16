import { ExternalLink } from "@/components/icons/solar";
import {
  FEEDBACK_STATES,
  FEEDBACK_TYPES,
  type FeedbackResult,
  type FeedbackStateId,
  type FeedbackTypeId,
} from "@/lib/admin/feedback-data";
import Link from "next/link";
import { AdminCard, Chip, EmptyState, LinkTabs, dashboardHref } from "./admin-dashboard-ui";
import { RelativeTime } from "./relative-time";

const TYPE_LABELS: Record<FeedbackTypeId, string> = Object.fromEntries(
  FEEDBACK_TYPES.map((type) => [type.id, type.label]),
) as Record<FeedbackTypeId, string>;

/** In-app feedback from GitHub (issue #810), read only, each linked to its submitter. */
export function AdminFeedback({
  state,
  type,
  result,
}: {
  state: FeedbackStateId;
  type: FeedbackTypeId | null;
  result: FeedbackResult;
}) {
  const stateParam = state === "open" ? null : state;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <div className="flex max-w-full flex-wrap gap-2">
          <LinkTabs
            label="Type"
            items={[{ id: "all", label: "All" }, ...FEEDBACK_TYPES].map((item) => ({
              id: item.id,
              label: item.label,
              current: (type ?? "all") === item.id,
              href: dashboardHref("/admin/feedback", {
                type: item.id === "all" ? null : item.id,
                state: stateParam,
              }),
            }))}
          />
          <LinkTabs
            label="State"
            items={FEEDBACK_STATES.map((item) => ({
              id: item.id,
              label: item.label,
              current: state === item.id,
              href: dashboardHref("/admin/feedback", {
                type,
                state: item.id === "open" ? null : item.id,
              }),
            }))}
          />
        </div>
      </div>
      <AdminCard>
        {!result.ok ? (
          <EmptyState>
            {result.reason === "not_configured"
              ? "GitHub feedback isn't set up on this deploy"
              : "GitHub didn't answer. Try again in a minute."}
          </EmptyState>
        ) : result.items.length === 0 ? (
          <EmptyState>No feedback matches</EmptyState>
        ) : (
          <ul className="flex flex-col">
            {result.items.map((item) => (
              <li
                key={item.number}
                className="flex min-w-0 flex-col gap-1.5 border-b border-zinc-200 py-3 last:border-b-0 dark:border-zinc-800"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-start gap-1.5 font-medium underline-offset-2 hover:underline"
                  >
                    <span className="min-w-0 break-words">{item.title}</span>
                    <ExternalLink
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-400"
                      strokeWidth={1.75}
                      aria-label="Opens on GitHub"
                    />
                  </a>
                  <span className="shrink-0 text-sm text-zinc-500">#{item.number}</span>
                </div>
                {item.excerpt && item.excerpt !== item.title && (
                  <p className="allow-pwa-select line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {item.excerpt}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                  {item.type && <Chip>{TYPE_LABELS[item.type]}</Chip>}
                  {item.state === "closed" && <Chip>Closed</Chip>}
                  {item.submitter ? (
                    <Link
                      href={`/admin/users/${item.submitter.id}`}
                      className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                    >
                      {item.submitter.label}
                    </Link>
                  ) : (
                    <span>Unknown account</span>
                  )}
                  {item.appVersion && <span className="font-mono">v{item.appVersion}</span>}
                  <RelativeTime iso={item.createdAt} />
                  {item.comments > 0 && (
                    <span>
                      {item.comments} {item.comments === 1 ? "comment" : "comments"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </>
  );
}
