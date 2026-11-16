import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import { redirect } from "next/navigation";

/** /admin opens the first section until the Overview ships (#810). */
export default function AdminHome() {
  redirect(ADMIN_SECTIONS[0]?.href ?? "/admin/audit");
}
