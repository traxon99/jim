import { ChevronLeft } from "@/components/icons/solar";
import { ACCOUNT_ROLE_LABELS } from "@jim/core";
import type { AdminUserDetail } from "@jim/db/admin";
import Link from "next/link";
import { AdminProfileEditor, AdminSettingsEditor, AdminUserActions } from "./admin-user-editor";
import { LocalDateTime } from "./local-date-time";

/** One account's admin page (issue #807): facts, actions and every setting. */
export function AdminUserDetailView({ user, isSelf }: { user: AdminUserDetail; isSelf: boolean }) {
  return (
    <>
      <Link
        href="/admin/users"
        className="-ml-1 flex min-h-11 items-center gap-1 self-start pr-3 text-sm font-medium text-zinc-500"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Users
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{user.username ?? user.email}</h1>
            <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {ACCOUNT_ROLE_LABELS[user.role]}
            </span>
            {user.disabled && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                Sign-in disabled
              </span>
            )}
          </div>
          <p className="allow-pwa-select truncate text-sm text-zinc-500">
            {user.displayName ? `${user.displayName} · ${user.email}` : user.email}
          </p>
        </div>
        <AdminUserActions userId={user.id} disabled={user.disabled} isSelf={isSelf} />
      </div>
      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-200 p-4 text-sm md:grid-cols-3 xl:grid-cols-6 dark:border-zinc-800">
        <Fact label="Joined">
          <LocalDateTime iso={user.createdAt} dateOnly />
        </Fact>
        <Fact label="Last active">
          {user.lastActiveAt ? <LocalDateTime iso={user.lastActiveAt} /> : "Never"}
        </Fact>
        <Fact label="Workouts">{user.workouts}</Fact>
        <Fact label="Last 7 days">{user.workoutsLast7Days}</Fact>
        <Fact label="Update requested">
          {user.updateRequestedAt ? <LocalDateTime iso={user.updateRequestedAt} /> : "Never"}
        </Fact>
        <Fact label="Reset requested">
          {user.resetRequestedAt ? <LocalDateTime iso={user.resetRequestedAt} /> : "Never"}
        </Fact>
      </dl>
      <AdminProfileEditor user={user} isSelf={isSelf} />
      <AdminSettingsEditor userId={user.id} settings={user.settings} />
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  );
}
