import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  permissionsTable,
  rolePermissionsTable,
  userPermissionsTable,
  filteredWordsTable,
  bannedWordsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  isPanelRole,
  roleHasPermission,
  getPermissionsForRole,
  PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  DEFAULT_REMOVED_DELETE_PERMS,
  assertCanActOnUser,
  assertCannotTargetAdmin,
  type PermissionKey,
  type PanelRole,
} from "../lib/moderation/permissions";

let seeded = false;

async function ensureUserPermissionsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      permission_key TEXT NOT NULL,
      granted BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_permissions_unique
    ON user_permissions (user_id, permission_key)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_permissions_user_idx
    ON user_permissions (user_id)
  `);
}

export async function ensureModerationPermissionsSeeded(): Promise<void> {
  if (seeded) return;
  try {
    await ensureUserPermissionsTable();
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
    // Varsayılanlardan silme yetkilerini kaldır (mevcut modlar da silmesin)
    await db
      .delete(rolePermissionsTable)
      .where(
        and(
          inArray(rolePermissionsTable.role, ["moderator", "senior_moderator"]),
          inArray(rolePermissionsTable.permissionKey, DEFAULT_REMOVED_DELETE_PERMS),
        ),
      );
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

export async function loadUserPermissions(role: string, userId?: number): Promise<PermissionKey[]> {
  if (role === "admin") return getPermissionsForRole("admin");
  await ensureModerationPermissionsSeeded();

  // Rol varsayılanları her zaman kod matrisinden (silme yok)
  const base: PermissionKey[] = getPermissionsForRole(role);

  if (!userId) return base;

  try {
    const overrides = await db
      .select({
        key: userPermissionsTable.permissionKey,
        granted: userPermissionsTable.granted,
      })
      .from(userPermissionsTable)
      .where(eq(userPermissionsTable.userId, userId));

    if (overrides.length === 0) return base;

    const set = new Set<PermissionKey>(base);
    for (const row of overrides) {
      const key = row.key as PermissionKey;
      if (!PERMISSIONS.includes(key)) continue;
      if (row.granted) set.add(key);
      else set.delete(key);
    }
    return [...set];
  } catch {
    return base;
  }
}

export async function userHasPermission(
  role: string,
  userId: number | undefined,
  permission: PermissionKey,
): Promise<boolean> {
  if (role === "admin") return true;
  const perms = await loadUserPermissions(role, userId);
  return perms.includes(permission);
}

export function requirePermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Giriş yapmanız gerekiyor" });
      return;
    }
    void (async () => {
      try {
        const ok = await userHasPermission(req.user!.role, req.user!.id, permission);
        if (!ok) {
          res.status(403).json({ error: "Bu işlem için yetkiniz yok", code: "FORBIDDEN_PERMISSION", permission });
          return;
        }
        next();
      } catch {
        res.status(500).json({ error: "Yetki kontrolü başarısız" });
      }
    })();
  };
}

/** Compute override rows from desired effective permission list vs role defaults */
export function computePermissionOverrides(
  role: string,
  desired: PermissionKey[],
): Array<{ permissionKey: PermissionKey; granted: boolean }> {
  const defaults = new Set(getPermissionsForRole(role));
  const want = new Set(desired.filter((k) => PERMISSIONS.includes(k)));
  const rows: Array<{ permissionKey: PermissionKey; granted: boolean }> = [];
  for (const key of PERMISSIONS) {
    const inDefault = defaults.has(key);
    const inWant = want.has(key);
    if (inWant && !inDefault) rows.push({ permissionKey: key, granted: true });
    else if (!inWant && inDefault) rows.push({ permissionKey: key, granted: false });
  }
  return rows;
}

export {
  getPermissionsForRole,
  roleHasPermission,
  isPanelRole,
  assertCanActOnUser,
  assertCannotTargetAdmin,
  PERMISSIONS,
};
export type { PermissionKey, PanelRole };
