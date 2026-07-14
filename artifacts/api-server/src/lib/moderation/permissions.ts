/** Moderation permission keys + default role matrix */

export const PANEL_ROLES = ["admin", "senior_moderator", "moderator"] as const;
export type PanelRole = (typeof PANEL_ROLES)[number];

export const PERMISSIONS = [
  "dashboard.view",
  "listings.view", "listings.create", "listings.edit", "listings.approve", "listings.reject",
  "listings.archive", "listings.soft_delete", "listings.feature", "listings.remove_feature", "listings.bulk_action",
  "companies.view", "companies.edit", "companies.verify", "companies.reject", "companies.suspend", "companies.unsuspend",
  "users.view", "users.warn", "users.suspend_temporarily", "users.unsuspend", "users.view_activity", "users.view_reports",
  "comments.view", "comments.hide", "comments.restore", "comments.soft_delete",
  "messages.view_reported", "messages.hide", "messages.soft_delete",
  "chat.clear",
  "notifications.view", "notifications.send",
  "reports.view", "reports.assign", "reports.resolve", "reports.reject", "reports.escalate",
  "ip_devices.view", "ip_devices.flag", "ip_devices.block",
  "blacklist.view", "blacklist.add", "blacklist.remove",
  "word_filter.view", "word_filter.add", "word_filter.edit", "word_filter.remove",
  "logs.view",
  "announcements.view", "announcements.create", "announcements.edit", "announcements.publish", "announcements.unpublish", "announcements.delete",
  "statistics.view",
  "settings.profile", "settings.notifications",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

/** Varsayılan moderatör yetkileri — silme (soft_delete) yok; admin ayrı atayabilir */
const MODERATOR_PERMS: PermissionKey[] = [
  "dashboard.view",
  "listings.view", "listings.edit", "listings.approve", "listings.reject", "listings.archive",
  "companies.view", "companies.edit", "companies.verify", "companies.reject",
  "users.view", "users.warn", "users.suspend_temporarily", "users.unsuspend", "users.view_activity", "users.view_reports",
  "messages.view_reported", "messages.hide",
  "notifications.view",
  "reports.view", "reports.assign", "reports.resolve", "reports.reject", "reports.escalate",
  "ip_devices.view", "ip_devices.flag",
  "blacklist.view",
  "word_filter.view",
  "logs.view",
  "statistics.view",
  "settings.profile", "settings.notifications",
];

/** Rol varsayılanından kaldırılan silme yetkileri (seed sırasında DB'den temizlenir) */
export const DEFAULT_REMOVED_DELETE_PERMS: PermissionKey[] = [
  "listings.soft_delete",
  "messages.soft_delete",
  "comments.soft_delete",
  "announcements.delete",
  "chat.clear",
];

const SENIOR_EXTRA: PermissionKey[] = [
  "listings.create", "listings.feature", "listings.remove_feature", "listings.bulk_action",
  "companies.suspend", "companies.unsuspend",
  "notifications.send",
  "ip_devices.block",
  "blacklist.add", "blacklist.remove",
  "word_filter.add", "word_filter.edit", "word_filter.remove",
];

export const ROLE_PERMISSION_MATRIX: Record<PanelRole, PermissionKey[]> = {
  moderator: MODERATOR_PERMS,
  senior_moderator: [...new Set([...MODERATOR_PERMS, ...SENIOR_EXTRA])],
  admin: [...PERMISSIONS],
};

export function isPanelRole(role: string): role is PanelRole {
  return (PANEL_ROLES as readonly string[]).includes(role);
}

export function roleHasPermission(role: string, permission: PermissionKey): boolean {
  if (role === "admin") return true;
  if (!isPanelRole(role)) return false;
  return ROLE_PERMISSION_MATRIX[role].includes(permission);
}

export function getPermissionsForRole(role: string): PermissionKey[] {
  if (role === "admin") return [...PERMISSIONS];
  if (!isPanelRole(role)) return [];
  return ROLE_PERMISSION_MATRIX[role];
}

export function assertCannotTargetAdmin(targetRole: string | null | undefined): boolean {
  return targetRole !== "admin";
}

export function assertCanActOnUser(actorRole: string, targetRole: string): boolean {
  if (targetRole === "admin") return false;
  if (actorRole === "admin") return true;
  if (actorRole === "senior_moderator") {
    return targetRole === "user" || targetRole === "moderator";
  }
  return targetRole === "user";
}
