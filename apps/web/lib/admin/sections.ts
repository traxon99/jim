export type AdminSectionId =
  | "overview"
  | "users"
  | "failures"
  | "performance"
  | "feedback"
  | "health"
  | "audit";

/** The /admin sidebar (issue #805), in nav order. */
export const ADMIN_SECTIONS: readonly { id: AdminSectionId; label: string; href: string }[] = [
  { id: "overview", label: "Overview", href: "/admin/overview" },
  { id: "users", label: "Users", href: "/admin/users" },
  { id: "failures", label: "Failures", href: "/admin/failures" },
  { id: "performance", label: "Performance", href: "/admin/performance" },
  { id: "feedback", label: "Feedback", href: "/admin/feedback" },
  { id: "health", label: "Health", href: "/admin/health" },
  { id: "audit", label: "Audit log", href: "/admin/audit" },
];

/** The section an /admin pathname belongs to, so the nav can mark it. */
export function activeAdminSection(pathname: string): AdminSectionId | null {
  const match = ADMIN_SECTIONS.find(
    (section) => pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
  return match?.id ?? null;
}
