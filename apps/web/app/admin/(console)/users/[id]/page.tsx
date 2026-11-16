import { AdminUserDetailView } from "@/components/admin/admin-user-detail";
import { requireAdmin } from "@/lib/admin/load-access";
import { loadAdminUser } from "@/lib/admin/users-data";
import { notFound } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminUserPage(props: PageProps<"/admin/users/[id]">) {
  const admin = await requireAdmin();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const user = await loadAdminUser(id);
  if (!user) notFound();
  return <AdminUserDetailView user={user} isSelf={user.id === admin.userId} />;
}
