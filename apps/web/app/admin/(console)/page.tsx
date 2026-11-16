import { requireAdmin } from "@/lib/admin/load-access";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import { redirect } from "next/navigation";

/** /admin opens the first section until the Overview ships (#810). */
export default async function AdminHome() {
  // Layouts and pages render in parallel, so check here too: a non-admin
  // must get the 404, never a redirect that reveals the console.
  await requireAdmin();
  redirect(ADMIN_SECTIONS[0]?.href ?? "/admin/audit");
}
