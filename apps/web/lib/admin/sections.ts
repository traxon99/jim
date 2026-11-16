export type AdminSectionId = "audit";

/**
 * The /admin sidebar (issue #805), in nav order. Sections join this list as
 * they ship: Overview, Users, Failures, Performance, Feedback and Health
 * follow in #807–#810.
 */
export const ADMIN_SECTIONS: readonly { id: AdminSectionId; label: string; href: string }[] = [
  { id: "audit", label: "Audit log", href: "/admin/audit" },
];

/** The section an /admin pathname belongs to, so the nav can mark it. */
export function activeAdminSection(pathname: string): AdminSectionId | null {
  const match = ADMIN_SECTIONS.find(
    (section) => pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
  return match?.id ?? null;
}
