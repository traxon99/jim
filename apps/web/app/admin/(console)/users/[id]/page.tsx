import { AdminUserDetailView } from "@/components/admin/admin-user-detail";
import { requireAdmin } from "@/lib/admin/load-access";
import { serviceDb } from "@/lib/db/user-scoped";
import { loadAdminUser } from "@jim/db/admin";
import { notFound } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminUserPage(props: PageProps<"/admin/users/[id]">) {
  const admin = await requireAdmin();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const user = await loadAdminUser(id, serviceDb());
  if (!user) notFound();
  return <AdminUserDetailView user={user} isSelf={user.id === admin.userId} />;
}
