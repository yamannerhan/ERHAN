import { Router } from "express";
import { db, listingsTable, listingLikesTable, listingFavoritesTable, usersTable, adminSettingsTable, chatMessagesTable, notificationsTable } from "@workspace/db";
import { eq, desc, and, sql, ilike, inArray } from "drizzle-orm";
import { authMiddleware, optionalAuthMiddleware, requireAdmin } from "../middlewares/auth";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";

// ── Listing image upload setup ──────────────────────────────────────────────
const LISTING_IMAGES_DIR = path.join(process.cwd(), "uploads", "listing-images");
fs.mkdirSync(LISTING_IMAGES_DIR, { recursive: true });

const listingImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Auto image selection by keyword ────────────────────────────────────────
const LISTING_AUTO_IMAGES: { keywords: string[]; url: string }[] = [
  { keywords: ["otel","hotel","resort","turizm","tatil","konaklama"], url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=75&fit=crop" },
  { keywords: ["hastane","klinik","sağlık","medikal","tıp","poliklinik"], url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&q=75&fit=crop" },
  { keywords: ["avm","mall","alışveriş","mağaza","market"], url: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=75&fit=crop" },
  { keywords: ["şantiye","inşaat","toki","yapı","bina"], url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=75&fit=crop" },
  { keywords: ["liman","gemi","deniz","sahil","iskele"], url: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=800&q=75&fit=crop" },
  { keywords: ["fabrika","sanayi","depo","lojistik","üretim","atölye"], url: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=75&fit=crop" },
  { keywords: ["banka","finans","sigorta","plaza","ofis","merkez"], url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=75&fit=crop" },
  { keywords: ["okul","üniversite","kampüs","eğitim","anaokul"], url: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&q=75&fit=crop" },
  { keywords: ["site","konut","apartman","residans","rezidans"], url: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=75&fit=crop" },
];
const DEFAULT_LISTING_IMAGE = "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=800&q=75&fit=crop";

function pickAutoImage(title: string, description: string | null): string {
  const hay = (title + " " + (description ?? "")).toLowerCase();
  for (const { keywords, url } of LISTING_AUTO_IMAGES) {
    if (keywords.some(k => hay.includes(k))) return url;
  }
  return DEFAULT_LISTING_IMAGE;
}

const router = Router();

// Regex patterns for masking contact info in descriptions
const PHONE_MASK_RE = /(?:0|\+90)[\s\-]?(?:\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\d{3}[\s\-]?\d{7})/g;
// Only label words that are typically followed by a PERSON NAME (not phone numbers)
const NAME_AFTER_LABEL_RE = /(?:^|[\s\n])(?:iletişim|irtibat|yetkili|sorumlu|koordinatör|temsilci)\s*[:\-]?\s*([A-ZÇĞİÖŞÜ][a-zçğışöü]{2,20}\s+[A-ZÇĞİÖŞÜ][a-zçğışöü]{2,20})/gim;

function maskContactInfo(text: string): string {
  // Replace phone numbers
  let s = text.replace(PHONE_MASK_RE, "[GİRİŞ_GEREKLİ]");
  // Replace person name (capture group 1) after contact labels, keep label prefix
  s = s.replace(NAME_AFTER_LABEL_RE, (full, name: string) =>
    full.slice(0, full.lastIndexOf(name)) + "[GİRİŞ_GEREKLİ]"
  );
  return s;
}

function hasSensitiveInfo(text: string | null, applyUrl: string | null): boolean {
  if (!text && !applyUrl) return false;
  if (applyUrl?.startsWith("tel:")) return true;
  if (text) {
    const hasPhone = PHONE_MASK_RE.test(text);
    PHONE_MASK_RE.lastIndex = 0;
    const hasName = NAME_AFTER_LABEL_RE.test(text);
    NAME_AFTER_LABEL_RE.lastIndex = 0;
    if (hasPhone || hasName) return true;
  }
  return false;
}

function formatListing(listing: typeof listingsTable.$inferSelect, userId?: number, likedIds?: Set<number>, favIds?: Set<number>, authorUsername?: string | null) {
  const isAuth = userId != null;
  const rawDesc = listing.description;
  const rawApplyUrl = listing.applyUrl;

  // Mask sensitive info for unauthenticated users
  const description = rawDesc ? (isAuth ? rawDesc : maskContactInfo(rawDesc)) : null;
  const applyUrl = rawApplyUrl
    ? (isAuth ? rawApplyUrl : (rawApplyUrl.startsWith("tel:") || rawApplyUrl.startsWith("http") ? "auth_required" : rawApplyUrl))
    : null;

  // Reset regex state after use
  PHONE_MASK_RE.lastIndex = 0;
  NAME_AFTER_LABEL_RE.lastIndex = 0;

  const companyLogoUrl = listing.companyLogoUrl || pickAutoImage(listing.title, listing.description);

  return {
    id: listing.id,
    title: listing.title,
    company: listing.company || "Belirtilmedi",
    city: listing.city,
    salary: listing.salary,
    workType: listing.workType,
    description,
    requirements: listing.requirements,
    status: listing.status,
    viewCount: listing.viewCount,
    likeCount: listing.likeCount,
    isFeatured: listing.isFeatured,
    applyUrl,
    contactInfoMasked: !isAuth && hasSensitiveInfo(rawDesc, rawApplyUrl),
    companyLogoUrl,
    authorId: listing.authorId,
    authorUsername: authorUsername ?? null,
    isLikedByMe: userId != null && likedIds != null ? likedIds.has(listing.id) : false,
    isFavoritedByMe: userId != null && favIds != null ? favIds.has(listing.id) : false,
    expiresAt: listing.expiresAt ? listing.expiresAt.toISOString() : null,
    createdAt: listing.createdAt.toISOString(),
  };
}

router.get("/listings", optionalAuthMiddleware, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "10"), 10)));
  const offset = (page - 1) * limit;
  const city = req.query["city"] as string | undefined;
  const search = req.query["search"] as string | undefined;
  const featured = req.query["featured"] === "true";

  const conditions = [];
  if (featured) conditions.push(eq(listingsTable.isFeatured, true));
  if (city) conditions.push(ilike(listingsTable.city, `%${city}%`));
  if (search) conditions.push(ilike(listingsTable.title, `%${search}%`));
  conditions.push(eq(listingsTable.status, "active"));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [listings, countResult] = await Promise.all([
    db.select().from(listingsTable).where(whereClause).orderBy(desc(listingsTable.isFeatured), desc(listingsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  const userId = req.user?.id;

  let likedIds = new Set<number>();
  let favIds = new Set<number>();

  if (userId) {
    const [likes, favs] = await Promise.all([
      db.select({ listingId: listingLikesTable.listingId }).from(listingLikesTable).where(eq(listingLikesTable.userId, userId)),
      db.select({ listingId: listingFavoritesTable.listingId }).from(listingFavoritesTable).where(eq(listingFavoritesTable.userId, userId)),
    ]);
    likedIds = new Set(likes.map(l => l.listingId));
    favIds = new Set(favs.map(f => f.listingId));
  }

  const authorIds = [...new Set(listings.map(l => l.authorId).filter(Boolean) as number[])];
  let authorMap = new Map<number, string>();
  if (authorIds.length > 0) {
    const authors = await db.select({ id: usersTable.id, username: usersTable.username }).from(usersTable).where(inArray(usersTable.id, authorIds));
    authorMap = new Map(authors.map(a => [a.id, a.username]));
  }

  res.json({
    listings: listings.map(l => formatListing(l, userId, likedIds, favIds, l.authorId ? authorMap.get(l.authorId) : null)),
    total,
    page,
    limit,
  });
});

// ── Listing image upload ────────────────────────────────────────────────────
router.post("/listings/image-upload", authMiddleware, listingImageUpload.single("image"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Resim dosyası gerekli (jpg, png, webp)" }); return; }
  const filename = `listing_${req.user!.id}_${Date.now()}.jpg`;
  const filepath = path.join(LISTING_IMAGES_DIR, filename);
  await sharp(req.file.buffer)
    .resize(800, 450, { fit: "cover", position: "center" })
    .jpeg({ quality: 85 })
    .toFile(filepath);
  const url = `/api/listing-images/${filename}`;
  res.json({ url });
});

// ── Serve listing images ───────────────────────────────────────────────────
router.get("/listing-images/:filename", (req, res): void => {
  const filename = String(req.params["filename"]).replace(/[^a-zA-Z0-9_\-\.]/g, "");
  const filepath = path.join(LISTING_IMAGES_DIR, filename);
  if (!fs.existsSync(filepath)) { res.status(404).end(); return; }
  res.sendFile(filepath);
});

router.post("/listings", authMiddleware, async (req, res): Promise<void> => {
  const { title, company, city, salary, workType, description, requirements, applyUrl, companyLogoUrl } = req.body as Record<string, string | undefined>;

  if (!title || !company || !city) {
    res.status(400).json({ error: "Başlık, firma ve şehir zorunludur" });
    return;
  }

  // Aynı başlıklı ilan son 7 gün içinde yayınlanmış mı?
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [dup] = await db.select({ id: listingsTable.id, company: listingsTable.company })
    .from(listingsTable)
    .where(and(
      ilike(listingsTable.title, title.trim()),
      eq(listingsTable.status, "active"),
      sql`${listingsTable.createdAt} > ${sevenDaysAgo}`,
    ))
    .limit(1);
  if (dup) {
    res.status(409).json({ error: `"${title.trim()}" başlıklı bir ilan son 7 gün içinde zaten yayınlandı. Aynı başlıklı ilan 7 gün geçmeden tekrar eklenemez.` });
    return;
  }

  const [listing] = await db.insert(listingsTable).values({
    title,
    company,
    city,
    salary: salary ?? null,
    workType: workType ?? "Tam Zamanlı",
    description: description ?? null,
    requirements: requirements ?? null,
    applyUrl: applyUrl ?? null,
    companyLogoUrl: companyLogoUrl ?? null,
    authorId: req.user!.id,
    status: "active",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }).returning();

  // Announce new listing in chat if enabled
  try {
    const settings = await db.select().from(adminSettingsTable).limit(1);
    if (settings[0]?.chatAnnounceListings !== false) {
      const chatContent = `Yeni ilan: ${title} — ${company} (${city})${salary ? ` • ${salary}` : ""}`;
      const [chatMsg] = await db.insert(chatMessagesTable).values({
        content: chatContent,
        userId: 0, // bot user
        isPinned: false,
        isDeleted: false,
      }).returning();
      const io = (req as unknown as { app: { get: (k: string) => unknown } }).app.get("io") as { emit: (e: string, d: unknown) => void } | null;
      if (io && chatMsg) {
        io.emit("chat:message", {
          id: chatMsg.id,
          content: chatContent,
          userId: 0,
          username: "GuvenlikBot",
          displayName: null,
          userAvatarUrl: null,
          userNameColor: "#06B6D4",
          userNameAnimated: false,
          userRole: "bot",
          replyToId: null,
          replyToUsername: null,
          replyToContent: null,
          isPinned: false,
          isBot: true,
          listingId: listing!.id,
          mentions: [],
          createdAt: chatMsg.createdAt.toISOString(),
        });
      }
    }
  } catch { /* don't fail the listing creation */ }

  // Tüm kullanıcılara bildirim gönder (fire-and-forget)
  setImmediate(async () => {
    try {
      const allUsers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.isBanned, false));
      if (allUsers.length > 0) {
        const msg = `Yeni ilan: ${title} — ${company} (${city})`;
        const link = `/ilan/${listing!.id}`;
        await db.insert(notificationsTable).values(
          allUsers.map(u => ({
            userId: u.id,
            type: "listing",
            message: msg,
            linkUrl: link,
            isRead: false,
          }))
        );
      }
    } catch { /* don't fail */ }
  });

  res.status(201).json(formatListing(listing, req.user!.id, new Set(), new Set(), req.user!.username));
});

router.get("/listings/stats/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalResult, todayResult, featuredResult, byCityResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(eq(listingsTable.status, "active")),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(and(eq(listingsTable.status, "active"), sql`${listingsTable.createdAt} >= ${today}`)),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(and(eq(listingsTable.status, "active"), eq(listingsTable.isFeatured, true))),
    db.select({ city: listingsTable.city, count: sql<number>`count(*)::int` }).from(listingsTable).where(eq(listingsTable.status, "active")).groupBy(listingsTable.city).orderBy(sql`count(*) desc`).limit(10),
  ]);

  res.json({
    total: totalResult[0]?.count ?? 0,
    today: todayResult[0]?.count ?? 0,
    featured: featuredResult[0]?.count ?? 0,
    byCity: byCityResult,
  });
});

router.get("/listings/mine", authMiddleware, async (req, res): Promise<void> => {
  const myListings = await db.select()
    .from(listingsTable)
    .where(eq(listingsTable.authorId, req.user!.id))
    .orderBy(desc(listingsTable.createdAt));
  res.json(myListings.map(l => formatListing(l, req.user!.id, new Set(), new Set(), req.user!.username)));
});

router.get("/listings/:id", optionalAuthMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }

  const userId = req.user?.id;
  let isLikedByMe = false;
  let isFavoritedByMe = false;

  if (userId) {
    const [like, fav] = await Promise.all([
      db.select().from(listingLikesTable).where(and(eq(listingLikesTable.listingId, id), eq(listingLikesTable.userId, userId))),
      db.select().from(listingFavoritesTable).where(and(eq(listingFavoritesTable.listingId, id), eq(listingFavoritesTable.userId, userId))),
    ]);
    isLikedByMe = like.length > 0;
    isFavoritedByMe = fav.length > 0;
  }

  let authorUsername: string | null = null;
  if (listing.authorId) {
    const [author] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, listing.authorId));
    authorUsername = author?.username ?? null;
  }

  res.json({ ...formatListing(listing, userId, isLikedByMe ? new Set([id]) : new Set(), isFavoritedByMe ? new Set([id]) : new Set(), authorUsername) });
});

