import { Search } from "@/components/icons/solar";
import type { AdminUserRow, AdminUserSort } from "@/lib/admin/users-data";
import { ACCOUNT_ROLE_LABELS } from "@jim/core";
import Link from "next/link";
import { AdminUpdateEveryone } from "./admin-user-editor";
import { LocalDateTime } from "./local-date-time";

const SORTS: { id: AdminUserSort; label: string }[] = [
  { id: "active", label: "Last active" },
  { id: "joined", label: "Joined" },
];

function sortHref(sort: AdminUserSort, query: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (sort !== "active") params.set("sort", sort);
  const search = params.toString();
  return search ? `/admin/users?${search}` : "/admin/users";
}

/** The admin Users list (issue #807): search, sort, and a row per account. */
export function AdminUsersList({
  rows,
  hasMore,
  query,
  sort,
}: {
  rows: AdminUserRow[];
  hasMore: boolean;
  query: string;
  sort: AdminUserSort;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Users</h1>
        <AdminUpdateEveryone />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Sort"
          className="flex rounded-xl border border-zinc-200 p-1 dark:border-zinc-800"
        >
          {SORTS.map((option) => (
            <Link
              key={option.id}
              href={sortHref(option.id, query)}
              aria-current={option.id === sort ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                option.id === sort
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>
      <form action="/admin/users" className="flex min-w-0 max-w-md items-center gap-2">
        {sort !== "active" && <input type="hidden" name="sort" value={sort} />}
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 px-3 dark:border-zinc-800">
          <Search
            className="h-4 w-4 shrink-0 text-zinc-500"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="sr-only">Search users</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Email, username or name"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
      </form>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No accounts match</p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                <th className="py-2 pr-4 font-normal">Account</th>
                <th className="py-2 pr-4 font-normal">Role</th>
                <th className="py-2 pr-4 font-normal">Joined</th>
                <th className="py-2 pr-4 font-normal">Last active</th>
                <th className="py-2 text-right font-normal">Workouts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="max-w-xs py-2 pr-4">
                    <Link href={`/admin/users/${row.id}`} className="block min-w-0 hover:underline">
                      <span className="block truncate font-medium">
                        {row.username ?? row.email}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        {row.displayName ? `${row.displayName} · ${row.email}` : row.email}
                      </span>
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{ACCOUNT_ROLE_LABELS[row.role]}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-zinc-500">
                    <LocalDateTime iso={row.createdAt} dateOnly />
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-zinc-500">
                    {row.lastActiveAt ? <LocalDateTime iso={row.lastActiveAt} /> : "Never"}
                  </td>
                  <td className="py-2 text-right tabular-nums">{row.workouts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && <p className="mt-3 text-sm text-zinc-500">Showing the first {rows.length}</p>}
        </div>
      )}
    </>
  );
}
