import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/admin/load-access";
import { serviceDb } from "@/lib/db/user-scoped";
import { countNewFailureGroups } from "@jim/db/admin";

/** Every admin section: admin role and a TOTP-verified (aal2) session. */
export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
  // A badge is a nicety: a failed count must not take the console down.
  const newFailures = await countNewFailureGroups(serviceDb()).catch(() => 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <AdminNav email={email} newFailures={newFailures} />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div
          className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 md:px-8"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