router.patch("/listings/:id", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }

  if (listing.authorId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Bu ilanı düzenleme yetkiniz yok" });
    return;
  }

  const { title, company, city, salary, workType, description, requirements, status, applyUrl, isFeatured } = req.body as Record<string, unknown>;
  const updates: Partial<typeof listingsTable.$inferInsert> = {};
  if (title != null) updates.title = String(title);
  if (company != null) updates.company = String(company);
  if (city != null) updates.city = String(city);
  if (salary !== undefined) updates.salary = salary == null ? null : String(salary);
  if (workType != null) updates.workType = String(workType);
  if (description !== undefined) updates.description = description == null ? null : String(description);
  if (requirements !== undefined) updates.requirements = requirements == null ? null : String(requirements);
  if (status != null && req.user!.role === "admin") updates.status = String(status);
  if (applyUrl !== undefined) updates.applyUrl = applyUrl == null ? null : String(applyUrl);
  if (isFeatured !== undefined && req.user!.role === "admin") updates.isFeatured = Boolean(isFeatured);

  const [updated] = await db.update(listingsTable).set(updates).where(eq(listingsTable.id, id)).returning();
  res.json(formatListing(updated, req.user!.id, new Set(), new Set(), req.user!.username));
});

router.delete("/listings/:id", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }

  if (listing.authorId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Bu ilanı silme yetkiniz yok" });
    return;
  }

  await db.delete(listingsTable).where(eq(listingsTable.id, id));
  res.sendStatus(204);
});

