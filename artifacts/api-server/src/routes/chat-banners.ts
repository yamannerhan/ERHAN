import { Router } from "express";
import { db, chatBannersTable } from "@workspace/db";
import { and, asc, eq, isNull, or, sql, gte, lte } from "drizzle-orm";
import { authMiddleware, requireAdmin, optionalAuthMiddleware } from "../middlewares/auth";

const router = Router();

async function ensureChatBannersTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_banners (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'megaphone',
      icon_color TEXT NOT NULL DEFAULT '#F5C518',
      title_color TEXT NOT NULL DEFAULT '#F5C518',
      link_type TEXT,
      link_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      duration_seconds INTEGER NOT NULL DEFAULT 5,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);

  const existing = await db
    .select({ id: chatBannersTable.id })
    .from(chatBannersTable)
    .where(isNull(chatBannersTable.deletedAt))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(chatBannersTable).values([
      {
        title: "Yeni Duyuru",
        description: "Kurallara uymayan mesajlar moderasyon tarafından kaldırılır. Topluluğumuzun düzeni için desteğiniz önemli!",
        icon: "megaphone",
        iconColor: "#F5C518",
        titleColor: "#F5C518",
        sortOrder: 0,
        durationSeconds: 5,
        isActive: true,
      },
      {
        title: "Hoş Geldiniz",
        description: "Sohbete katıldığınız için teşekkürler. Sorularınız için Canlı Destek sekmesini kullanabilirsiniz.",
        icon: "shield",
        iconColor: "#38BDF8",
        titleColor: "#38BDF8",
        sortOrder: 1,
        durationSeconds: 5,
        isActive: true,
      },
      {
        title: "İlan Hatırlatması",
        description: "İlan paylaşırken şehir ve iletişim bilgilerini eksiksiz yazın. Yanıltıcı ilan yasaktır.",
        icon: "briefcase",
        iconColor: "#A78BFA",
        titleColor: "#A78BFA",
        sortOrder: 2,
        durationSeconds: 5,
        isActive: true,
      },
    ]);
  }
}

function mapRow(r: typeof chatBannersTable.$inferSelect) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    icon: r.icon,
    iconColor: r.iconColor,
    titleColor: r.titleColor,
    linkType: r.linkType,
    linkUrl: r.linkUrl,
    sortOrder: r.sortOrder,
    startsAt: r.startsAt?.toISOString?.() ?? r.startsAt,
    endsAt: r.endsAt?.toISOString?.() ?? r.endsAt,
    durationSeconds: r.durationSeconds,
    isActive: r.isActive,
    createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
    updatedAt: r.updatedAt?.toISOString?.() ?? r.updatedAt,
  };
}

/** Sohbet UI — aktif + tarih aralığı geçerli bannerlar */
router.get("/chat/banners", optionalAuthMiddleware, async (_req, res) => {
  try {
    await ensureChatBannersTable();
    const now = new Date();
    const rows = await db
      .select()
      .from(chatBannersTable)
      .where(and(
        isNull(chatBannersTable.deletedAt),
        eq(chatBannersTable.isActive, true),
        or(isNull(chatBannersTable.startsAt), lte(chatBannersTable.startsAt, now)),
        or(isNull(chatBannersTable.endsAt), gte(chatBannersTable.endsAt, now)),
      ))
      .orderBy(asc(chatBannersTable.sortOrder), asc(chatBannersTable.id));

    res.json({ items: rows.map(mapRow) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/chat-banners", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    await ensureChatBannersTable();
    const rows = await db
      .select()
      .from(chatBannersTable)
      .where(isNull(chatBannersTable.deletedAt))
      .orderBy(asc(chatBannersTable.sortOrder), asc(chatBannersTable.id));
    res.json({ items: rows.map(mapRow) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/admin/chat-banners", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureChatBannersTable();
    const body = req.body ?? {};
    const title = String(body.title ?? "").trim();
    if (!title) {
      res.status(400).json({ error: "Başlık gerekli" });
      return;
    }
    const [row] = await db.insert(chatBannersTable).values({
      title,
      description: String(body.description ?? "").trim(),
      icon: String(body.icon ?? "megaphone"),
      iconColor: String(body.iconColor ?? "#F5C518"),
      titleColor: String(body.titleColor ?? "#F5C518"),
      linkType: body.linkType ? String(body.linkType) : null,
      linkUrl: body.linkUrl ? String(body.linkUrl).trim() : null,
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      durationSeconds: Math.max(2, Math.min(60, Number(body.durationSeconds) || 5)),
      isActive: body.isActive !== false,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    }).returning();
    res.status(201).json({ item: mapRow(row!) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/admin/chat-banners/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureChatBannersTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz ID" });
      return;
    }
    const body = req.body ?? {};
    const patch: Partial<typeof chatBannersTable.$inferInsert> = {
      updatedBy: req.user!.id,
      updatedAt: new Date(),
    };
    if (body.title != null) patch.title = String(body.title).trim();
    if (body.description != null) patch.description = String(body.description).trim();
    if (body.icon != null) patch.icon = String(body.icon);
    if (body.iconColor != null) patch.iconColor = String(body.iconColor);
    if (body.titleColor != null) patch.titleColor = String(body.titleColor);
    if (body.linkType !== undefined) patch.linkType = body.linkType ? String(body.linkType) : null;
    if (body.linkUrl !== undefined) patch.linkUrl = body.linkUrl ? String(body.linkUrl).trim() : null;
    if (body.sortOrder != null) patch.sortOrder = Number(body.sortOrder);
    if (body.startsAt !== undefined) patch.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.endsAt !== undefined) patch.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    if (body.durationSeconds != null) patch.durationSeconds = Math.max(2, Math.min(60, Number(body.durationSeconds) || 5));
    if (body.isActive != null) patch.isActive = !!body.isActive;

    const [row] = await db.update(chatBannersTable)
      .set(patch)
      .where(and(eq(chatBannersTable.id, id), isNull(chatBannersTable.deletedAt)))
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

router.delete("/admin/chat-banners/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureChatBannersTable();
    const id = Number(req.params.id);
    const [row] = await db.update(chatBannersTable)
      .set({ deletedAt: new Date(), updatedBy: req.user!.id, updatedAt: new Date() })
      .where(and(eq(chatBannersTable.id, id), isNull(chatBannersTable.deletedAt)))
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

router.post("/admin/chat-banners/reorder", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureChatBannersTable();
    const order = Array.isArray(req.body?.order) ? req.body.order.map(Number).filter(Number.isFinite) : [];
    for (let i = 0; i < order.length; i++) {
      await db.update(chatBannersTable)
        .set({ sortOrder: i, updatedAt: new Date(), updatedBy: req.user!.id })
        .where(eq(chatBannersTable.id, order[i]!));
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
