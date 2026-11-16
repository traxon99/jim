import { type AuditRow, formatAuditValue } from "@/lib/admin/audit-data";
import Link from "next/link";
import { LocalDateTime } from "./local-date-time";

/** The admin audit log (issue #806): every admin write, newest first. */
export function AdminAuditLog({ rows }: { rows: AuditRow[] }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">No admin actions yet</p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                <th className="py-2 pr-4 font-normal">When</th>
                <th className="py-2 pr-4 font-normal">Admin</th>
                <th className="py-2 pr-4 font-normal">Account</th>
                <th className="py-2 pr-4 font-normal">Action</th>
                <th className="py-2 pr-4 font-normal">Change</th>
                <th className="py-2 font-normal">Via</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 pr-4 whitespace-nowrap text-zinc-500">
                    <LocalDateTime iso={row.createdAt} />
                  </td>
                  <td className="py-2 pr-4">{row.actor ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {row.target && row.targetUserId ? (
                      <Link
                        href={`/admin/users/${row.targetUserId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.target}
                      </Link>
                    ) : (
                      (row.target ?? (row.targetUserId ? "—" : "Everyone"))
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {row.action}
                    {row.field ? ` · ${row.field}` : ""}
                  </td>
                  <td className="max-w-xs py-2 pr-4">
                    {(row.oldValue != null || row.newValue != null) && (
                      <span className="block truncate">
                        {formatAuditValue(row.oldValue)} → {formatAuditValue(row.newValue)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-zinc-500">{row.via}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
