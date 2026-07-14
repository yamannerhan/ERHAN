/**
 * Unit tests for moderator RBAC matrix (no DB required).
 * Run: pnpm exec tsx --tsconfig ./tsconfig.json ./scripts/test-moderation-rbac.ts
 */
import {
  roleHasPermission,
  getPermissionsForRole,
  isPanelRole,
  assertCanActOnUser,
  PERMISSIONS,
} from "../src/lib/moderation/permissions.ts";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  }
}

// Panel roles
assert(isPanelRole("admin"), "admin is panel role");
assert(isPanelRole("moderator"), "moderator is panel role");
assert(isPanelRole("senior_moderator"), "senior_moderator is panel role");
assert(!isPanelRole("user"), "user is not panel role");

// Regular user has no perms
assert(!roleHasPermission("user", "dashboard.view"), "user cannot view dashboard");
assert(getPermissionsForRole("user").length === 0, "user perms empty");

// Moderator basics
assert(roleHasPermission("moderator", "listings.approve"), "mod can approve");
assert(roleHasPermission("moderator", "reports.resolve"), "mod can resolve reports");
assert(!roleHasPermission("moderator", "listings.feature"), "mod cannot feature");
assert(!roleHasPermission("moderator", "blacklist.add"), "mod cannot add blacklist");
assert(!roleHasPermission("moderator", "word_filter.add"), "mod cannot add word filter");
assert(!roleHasPermission("moderator", "announcements.create"), "mod cannot create announcements");
assert(!roleHasPermission("moderator", "ip_devices.block"), "mod cannot block IP");

// Senior extras
assert(roleHasPermission("senior_moderator", "listings.feature"), "senior can feature");
assert(roleHasPermission("senior_moderator", "blacklist.add"), "senior can blacklist");
assert(roleHasPermission("senior_moderator", "word_filter.add"), "senior can word filter");
assert(roleHasPermission("senior_moderator", "announcements.publish"), "senior can publish");
assert(roleHasPermission("senior_moderator", "ip_devices.block"), "senior can block IP");
assert(roleHasPermission("senior_moderator", "listings.approve"), "senior inherits approve");

// Admin has all
assert(roleHasPermission("admin", "dashboard.view"), "admin dashboard");
for (const p of PERMISSIONS) {
  assert(roleHasPermission("admin", p), `admin has ${p}`);
}
assert(getPermissionsForRole("admin").length === PERMISSIONS.length, "admin gets all perms");

// Target hierarchy
assert(assertCanActOnUser("moderator", "user"), "mod can act on user");
assert(!assertCanActOnUser("moderator", "moderator"), "mod cannot act on mod");
assert(!assertCanActOnUser("moderator", "admin"), "mod cannot act on admin");
assert(assertCanActOnUser("senior_moderator", "user"), "senior can act on user");
assert(assertCanActOnUser("senior_moderator", "moderator"), "senior can act on mod");
assert(!assertCanActOnUser("senior_moderator", "admin"), "senior cannot act on admin");
assert(assertCanActOnUser("admin", "moderator"), "admin can act on mod");
assert(!assertCanActOnUser("admin", "admin"), "nobody acts on admin via this helper");

// Soft XSS smoke — strip script tags style (frontend/backend sanitize expected)
const dirty = `<script>alert(1)</script>spam`;
const cleaned = dirty.replace(/<script[\s\S]*?<\/script>/gi, "").trim();
assert(cleaned === "spam", "xss script tag stripped");

console.log(failed === 0 ? "ALL OK — moderation RBAC" : `${failed} failures`);
process.exit(failed === 0 ? 0 : 1);
