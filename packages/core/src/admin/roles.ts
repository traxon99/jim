/**
 * Account roles (issue #806). Every account has exactly one. "coach" is a
 * placeholder with no powers yet; "admin" opens /admin and the admin MCP
 * tools. Admin is granted by script only, never from the admin UI.
 */
export const ACCOUNT_ROLES = ["user", "coach", "admin"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** The roles an admin may hand out from /admin. Admin itself is script-only. */
export const ASSIGNABLE_ROLES = ["user", "coach"] as const satisfies readonly AccountRole[];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === "string" && (ACCOUNT_ROLES as readonly string[]).includes(value);
}

export function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

export function isAdminRole(role: unknown): boolean {
  return role === "admin";
}

export const ACCOUNT_ROLE_LABELS: Record<AccountRole, string> = {
  user: "User",
  coach: "Coach",
  admin: "Admin",
};
