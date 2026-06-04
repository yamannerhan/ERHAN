import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { db, partTimeWorkersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

// ── Avatar upload setup ─────────────────────────────────────────────
const UPLOADS_DIR = path.join(process.cwd(), "uploads", "parttime");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Helper ─────────────────────────────────────────────────────────
function workerJson(w: typeof partTimeWorkersTable.$inferSelect) {
  return {
    id: w.id,
    userId: w.userId,
    fullName: w.fullName,
    age: w.age,
    isRetired: w.isRetired,
    gender: w.gender,
    phone: w.phone,
    city: w.city,
    district: w.district,
    hasVehicle: w.hasVehicle,
    description: w.description ?? null,
    photoUrl: w.photoUrl ?? null,
    isFeatured: w.isFeatured,
    isBanned: w.isBanned,
    banReason: w.banReason ?? null,
    status: w.status,
    createdAt: w.createdAt.toISOString(),
  };
}

// ── GET /api/parttime — list (public) ──────────────────────────────
router.get("/parttime", async (req, res): Promise<void> => {
  const { city, district } = req.query as { city?: string; district?: string };

  let rows = await db
    .select()
    .from(partTimeWorkersTable)
    .where(eq(partTimeWorkersTable.status, "active"))
    .orderBy(desc(partTimeWorkersTable.isFeatured), desc(partTimeWorkersTable.createdAt));

  if (city) rows = rows.filter(r => r.city === city);
  if (district) rows = rows.filter(r => r.district === district);

  res.json(rows.map(workerJson));
});

// ── GET /api/parttime/cities — available cities with counts ────────
router.get("/parttime/cities", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ city: partTimeWorkersTable.city, count: sql<number>`count(*)::int` })
    .from(partTimeWorkersTable)
    .where(eq(partTimeWorkersTable.status, "active"))
    .groupBy(partTimeWorkersTable.city)
    .orderBy(desc(sql`count(*)`));

  res.json(rows);
});

// ── GET /api/parttime/mine — my own listing ────────────────────────
router.get("/parttime/mine", authMiddleware, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(partTimeWorkersTable)
    .where(eq(partTimeWorkersTable.userId, req.user!.id));

  if (!row) { res.json(null); return; }
  res.json(workerJson(row));
});

// ── POST /api/parttime — register ─────────────────────────────────
router.post("/parttime", authMiddleware, async (req, res): Promise<void> => {
  const { fullName, age, isRetired, gender, phone, city, district, hasVehicle, description } =
    req.body as {
      fullName?: string; age?: number; isRetired?: boolean; gender?: string;
      phone?: string; city?: string; district?: string; hasVehicle?: string; description?: string;
    };

  if (!fullName || !age || !phone || !city || !district) {
    res.status(400).json({ error: "Zorunlu alanlar eksik" });
    return;
  }

  // Her kullanıcı sadece bir kayıt yapabilir
  const [existing] = await db
    .select()
    .from(partTimeWorkersTable)
    .where(eq(partTimeWorkersTable.userId, req.user!.id));

  if (existing) {
    res.status(400).json({ error: "Zaten listedesiniz. Kaydınızı güncelleyin." });
    return;
  }

  const [worker] = await db.insert(partTimeWorkersTable).values({
    userId: req.user!.id,
    fullName: fullName.trim(),
    age: Number(age),
    isRetired: !!isRetired,
    gender: gender || "Bay",
    phone: phone.trim(),
    city: city.trim(),
    district: district.trim(),
    hasVehicle: hasVehicle || "Yok",
    description: description?.trim() || null,
  }).returning();

  res.status(201).json(workerJson(worker!));
});

// ── PATCH /api/parttime/:id — update own ──────────────────────────
router.patch("/parttime/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0");
  const [existing] = await db.select().from(partTimeWorkersTable).where(eq(partTimeWorkersTable.id, id));

  if (!existing) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }

  const isAdmin = req.user!.role === "admin" || req.user!.role === "moderator";
  if (existing.userId !== req.user!.id && !isAdmin) {
    res.status(403).json({ error: "Yetkisiz" }); return;
  }

  const { fullName, age, isRetired, gender, phone, city, district, hasVehicle, description } =
    req.body as {
      fullName?: string; age?: number; isRetired?: boolean; gender?: string;
      phone?: string; city?: string; district?: string; hasVehicle?: string; description?: string;
    };

  const updates: Partial<typeof partTimeWorkersTable.$inferInsert> = {};
  if (fullName !== undefined) updates.fullName = fullName.trim();
  if (age !== undefined) updates.age = Number(age);
  if (isRetired !== undefined) updates.isRetired = !!isRetired;
  if (gender !== undefined) updates.gender = gender;
  if (phone !== undefined) updates.phone = phone.trim();
  if (city !== undefined) updates.city = city.trim();
  if (district !== undefined) updates.district = district.trim();
  if (hasVehicle !== undefined) updates.hasVehicle = hasVehicle;
  if (description !== undefined) updates.description = description?.trim() || null;

  const [updated] = await db.update(partTimeWorkersTable).set(updates).where(eq(partTimeWorkersTable.id, id)).returning();
  res.json(workerJson(updated!));
});

