import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { db, knownCompaniesTable, knownCompanyAliasesTable, listingsTable } from "@workspace/db";
import { asc, desc, eq, ne, or, isNull, sql } from "drizzle-orm";
import { authMiddleware, requireAdmin, requireAdminOrModerator } from "../middlewares/auth";
import {
  applyKnownLogoToListings,
  ensureKnownCompaniesSchema,
  invalidateKnownCompanyCache,
  LOGO_DIR,
  saveKnownCompanyLogoBuffer,
  seedKnownCompaniesFromDisk,
  slugifyCompany,
  trimLogoWhitespace,
  upsertKnownCompanyAliases,
} from "../lib/known-companies";

const router = Router();
const DEFAULT_COMPANY_SLUG = "__default_listing_company__";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
    cb(null, ok);
  },
});

void ensureKnownCompaniesSchema()
  .then(() => seedKnownCompaniesFromDisk())
  .catch((e) => console.warn("[known-companies] bootstrap", e));

function companyJson(c: typeof knownCompaniesTable.$inferSelect, aliases: string[] = []) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    logoUrl: c.logoData || c.logoUrl ? `/api/known-company-logos/${c.id}` : null,
    aliases,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function getDefaultCompanyLogoRow(): Promise<typeof knownCompaniesTable.$inferSelect> {
  await ensureKnownCompaniesSchema();
  const [existing] = await db.select().from(knownCompaniesTable)
    .where(eq(knownCompaniesTable.slug, DEFAULT_COMPANY_SLUG))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(knownCompaniesTable).values({
    name: "Varsayılan Firma",
    slug: DEFAULT_COMPANY_SLUG,
    isActive: false,
  }).returning();
  return created!;
}

/** Firma bilgisi olmayan tüm ilanların ortak, DB tabanlı logosu. */
router.get("/default-company-logo", async (_req, res): Promise<void> => {
  const row = await getDefaultCompanyLogoRow();
  if (!row.logoData) {
    res.redirect(302, "/brand-logo.png");
    return;
  }
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
  res.send(Buffer.from(row.logoData, "base64"));
});

/** Public: logo binary */
router.get("/known-company-logos/:id", async (req, res): Promise<void> => {
  await ensureKnownCompaniesSchema();
  const id = parseInt(String(req.params["id"]), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Geçersiz ID" });
    return;
  }
  const [row] = await db.select().from(knownCompaniesTable).where(eq(knownCompaniesTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Logo yok" });
    return;
  }
  if (row.logoData) {
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(row.logoData, "base64"));
    return;
  }
  if (row.logoUrl && row.logoUrl.startsWith("/api/") === false && fs.existsSync(row.logoUrl)) {
    res.sendFile(path.resolve(row.logoUrl));
    return;
  }
  // Disk fallback: data/known-company-logos/kc_{id}_*
  try {
    const files = fs.readdirSync(LOGO_DIR).filter((f) => f.startsWith(`kc_${id}_`));
    if (files[0]) {
      res.setHeader("Content-Type", "image/webp");
      res.sendFile(path.join(LOGO_DIR, files[0]!));
      return;
    }
  } catch { /* ignore */ }
  res.status(404).json({ error: "Logo dosyası yok" });
});

/** Public katalog (aktif) — ilan formu dropdown */
router.get("/known-companies", async (_req, res): Promise<void> => {
  await ensureKnownCompaniesSchema();
  const rows = await db
    .select()
    .from(knownCompaniesTable)
    .where(eq(knownCompaniesTable.isActive, true))
    .orderBy(asc(knownCompaniesTable.name));
  const aliases = await db.select().from(knownCompanyAliasesTable);
  const byCo = new Map<number, string[]>();
  for (const a of aliases) {
    const list = byCo.get(a.companyId) ?? [];
    list.push(a.alias);
    byCo.set(a.companyId, list);
  }
  res.json({
    items: rows.map((c) => companyJson(c, byCo.get(c.id) ?? [])),
  });
});

router.get("/admin/known-companies", authMiddleware, requireAdminOrModerator, async (_req, res): Promise<void> => {
  await ensureKnownCompaniesSchema();
  const rows = await db.select().from(knownCompaniesTable)
    .where(ne(knownCompaniesTable.slug, DEFAULT_COMPANY_SLUG))
    .orderBy(desc(knownCompaniesTable.updatedAt));
  const aliases = await db.select().from(knownCompanyAliasesTable);
  const byCo = new Map<number, string[]>();
  for (const a of aliases) {
    const list = byCo.get(a.companyId) ?? [];
    list.push(a.alias);
    byCo.set(a.companyId, list);
  }
  res.json(rows.map((c) => companyJson(c, byCo.get(c.id) ?? [])));
});

