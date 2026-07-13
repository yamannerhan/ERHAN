import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db, companyProfilesTable, listingsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ensureCompanySchema } from "../lib/company-profiles";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

const COMPANY_LOGO_DIR = path.join(process.cwd(), "data", "company-logos");
try {
  fs.mkdirSync(COMPANY_LOGO_DIR, { recursive: true });
} catch { /* ignore */ }

void ensureCompanySchema().catch((e) => console.error("[company-profiles] schema:", e));

function sanitizeText(v: unknown, max = 500): string | null {
  if (v == null) return null;
  const s = String(v)
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
  if (!s) return null;
  return s.slice(0, max);
}

function profileJson(p: typeof companyProfilesTable.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    companyName: p.companyName,
    legalName: p.legalName,
    logoPath: p.logoPath,
    description: p.description,
    website: p.website,
    phone: p.phone,
    email: p.email,
    address: p.address,
    city: p.city,
    district: p.district,
    isVerified: p.isVerified,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (file.mimetype === "image/svg+xml" || file.originalname?.toLowerCase().endsWith(".svg")) {
      cb(new Error("SVG kabul edilmez"));
      return;
    }
    cb(null, allowed.includes(file.mimetype));
  },
});

function deleteLogoFile(logoPath: string | null | undefined) {
  if (!logoPath) return;
  const m = logoPath.match(/\/api\/company-logos\/([a-zA-Z0-9_\-\.]+)$/);
  if (!m) return;
  const fp = path.join(COMPANY_LOGO_DIR, m[1]!);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch { /* ignore */ }
}

/** Aktif şirket profilini getir (kendi) */
router.get("/company-profiles/me", authMiddleware, async (req, res): Promise<void> => {
  await ensureCompanySchema();
  const [row] = await db
    .select()
    .from(companyProfilesTable)
    .where(and(eq(companyProfilesTable.userId, req.user!.id), isNull(companyProfilesTable.deletedAt)))
    .limit(1);
  if (!row) {
    res.json(null);
    return;
  }
  res.json(profileJson(row));
});

/** Oluştur / güncelle (kullanıcı başına tek profil) */
router.put("/company-profiles/me", authMiddleware, async (req, res): Promise<void> => {
  await ensureCompanySchema();
  const body = req.body as Record<string, unknown>;
  const companyName = sanitizeText(body.companyName, 120);
  if (!companyName) {
    res.status(400).json({ error: "Şirket adı zorunludur" });
    return;
  }

  const patch = {
    companyName,
    legalName: sanitizeText(body.legalName, 160),
    description: sanitizeText(body.description, 2000),
    website: sanitizeText(body.website, 200),
    phone: sanitizeText(body.phone, 40),
    email: sanitizeText(body.email, 120),
    address: sanitizeText(body.address, 240),
    city: sanitizeText(body.city, 80),
    district: sanitizeText(body.district, 80),
    isActive: body.isActive === false ? false : true,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select()
    .from(companyProfilesTable)
    .where(and(eq(companyProfilesTable.userId, req.user!.id), isNull(companyProfilesTable.deletedAt)))
    .limit(1);

  let saved: typeof companyProfilesTable.$inferSelect;
  if (existing) {
    const [updated] = await db
      .update(companyProfilesTable)
      .set(patch)
      .where(eq(companyProfilesTable.id, existing.id))
      .returning();
    saved = updated!;
  } else {
    const [inserted] = await db
      .insert(companyProfilesTable)
      .values({
        userId: req.user!.id,
        ...patch,
      })
      .returning();
    saved = inserted!;
  }

  // Eski ilanları bu profile bağla (authorId eşleşmesi)
  await db
    .update(listingsTable)
    .set({ companyProfileId: saved.id })
    .where(
      and(
        eq(listingsTable.authorId, req.user!.id),
        sql`(${listingsTable.companyProfileId} IS NULL OR ${listingsTable.companyProfileId} = ${saved.id})`,
      ),
    );

  res.json(profileJson(saved));
});

/** Logo yükle — kare kırp, WEBP */
router.post(
  "/company-profiles/me/logo",
  authMiddleware,
  (req, res, next) => {
    upload.single("logo")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || "Geçersiz dosya (JPG/PNG/WEBP, max 2MB)" });
        return;
      }
      next();
    });
  },
  async (req, res): Promise<void> => {
    await ensureCompanySchema();
    if (!req.file) {
      res.status(400).json({ error: "Logo dosyası gerekli (JPG, PNG, WEBP — max 2MB)" });
      return;
    }

    // MIME + magic bytes (SVG/XML engeli)
    const head = req.file.buffer.slice(0, 64).toString("utf8").toLowerCase();
    if (head.includes("<svg") || head.includes("<?xml")) {
      res.status(400).json({ error: "SVG kabul edilmez" });
      return;
    }

    const [existing] = await db
      .select()
      .from(companyProfilesTable)
      .where(and(eq(companyProfilesTable.userId, req.user!.id), isNull(companyProfilesTable.deletedAt)))
      .limit(1);

    if (!existing) {
      res.status(400).json({ error: "Önce şirket adını kaydedin" });
      return;
    }

    const meta = await sharp(req.file.buffer).metadata();
    if ((meta.width ?? 0) < 64 || (meta.height ?? 0) < 64) {
      res.status(400).json({ error: "Logo en az 64x64 olmalıdır (önerilen 256x256)" });
      return;
    }

    const filename = `co_${existing.id}_${crypto.randomBytes(8).toString("hex")}.webp`;
    const filepath = path.join(COMPANY_LOGO_DIR, filename);
    await sharp(req.file.buffer)
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toFile(filepath);

    const logoPath = `/api/company-logos/${filename}`;
    deleteLogoFile(existing.logoPath);

    const [updated] = await db
      .update(companyProfilesTable)
      .set({ logoPath, updatedAt: new Date() })
      .where(eq(companyProfilesTable.id, existing.id))
      .returning();

    res.json(profileJson(updated!));
  },
);

