import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { db, usersTable, listingsTable, listingFavoritesTable } from "@workspace/db";
import { eq, sql, or, desc, ilike } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth";
import { loadListingCompanyOverlays } from "../lib/listing-company-overlays";
import { listingBadgeMeta, listingDisplayDate } from "../lib/listing-source";

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
    xp: u.xp ?? 0,
    level: u.level ?? 1,
    avatarFrame: u.avatarFrame ?? "none",
    chatBubble: u.chatBubble ?? "default",
    chatBubbleExpiresAt: u.chatBubbleExpiresAt?.toISOString() ?? null,
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
    if (req.file.buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: "Hareketli GIF en fazla 5 MB olabilir." });
      return;
    }
    // GIF’i olduğu gibi sakla (animasyon korunsun)
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
  const q = String(req.query["q"] ?? "").trim();

  // Boş sorgu: son kayıtlı gerçek kullanıcılar (etiket listesi)
  if (!q) {
    const recent = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(sql`${usersTable.role} IN ('user','moderator','admin')`)
      .orderBy(desc(usersTable.id))
      .limit(10);
    res.json(recent);
    return;
  }

  const pattern = `%${q}%`;
  const filtered = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(or(
      ilike(usersTable.username, pattern),
      sql`coalesce(${usersTable.displayName}, '') ILIKE ${pattern}`,
    ))
    .orderBy(desc(usersTable.id))
    .limit(12);

  res.json(filtered);
});

// ── Public profile ────────────────────────────────────────────────
router.get("/users/profile/:username", async (req, res): Promise<void> => {
  const username = Array.isArray(req.params["username"]) ? req.params["username"][0] : req.params["username"];
  if (!username) { res.status(400).json({ error: "Geçersiz kullanıcı adı" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(eq(listingsTable.authorId, user.id));
  const { getBadgesForUser } = await import("../lib/user-badges");
  const { levelNameColor, xpProgress } = await import("../lib/levels");
  const badges = await getBadgesForUser(user.id);
  const level = user.level ?? 1;
  const xp = user.xp ?? 0;

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? null,
    role: user.role,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    nameColor: user.nameColor ?? (user.role === "user" ? levelNameColor(level) : null),
    nameAnimated: user.nameAnimated,
    isVip: user.isVip && (!user.vipUntil || user.vipUntil > new Date()),
    vipUntil: user.vipUntil?.toISOString() ?? null,
    level,
    xp,
    xpProgress: xpProgress(xp, level),
    badges,
    avatarFrame: user.avatarFrame ?? "none",
    chatBubble: (() => {
      if (user.chatBubbleExpiresAt && user.chatBubbleExpiresAt < new Date()) return "default";
      return user.chatBubble ?? "default";
    })(),
    isVerifiedPublisher: !!user.isVerifiedPublisher && user.verificationStatus === "verified",
    verificationStatus: user.verificationStatus,
    verificationType: user.verificationType,
    listingCount: countResult?.count ?? 0,
    createdAt: user.createdAt.toISOString(),
  });
});

/** Sitede açık kalma — XP heartbeat (~2 dk) */
router.post("/users/presence", authMiddleware, async (req, res): Promise<void> => {
  const { awardPresenceXp, xpProgress } = await import("../lib/levels");
  const result = await awardPresenceXp(req.user!.id);
  if (!result) {
    res.json({ ok: true, awarded: false });
    return;
  }
  res.json({
    ok: true,
    awarded: true,
    xp: result.xp,
    level: result.level,
    xpProgress: xpProgress(result.xp, result.level),
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
  const companyOverlays = await loadListingCompanyOverlays(listings);

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
    companyLogoUrl: companyOverlays.get(l.id)?.logoPath ?? l.companyLogoUrl,
    companyVerified: l.sourceType === "bot_imported"
      || ["telegram", "whatsapp", "eleman", "demo"].includes(l.sourceTag ?? "")
      ? false
      : !!l.verifiedPublisher,
    sourceType: l.sourceType ?? null,
    sourceName: l.sourceName ?? null,
    verifiedPublisher: !!l.verifiedPublisher,
    lastCheckedAt: l.lastCheckedAt?.toISOString() ?? l.lastSeenAt?.toISOString() ?? null,
    badges: listingBadgeMeta(l),
    authorId: l.authorId,
    authorUsername: null,
    isLikedByMe: false,
    isFavoritedByMe: true,
    createdAt: listingDisplayDate(l).toISOString(),
  })));
});

export default router;
