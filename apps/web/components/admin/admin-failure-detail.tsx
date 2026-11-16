import { ChevronLeft } from "@/components/icons/solar";
import { type FailureDetail, failureSourceLabel } from "@jim/db/admin";
import Link from "next/link";
import { AdminCard, Chip } from "./admin-dashboard-ui";
import { LocalDateTime } from "./local-date-time";

function stackOf(detail: unknown): string | null {
  const stack = (detail as { stack?: unknown } | null)?.stack;
  return typeof stack === "string" ? stack : null;
}

function extraOf(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const { stack: _stack, ...rest } = detail as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
}

/** One failure group (issue #810): who hit it, on which versions, and its latest stacks. */
export function AdminFailureDetail({
  detail,
  backHref,
}: {
  detail: FailureDetail;
  /** The list with the filters it was opened from. */
  backHref: string;
}) {
  return (
    <>
      <Link
        href={backHref}
        className="-ml-1 flex min-h-11 items-center gap-1 self-start pr-3 text-sm font-medium text-zinc-500"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Failures
      </Link>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Chip>{failureSourceLabel(detail.kind)}</Chip>
          <span className="truncate font-mono text-xs text-zinc-500">{detail.fingerprint}</span>
        </div>
        <h1 className="allow-pwa-select font-mono text-lg font-semibold break-words">
          {detail.name}
          {detail.message ? `: ${detail.message}` : ""}
        </h1>
      </div>
      <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm md:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Fact label="Events">{detail.events}</Fact>
        <Fact label="Users">{detail.userCount}</Fact>
        <Fact label="First seen">
          <LocalDateTime iso={detail.firstSeenAt} />
        </Fact>
        <Fact label="Last seen">
          <LocalDateTime iso={detail.lastSeenAt} />
        </Fact>
      </dl>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <AdminCard title="Users">
          {detail.users.length === 0 ? (
            <p className="text-sm text-zinc-500">Not tied to an account</p>
          ) : (
            <ul className="flex flex-col text-sm">
              {detail.users.map((user) => (
                <li
                  key={user.id}
                  className="flex min-h-10 items-center justify-between gap-3 border-b border-zinc-200 last:border-b-0 dark:border-zinc-800"
                >
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="min-w-0 truncate underline-offset-2 hover:underline"
                  >
                    {user.label}
                  </Link>
                  <span className="tabular-nums text-zinc-500">{user.events}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
        <AdminCard title="Versions">
          <ul className="flex flex-col text-sm">
            {detail.versions.map((version) => (
              <li
                key={version.version ?? "none"}
                className="flex min-h-10 items-center justify-between gap-3 border-b border-zinc-200 last:border-b-0 dark:border-zinc-800"
              >
                <span className="font-mono">{version.version ?? "—"}</span>
                <span className="tabular-nums text-zinc-500">{version.events}</span>
              </li>
            ))}
          </ul>
        </AdminCard>
      </div>
      <AdminCard title="Latest occurrences">
        <ul className="flex flex-col">
          {detail.recent.map((occurrence) => {
            const stack = stackOf(occurrence.detail);
            const extra = extraOf(occurrence.detail);
            return (
              <li
                key={occurrence.id}
                className="flex min-w-0 flex-col gap-1 border-b border-zinc-200 py-3 text-sm last:border-b-0 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-zinc-500">
                  <span className="text-zinc-900 dark:text-zinc-100">
                    <LocalDateTime iso={occurrence.createdAt} />
                  </span>
                  {occurrence.appVersion && (
                    <span className="font-mono">{occurrence.appVersion}</span>
                  )}
                  {occurrence.path && <span className="font-mono">{occurrence.path}</span>}
                  {occurrence.userId && (
                    <Link
                      href={`/admin/users/${occurrence.userId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {occurrence.user ?? "Account"}
                    </Link>
                  )}
                </div>
                {occurrence.message && occurrence.message !== detail.message && (
                  <p className="allow-pwa-select font-mono text-xs break-words">
                    {occurrence.message}
                  </p>
                )}
                {extra && (
                  <p className="allow-pwa-select font-mono text-xs break-all text-zinc-500">
                    {extra}
                  </p>
                )}
                {stack && (
                  <details>
                    <summary className="cursor-pointer text-xs text-zinc-500">Stack</summary>
                    <pre className="allow-pwa-select mt-1 overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-950">
                      {stack}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </AdminCard>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 truncate tabular-nums">{children}</dd>
    </div>
  );
}
