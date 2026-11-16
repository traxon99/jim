import { AdminMfa } from "@/components/admin/admin-mfa";
import { ADMIN_PATH, requireAdminRole } from "@/lib/admin/load-access";
import { redirect } from "next/navigation";

/**
 * The admin TOTP step (issue #806): enrol an authenticator the first time,
 * then enter its code once per session. The workout app never asks for it.
 */
export default async function AdminMfaPage() {
  const access = await requireAdminRole();
  if (access.status === "ok") redirect(ADMIN_PATH);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <AdminMfa />
    </main>
  );
}
