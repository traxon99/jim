/**
 * The admin console's server logic (issue #805), shared by the web admin
 * pages and the MCP admin tools (#811) so both read the same numbers and
 * apply the same rules. Everything here runs on the owner connection: every
 * caller must have checked the actor is an admin first.
 */
export * from "./audit";
export * from "./audit-data";
export * from "./dashboard";
export * from "./failures-data";
export * from "./feedback-data";
export * from "./force-refresh";
export * from "./health-data";
export * from "./overview-data";
export * from "./performance-data";
export * from "./profile-patch";
export * from "./settings";
export * from "./submitter-tag";
export * from "./user-actions";
export * from "./users-data";