/** Logo sil */
router.delete("/company-profiles/me/logo", authMiddleware, async (req, res): Promise<void> => {
  await ensureCompanySchema();
  const [existing] = await db
    .select()
    .from(companyProfilesTable)
    .where(and(eq(companyProfilesTable.userId, req.user!.id), isNull(companyProfilesTable.deletedAt)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Şirket profili yok" });
    return;
  }
  deleteLogoFile(existing.logoPath);
  const [updated] = await db
    .update(companyProfilesTable)
    .set({ logoPath: null, updatedAt: new Date() })
    .where(eq(companyProfilesTable.id, existing.id))
    .returning();
  res.json(profileJson(updated!));
});

/** Soft delete şirket profili */
router.delete("/company-profiles/me", authMiddleware, async (req, res): Promise<void> => {
  await ensureCompanySchema();
  const [existing] = await db
    .select()
    .from(companyProfilesTable)
    .where(and(eq(companyProfilesTable.userId, req.user!.id), isNull(companyProfilesTable.deletedAt)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Şirket profili yok" });
    return;
  }
  await db
    .update(companyProfilesTable)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(eq(companyProfilesTable.id, existing.id));
  res.json({ ok: true });
});

/** Admin: doğrulama durumu */
router.patch("/admin/company-profiles/:id/verify", authMiddleware, async (req, res): Promise<void> => {
  await ensureCompanySchema();
  if (req.user!.role !== "admin" && req.user!.role !== "moderator") {
    res.status(403).json({ error: "Yetkisiz" });
    return;
  }
  const id = parseInt(String(req.params["id"]), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const isVerified = !!(req.body as { isVerified?: boolean }).isVerified;
  const [updated] = await db
    .update(companyProfilesTable)
    .set({ isVerified, updatedAt: new Date() })
    .where(eq(companyProfilesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Bulunamadı" });
    return;
  }
  res.json(profileJson(updated));
});

router.get("/company-logos/:filename", (req, res): void => {
  const filename = String(req.params["filename"]).replace(/[^a-zA-Z0-9_\-\.]/g, "");
  const filepath = path.join(COMPANY_LOGO_DIR, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).end();
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(filepath);
});

export default router;