router.post("/listings/:id/republish", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  if (listing.authorId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Bu ilanı yeniden yayınlama yetkiniz yok" }); return;
  }
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [updated] = await db.update(listingsTable)
    .set({ status: "active", expiresAt: newExpiry, createdAt: new Date() })
    .where(eq(listingsTable.id, id))
    .returning();
  res.json(formatListing(updated!, req.user!.id, new Set(), new Set(), req.user!.username));
});

router.post("/listings/:id/like", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const userId = req.user!.id;
  const [existing] = await db.select().from(listingLikesTable).where(and(eq(listingLikesTable.listingId, id), eq(listingLikesTable.userId, userId)));

  let liked: boolean;
  if (existing) {
    await db.delete(listingLikesTable).where(and(eq(listingLikesTable.listingId, id), eq(listingLikesTable.userId, userId)));
    await db.update(listingsTable).set({ likeCount: sql`GREATEST(0, ${listingsTable.likeCount} - 1)` }).where(eq(listingsTable.id, id));
    liked = false;
  } else {
    await db.insert(listingLikesTable).values({ listingId: id, userId });
    await db.update(listingsTable).set({ likeCount: sql`${listingsTable.likeCount} + 1` }).where(eq(listingsTable.id, id));
    liked = true;
  }

  const [updated] = await db.select({ likeCount: listingsTable.likeCount }).from(listingsTable).where(eq(listingsTable.id, id));
  res.json({ liked, likeCount: updated?.likeCount ?? 0 });
});