// ── DELETE /api/parttime/:id — delete ─────────────────────────────
router.delete("/parttime/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0");
  const [existing] = await db.select().from(partTimeWorkersTable).where(eq(partTimeWorkersTable.id, id));

  if (!existing) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }

  const isAdmin = req.user!.role === "admin" || req.user!.role === "moderator";
  if (existing.userId !== req.user!.id && !isAdmin) {
    res.status(403).json({ error: "Yetkisiz" }); return;
  }

  await db.delete(partTimeWorkersTable).where(eq(partTimeWorkersTable.id, id));
  res.json({ success: true });
});

// ── POST /api/parttime/:id/feature — admin only ───────────────────
router.post("/parttime/:id/feature", authMiddleware, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Yetkisiz" }); return; }

  const id = parseInt(req.params["id"] || "0");
  const [existing] = await db.select().from(partTimeWorkersTable).where(eq(partTimeWorkersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }

  const [updated] = await db
    .update(partTimeWorkersTable)
    .set({ isFeatured: !existing.isFeatured })
    .where(eq(partTimeWorkersTable.id, id))
    .returning();

  res.json(workerJson(updated!));
});

// ── POST /api/parttime/:id/ban — admin | moderator ────────────────
router.post("/parttime/:id/ban", authMiddleware, async (req, res): Promise<void> => {
  const isStaff = req.user!.role === "admin" || req.user!.role === "moderator";
  if (!isStaff) { res.status(403).json({ error: "Yetkisiz" }); return; }

  const id = parseInt(req.params["id"] || "0");
  const { ban, reason } = req.body as { ban?: boolean; reason?: string };

  const [existing] = await db.select().from(partTimeWorkersTable).where(eq(partTimeWorkersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }

  const [updated] = await db
    .update(partTimeWorkersTable)
    .set({
      isBanned: !!ban,
      banReason: ban ? (reason?.trim() || "Kural ihlali") : null,
      status: ban ? "banned" : "active",
    })
    .where(eq(partTimeWorkersTable.id, id))
    .returning();

  res.json(workerJson(updated!));
});

// ── POST /api/parttime/:id/photo — upload photo ───────────────────
router.post("/parttime/:id/photo", authMiddleware, upload.single("photo"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Fotoğraf gerekli" }); return; }

  const id = parseInt(req.params["id"] || "0");
  const [existing] = await db.select().from(partTimeWorkersTable).where(eq(partTimeWorkersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }

  const isAdmin = req.user!.role === "admin" || req.user!.role === "moderator";
  if (existing.userId !== req.user!.id && !isAdmin) {
    res.status(403).json({ error: "Yetkisiz" }); return;
  }

  const filename = `${id}_${Date.now()}.jpg`;
  const filepath = path.join(UPLOADS_DIR, filename);

  await sharp(req.file.buffer)
    .resize(400, 400, { fit: "cover", position: "center" })
    .jpeg({ quality: 85 })
    .toFile(filepath);

  const photoUrl = `/api/parttime-photos/${filename}`;
  const [updated] = await db.update(partTimeWorkersTable).set({ photoUrl }).where(eq(partTimeWorkersTable.id, id)).returning();
  res.json(workerJson(updated!));
});

// ── GET /api/parttime-photos/:filename — serve photos ─────────────
router.get("/parttime-photos/:filename", (req, res): void => {
  const filename = req.params["filename"];
  if (!filename) { res.status(404).end(); return; }
  const filepath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filepath)) { res.status(404).end(); return; }
  res.sendFile(filepath);
});

// ── GET /api/admin/parttime — admin list all ───────────────────────
router.get("/admin/parttime", authMiddleware, async (req, res): Promise<void> => {
  const isStaff = req.user!.role === "admin" || req.user!.role === "moderator";
  if (!isStaff) { res.status(403).json({ error: "Yetkisiz" }); return; }

  const rows = await db
    .select()
    .from(partTimeWorkersTable)
    .orderBy(desc(partTimeWorkersTable.createdAt));

  res.json(rows.map(workerJson));
});

export default router;
