import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { db, usersTable, listingsTable, listingFavoritesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

function userJson(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName ?? null,
    fullName: u.fullName ?? null,
    role: u.role,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    phone: u.phone ?? null,
    birthDate: u.birthDate ?? null,
    height: u.height ?? null,
    weight: u.weight ?? null,
    address: u.address ?? null,
    maritalStatus: u.maritalStatus ?? null,
    nameColor: u.nameColor,
    nameAnimated: u.nameAnimated,
    isVip: u.isVip && (!u.vipUntil || u.vipUntil > new Date()),
    vipUntil: u.vipUntil?.toISOString() ?? null,
    isBanned: u.isBanned,
    banReason: u.banReason,
    banExpiresAt: u.banExpiresAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post("/users/avatar", authMiddleware, upload.single("avatar"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Resim dosyası gerekli (jpg, png, webp, gif)" }); return; }

  const isGif = req.file.mimetype === "image/gif";

  if (isGif) {
    const role = req.user!.role;
    if (role !== "admin" && role !== "moderator") {
      res.status(403).json({ error: "Hareketli GIF yükleme sadece yönetici ve moderatörlere özeldir." });
      return;
    }
    if (req.file.buffer.length > 3 * 1024 * 1024) {
      res.status(400).json({ error: "Kalıcı GIF profil resmi en fazla 3 MB olabilir." });
      return;
    }
    const avatarUrl = `data:image/gif;base64,${req.file.buffer.toString("base64")}`;
    const [updated] = await db.update(usersTable).set({ avatarUrl }).where(eq(usersTable.id, req.user!.id)).returning();
    res.json(userJson(updated));
    return;
  }

  const avatarBuffer = await sharp(req.file.buffer)
    .resize(256, 256, { fit: "cover", position: "center" })
    .jpeg({ quality: 85 })
    .toBuffer();

  const avatarUrl = `data:image/jpeg;base64,${avatarBuffer.toString("base64")}`;
  const [updated] = await db.update(usersTable).set({ avatarUrl }).where(eq(usersTable.id, req.user!.id)).returning();
  res.json(userJson(updated));
});

// ── User search for @ mention ─────────────────────────────────────
router.get("/users/search", async (req, res): Promise<void> => {
  const q = String(req.query["q"] ?? "").trim().toLowerCase();
  if (!q) { res.json([]); return; }

  const all = await db
    .select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl, role: usersTable.role })
    .from(usersTable)
    .limit(8);

  const filtered = all.filter(u => u.username.toLowerCase().startsWith(q)).slice(0, 6);
  res.json(filtered);
});

// ── Public profile ────────────────────────────────────────────────
router.get("/users/profile/:username", async (req, res): Promise<void> => {
  const username = Array.isArray(req.params["username"]) ? req.params["username"][0] : req.params["username"];
  if (!username) { res.status(400).json({ error: "Geçersiz kullanıcı adı" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(eq(listingsTable.authorId, user.id));

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? null,
    role: user.role,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    nameColor: user.nameColor,
    nameAnimated: user.nameAnimated,
    isVip: user.isVip && (!user.vipUntil || user.vipUntil > new Date()),
    vipUntil: user.vipUntil?.toISOString() ?? null,
    listingCount: countResult?.count ?? 0,
    createdAt: user.createdAt.toISOString(),
  });
});

// ── Update own profile ────────────────────────────────────────────
router.patch("/users/me", authMiddleware, async (req, res): Promise<void> => {
  const { bio, avatarUrl, displayName, fullName, phone, birthDate, height, weight, address, maritalStatus } = req.body as {
    bio?: string | null; avatarUrl?: string | null; displayName?: string | null; fullName?: string | null;
    phone?: string | null; birthDate?: string | null;
    height?: string | null; weight?: string | null;
    address?: string | null; maritalStatus?: string | null;
  };
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (bio !== undefined) updates.bio = bio ?? null;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl ?? null;
  if (displayName !== undefined) updates.displayName = displayName?.trim() || null;
  if (fullName !== undefined) updates.fullName = fullName?.trim() || null;
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (birthDate !== undefined) updates.birthDate = birthDate?.trim() || null;
  if (height !== undefined) updates.height = height?.trim() || null;
  if (weight !== undefined) updates.weight = weight?.trim() || null;
  if (address !== undefined) updates.address = address?.trim() || null;
  if (maritalStatus !== undefined) updates.maritalStatus = maritalStatus?.trim() || null;

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.id)).returning();
  res.json(userJson(updated));
});

// ── Favorites ─────────────────────────────────────────────────────
router.get("/users/favorites", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const favs = await db.select({ listingId: listingFavoritesTable.listingId }).from(listingFavoritesTable).where(eq(listingFavoritesTable.userId, userId));
  if (favs.length === 0) { res.json([]); return; }

  const listingIds = favs.map(f => f.listingId);
  const listings = await db.select().from(listingsTable).where(sql`${listingsTable.id} = ANY(${listingIds})`);

  res.json(listings.map(l => ({
    id: l.id,
    title: l.title,
    company: l.company,
    city: l.city,
    salary: l.salary,
    workType: l.workType,
    description: l.description,
    requirements: l.requirements,
    status: l.status,
    viewCount: l.viewCount,
    likeCount: l.likeCount,
    isFeatured: l.isFeatured,
    cardTheme: l.cardTheme,
    applyUrl: l.applyUrl,
    companyLogoUrl: l.companyLogoUrl,
    authorId: l.authorId,
    authorUsername: null,
    isLikedByMe: false,
    isFavoritedByMe: true,
    createdAt: l.createdAt.toISOString(),
  })));
});

export default router;