router.post("/listings/:id/favorite", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const userId = req.user!.id;
  const [existing] = await db.select().from(listingFavoritesTable).where(and(eq(listingFavoritesTable.listingId, id), eq(listingFavoritesTable.userId, userId)));

  if (existing) {
    await db.delete(listingFavoritesTable).where(and(eq(listingFavoritesTable.listingId, id), eq(listingFavoritesTable.userId, userId)));
    res.json({ favorited: false });
  } else {
    await db.insert(listingFavoritesTable).values({ listingId: id, userId });
    res.json({ favorited: true });
  }
});

router.post("/listings/:id/view", optionalAuthMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  await db.update(listingsTable).set({ viewCount: sql`${listingsTable.viewCount} + 1` }).where(eq(listingsTable.id, id));
  res.json({ success: true });
});

// Admin: approve listing
router.post("/admin/listings/:id/approve", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  await db.update(listingsTable).set({ status: "active" }).where(eq(listingsTable.id, id));
  res.json({ success: true, message: "İlan onaylandı" });
});

// Admin: feature listing
router.post("/admin/listings/:id/feature", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select({ isFeatured: listingsTable.isFeatured }).from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }

  await db.update(listingsTable).set({ isFeatured: !listing.isFeatured }).where(eq(listingsTable.id, id));
  res.json({ success: true, message: listing.isFeatured ? "Öne çıkarma kaldırıldı" : "İlan öne çıkarıldı" });
});

// Admin: fake likes
router.post("/admin/listings/:id/fake-likes", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const count = parseInt(String((req.body as Record<string, unknown>)["count"] ?? "10"), 10);
  await db.update(listingsTable).set({ likeCount: sql`${listingsTable.likeCount} + ${count}` }).where(eq(listingsTable.id, id));
  res.json({ success: true, message: `${count} sahte beğeni eklendi` });
});

export default router;