router.get("/admin/default-company-logo", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const row = await getDefaultCompanyLogoRow();
  res.json({
    logoUrl: row.logoData ? `/api/default-company-logo?v=${row.updatedAt.getTime()}` : "/brand-logo.png",
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.post(
  "/admin/default-company-logo",
  authMiddleware,
  requireAdmin,
  upload.single("logo"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Logo dosyası gerekli" });
      return;
    }
    const row = await getDefaultCompanyLogoRow();
    await saveKnownCompanyLogoBuffer(row.id, req.file.buffer);
    const versionedUrl = `/api/default-company-logo?v=${Date.now()}`;
    const updated = await db.update(listingsTable)
      .set({ companyLogoUrl: versionedUrl })
      .where(or(
        isNull(listingsTable.company),
        sql`BTRIM(COALESCE(${listingsTable.company}, '')) = ''`,
        sql`LOWER(BTRIM(COALESCE(${listingsTable.company}, ''))) IN ('belirtilmedi', 'belirtilmemiş', 'firma')`,
      ))
      .returning({ id: listingsTable.id });
    res.json({ success: true, logoUrl: versionedUrl, appliedListings: updated.length });
  },
);

router.post("/admin/known-companies/seed", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  try {
    const n = await seedKnownCompaniesFromDisk();
    res.json({ success: true, seeded: n });
  } catch (e) {
    console.error("[known-companies] seed", e);
    res.status(500).json({ error: "Seed başarısız" });
  }
});

router.post("/admin/known-companies", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  await ensureKnownCompaniesSchema();
  const body = req.body as { name?: string; aliases?: string[]; isActive?: boolean };
  const name = String(body.name || "").trim();
  if (!name) {
    res.status(400).json({ error: "Şirket adı zorunlu" });
    return;
  }
  let slug = slugifyCompany(name);
  const [clash] = await db.select({ id: knownCompaniesTable.id }).from(knownCompaniesTable).where(eq(knownCompaniesTable.slug, slug)).limit(1);
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;

  const [row] = await db
    .insert(knownCompaniesTable)
    .values({ name, slug, isActive: body.isActive !== false })
    .returning();

  const aliases = Array.isArray(body.aliases) ? body.aliases : [];
  await upsertKnownCompanyAliases(row!.id, [name, ...aliases]);
  invalidateKnownCompanyCache();
  res.status(201).json(companyJson(row!, [name, ...aliases]));
});

router.patch("/admin/known-companies/:id", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Geçersiz ID" });
    return;
  }
  const body = req.body as { name?: string; aliases?: string[]; isActive?: boolean };
  const updates: Partial<typeof knownCompaniesTable.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
  await db.update(knownCompaniesTable).set(updates).where(eq(knownCompaniesTable.id, id));

  if (Array.isArray(body.aliases)) {
    await db.delete(knownCompanyAliasesTable).where(eq(knownCompanyAliasesTable.companyId, id));
    const [co] = await db.select().from(knownCompaniesTable).where(eq(knownCompaniesTable.id, id)).limit(1);
    await upsertKnownCompanyAliases(id, [co?.name ?? "", ...body.aliases]);
  }
  invalidateKnownCompanyCache();
  if (body.name || body.aliases) {
    void applyKnownLogoToListings(id).catch(() => undefined);
  }
  res.json({ success: true });
});

router.post(
  "/admin/known-companies/:id/logo",
  authMiddleware,
  requireAdminOrModerator,
  upload.single("logo"),
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params["id"]), 10);
      if (!Number.isFinite(id) || !req.file) {
        res.status(400).json({ error: "Logo dosyası gerekli" });
        return;
      }
      await ensureKnownCompaniesSchema();
      const [co] = await db.select().from(knownCompaniesTable).where(eq(knownCompaniesTable.id, id)).limit(1);
      if (!co) {
        res.status(404).json({ error: "Şirket bulunamadı" });
        return;
      }
      const logoUrl = await saveKnownCompanyLogoBuffer(id, req.file.buffer);
      const applied = await applyKnownLogoToListings(id);
      res.json({ success: true, logoUrl, appliedListings: applied });
    } catch (e) {
      console.error("[known-companies] logo", e);
      res.status(500).json({ error: "Logo yüklenemedi" });
    }
  },
);

router.post("/admin/known-companies/:id/apply-listings", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Geçersiz ID" });
    return;
  }
  const applied = await applyKnownLogoToListings(id);
  res.json({ success: true, applied });
});

router.delete("/admin/known-companies/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Geçersiz ID" });
    return;
  }
  await db.delete(knownCompanyAliasesTable).where(eq(knownCompanyAliasesTable.companyId, id));
  await db.delete(knownCompaniesTable).where(eq(knownCompaniesTable.id, id));
  invalidateKnownCompanyCache();
  res.sendStatus(204);
});

/** Test / yardımcı: trim preview */
router.post("/admin/known-companies/trim-preview", authMiddleware, requireAdmin, upload.single("logo"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "Dosya gerekli" });
    return;
  }
  const buf = await trimLogoWhitespace(req.file.buffer);
  res.json({ preview: `data:image/webp;base64,${buf.toString("base64")}` });
});

export default router;
