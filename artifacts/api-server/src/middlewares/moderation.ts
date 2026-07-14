import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  permissionsTable,
  rolePermissionsTable,
  filteredWordsTable,
  bannedWordsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  isPanelRole,
  roleHasPermission,
  getPermissionsForRole,
  PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  assertCanActOnUser,
  assertCannotTargetAdmin,
  type PermissionKey,
  type PanelRole,
} from "../lib/moderation/permissions";

let seeded = false;

export async function ensureModerationPermissionsSeeded(): Promise<void> {
  if (seeded) return;
  try {
    for (const key of PERMISSIONS) {
      await db.insert(permissionsTable).values({ key, description: key }).onConflictDoNothing();
    }
    for (const role of Object.keys(ROLE_PERMISSION_MATRIX) as PanelRole[]) {
      for (const permissionKey of ROLE_PERMISSION_MATRIX[role]) {
        await db
          .insert(rolePermissionsTable)
          .values({ role, permissionKey })
          .onConflictDoNothing();
      }
    }
    // One-shot: copy legacy banned_words into filtered_words
    const legacy = await db.select().from(bannedWordsTable).limit(500);
    for (const row of legacy) {
      const word = String(row.word ?? "").trim();
      if (!word) continue;
      const [exists] = await db
        .select({ id: filteredWordsTable.id })
        .from(filteredWordsTable)
        .where(eq(filteredWordsTable.word, word))
        .limit(1);
      if (!exists) {
        await db.insert(filteredWordsTable).values({
          word,
          category: "legacy",
          action: "hide",
          isActive: true,
        });
      }
    }
    seeded = true;
  } catch {
    // tables may not exist yet
  }
}

export function requireModeratorPanel(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Giriş yapmanız gerekiyor" });
    return;
  }
  if (!isPanelRole(req.user.role)) {
    res.status(403).json({ error: "Yetkisiz erişim", code: "FORBIDDEN_PANEL" });
    return;
  }
  void ensureModerationPermissionsSeeded();
  next();
}

export function requirePermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Giriş yapmanız gerekiyor" });
      return;
    }
    if (!roleHasPermission(req.user.role, permission)) {
      res.status(403).json({ error: "Bu işlem için yetkiniz yok", code: "FORBIDDEN_PERMISSION", permission });
      return;
    }
    next();
  };
}

export async function loadUserPermissions(role: string): Promise<PermissionKey[]> {
  if (role === "admin") return getPermissionsForRole("admin");
  try {
    const rows = await db
      .select({ key: rolePermissionsTable.permissionKey })
      .from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.role, role));
    if (rows.length > 0) return rows.map((r) => r.key as PermissionKey);
  } catch { /* fallback */ }
  return getPermissionsForRole(role);
}

export {
  getPermissionsForRole,
  roleHasPermission,
  isPanelRole,
  assertCanActOnUser,
  assertCannotTargetAdmin,
};
