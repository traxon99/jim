import { AdminUsersList } from "@/components/admin/admin-users-list";
import { requireAdmin } from "@/lib/admin/load-access";
import { serviceDb } from "@/lib/db/user-scoped";
import { type AdminUserSort, listAdminUsers } from "@jim/db/admin";

export default async function AdminUsersPage(props: PageProps<"/admin/users">) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const query = typeof searchParams.q === "string" ? searchParams.q.slice(0, 100) : "";
  const sort: AdminUserSort = searchParams.sort === "joined" ? "joined" : "active";
  const { rows, hasMore } = await listAdminUsers(serviceDb(), { query, sort });
  return <AdminUsersList rows={rows} hasMore={hasMore} query={query} sort={sort} />;
}
