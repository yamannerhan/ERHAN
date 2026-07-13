import { Router } from "express";
import { db, managementTeamTable } from "@workspace/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { authMiddleware, requireAdmin, optionalAuthMiddleware } from "../middlewares/auth";

const router = Router();

async function ensureManagementTeamTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS management_team (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      display_name TEXT NOT NULL,
      role_name TEXT NOT NULL DEFAULT 'Moderatör',
      title TEXT,
      avatar_path TEXT,
      name_color TEXT NOT NULL DEFAULT '#F5C518',
      badge_color TEXT NOT NULL DEFAULT '#94A3B8',
      profile_url TEXT,
      is_online_visible BOOLEAN NOT NULL DEFAULT TRUE,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);

  const existing = await db
    .select({ id: managementTeamTable.id })
    .from(managementTeamTable)
    .where(isNull(managementTeamTable.deletedAt))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(managementTeamTable).values([
      {
        displayName: "Erhan Yaman",
        roleName: "Admin",
        nameColor: "#F5C518",
        badgeColor: "#F5C518",
        isOnlineVisible: true,
        isVisible: true,
        isActive: true,
        sortOrder: 0,
      },
      {
        displayName: "Mehmet Kaya",
        roleName: "Moderatör",
        nameColor: "#7DD3FC",
        badgeColor: "#94A3B8",
        isOnlineVisible: true,
        isVisible: true,
        isActive: true,
        sortOrder: 1,
      },
      {
        displayName: "Ayşe Demir",
        roleName: "Moderatör",
        nameColor: "#C4B5FD",
        badgeColor: "#94A3B8",
        isOnlineVisible: true,
        isVisible: true,
        isActive: true,
        sortOrder: 2,
      },
    ]);
  }
}

function mapRow(r: typeof managementTeamTable.$inferSelect) {
  return {
    id: r.id,
    userId: r.userId,
    displayName: r.displayName,
    roleName: r.roleName,
    title: r.title,
    avatarPath: r.avatarPath,
    nameColor: r.nameColor,
    badgeColor: r.badgeColor,
    profileUrl: r.profileUrl,
    isOnlineVisible: r.isOnlineVisible,
    isVisible: r.isVisible,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
    updatedAt: r.updatedAt?.toISOString?.() ?? r.updatedAt,
  };
}

/** Hamburger menü — görünür ilk 3 */
router.get("/management-team", optionalAuthMiddleware, async (_req, res) => {
  try {
    await ensureManagementTeamTable();
    const rows = await db
      .select()
      .from(managementTeamTable)
      .where(and(
        isNull(managementTeamTable.deletedAt),
        eq(managementTeamTable.isActive, true),
        eq(managementTeamTable.isVisible, true),
      ))
      .orderBy(asc(managementTeamTable.sortOrder), asc(managementTeamTable.id));

    const all = rows.map(mapRow);
    res.json({
      items: all.slice(0, 3),
      total: all.length,
      hasMore: all.length > 3,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Admin — tüm kayıtlar */
router.get("/admin/management-team", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    await ensureManagementTeamTable();
    const rows = await db
      .select()
      .from(managementTeamTable)
      .where(isNull(managementTeamTable.deletedAt))
      .orderBy(asc(managementTeamTable.sortOrder), asc(managementTeamTable.id));
    res.json({ items: rows.map(mapRow) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/admin/management-team", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureManagementTeamTable();
    const body = req.body ?? {};
    const displayName = String(body.displayName ?? "").trim();
    if (!displayName) {
      res.status(400).json({ error: "Görünen ad gerekli" });
      return;
    }
    const avatarPath = typeof body.avatarPath === "string" ? body.avatarPath : null;
    if (avatarPath && avatarPath.startsWith("data:") && avatarPath.length > 2_800_000) {
      res.status(400).json({ error: "Fotoğraf çok büyük (max ~2MB)" });
      return;
    }

    const [row] = await db.insert(managementTeamTable).values({
      userId: body.userId ? Number(body.userId) : null,
      displayName,
      roleName: String(body.roleName ?? "Moderatör").trim() || "Moderatör",
      title: body.title ? String(body.title).trim() : null,
      avatarPath,
      nameColor: String(body.nameColor ?? "#F5C518"),
      badgeColor: String(body.badgeColor ?? "#94A3B8"),
      profileUrl: body.profileUrl ? String(body.profileUrl).trim() : null,
      isOnlineVisible: body.isOnlineVisible !== false,
      isVisible: body.isVisible !== false,
      isActive: body.isActive !== false,
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    }).returning();

    res.status(201).json({ item: mapRow(row!) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/admin/management-team/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureManagementTeamTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz ID" });
      return;
    }
    const body = req.body ?? {};
    const patch: Partial<typeof managementTeamTable.$inferInsert> = {
      updatedBy: req.user!.id,
      updatedAt: new Date(),
    };
    if (body.displayName != null) patch.displayName = String(body.displayName).trim();
    if (body.roleName != null) patch.roleName = String(body.roleName).trim();
    if (body.title !== undefined) patch.title = body.title ? String(body.title).trim() : null;
    if (body.avatarPath !== undefined) {
      const avatarPath = body.avatarPath ? String(body.avatarPath) : null;
      if (avatarPath && avatarPath.startsWith("data:") && avatarPath.length > 2_800_000) {
        res.status(400).json({ error: "Fotoğraf çok büyük (max ~2MB)" });
        return;
      }
      patch.avatarPath = avatarPath;
    }
    if (body.nameColor != null) patch.nameColor = String(body.nameColor);
    if (body.badgeColor != null) patch.badgeColor = String(body.badgeColor);
    if (body.profileUrl !== undefined) patch.profileUrl = body.profileUrl ? String(body.profileUrl).trim() : null;
    if (body.isOnlineVisible != null) patch.isOnlineVisible = !!body.isOnlineVisible;
    if (body.isVisible != null) patch.isVisible = !!body.isVisible;
    if (body.isActive != null) patch.isActive = !!body.isActive;
    if (body.sortOrder != null) patch.sortOrder = Number(body.sortOrder);
    if (body.userId !== undefined) patch.userId = body.userId ? Number(body.userId) : null;

    const [row] = await db.update(managementTeamTable)
      .set(patch)
      .where(and(eq(managementTeamTable.id, id), isNull(managementTeamTable.deletedAt)))
      .returning();

    if (!row) {
      res.status(404).json({ error: "Kayıt bulunamadı" });
      return;
    }
    res.json({ item: mapRow(row) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/admin/management-team/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureManagementTeamTable();
    const id = Number(req.params.id);
    const [row] = await db.update(managementTeamTable)
      .set({ deletedAt: new Date(), updatedBy: req.user!.id, updatedAt: new Date() })
      .where(and(eq(managementTeamTable.id, id), isNull(managementTeamTable.deletedAt)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Kayıt bulunamadı" });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Sıralama: { order: number[] } id listesi */
router.post("/admin/management-team/reorder", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureManagementTeamTable();
    const order = Array.isArray(req.body?.order) ? req.body.order.map(Number).filter(Number.isFinite) : [];
    for (let i = 0; i < order.length; i++) {
      await db.update(managementTeamTable)
        .set({ sortOrder: i, updatedAt: new Date(), updatedBy: req.user!.id })
        .where(eq(managementTeamTable.id, order[i]!));
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
