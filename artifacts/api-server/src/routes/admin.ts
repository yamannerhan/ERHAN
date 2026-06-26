import { Router } from "express";
import { db, usersTable, listingsTable, chatMessagesTable, announcementsTable, adminSettingsTable, bannedWordsTable, bannersTable, supportTicketsTable, chatRulesTable, listingPublishGrantsTable, ipBansTable, deviceBansTable, locationFilterTermsTable } from "@workspace/db";
import { eq, desc, ilike, and, sql, asc, or, isNull, gt, inArray } from "drizzle-orm";
import { authMiddleware, requireAdmin, requireAdminOrModerator } from "../middlewares/auth";
import { onlineSockets } from "./chat";
import { extractGender } from "../lib/job-parsing";
import bcrypt from "bcryptjs";

const router = Router();
const LISTING_CARD_THEMES = new Set(["auto", "gold", "radar", "vip", "urgent", "glass", "stripe", "night", "map", "timeline", "holo", "light", "tactical"]);

function safeId(raw: string | string[] | undefined): number | null {
  const id = parseInt(String(Array.isArray(raw) ? raw[0] : raw ?? ""), 10);
  return isNaN(id) ? null : id;
}

function normalizeListingCardTheme(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const theme = value.trim().toLowerCase();
  return LISTING_CARD_THEMES.has(theme) && theme !== "auto" ? theme : null;
}

function parseHiddenListingCities(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((city): city is string => typeof city === "string") : [];
  } catch {
    return [];
  }
}

function normalizeCityName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function provinceFromListingCity(value: string | null) {
  if (!value?.trim()) return null;
  return normalizeCityName(value.split(/[\/,|-]/)[0] ?? value);
}

function normalizeLocationTerm(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

const BUILTIN_LOCATION_FILTER_TERMS: { province: string; term: string; display: string }[] = [
  { province: "İstanbul", term: "istanbul", display: "İstanbul" },
  { province: "İstanbul", term: "unkapanı", display: "İstanbul / Fatih / Unkapanı" },
  { province: "İstanbul", term: "unkapani", display: "İstanbul / Fatih / Unkapanı" },
  { province: "İstanbul", term: "fatihunkapanı", display: "İstanbul / Fatih / Unkapanı" },
  { province: "İstanbul", term: "fatihunkapani", display: "İstanbul / Fatih / Unkapanı" },
  { province: "İstanbul", term: "basın ekspres", display: "İstanbul / Bağcılar / Basın Ekspres" },
  { province: "İstanbul", term: "basin ekspres", display: "İstanbul / Bağcılar / Basın Ekspres" },
  { province: "İstanbul", term: "ikitelli osb", display: "İstanbul / Başakşehir / İkitelli OSB" },
  { province: "İstanbul", term: "dudullu osb", display: "İstanbul / Ümraniye / Dudullu OSB" },
  { province: "İstanbul", term: "hadımköy osb", display: "İstanbul / Arnavutköy / Hadımköy OSB" },
  { province: "İstanbul", term: "hadimkoy osb", display: "İstanbul / Arnavutköy / Hadımköy OSB" },
  { province: "İstanbul", term: "perpa", display: "İstanbul / Şişli / Perpa" },
  { province: "İstanbul", term: "vadistanbul", display: "İstanbul / Sarıyer / Vadistanbul" },
  { province: "İstanbul", term: "vadi istanbul", display: "İstanbul / Sarıyer / Vadi İstanbul" },
  { province: "İstanbul", term: "mall of istanbul", display: "İstanbul / Başakşehir / Mall of İstanbul" },
  { province: "İstanbul", term: "sabiha gökçen", display: "İstanbul / Pendik / Sabiha Gökçen" },
  { province: "İstanbul", term: "sabiha gokcen", display: "İstanbul / Pendik / Sabiha Gökçen" },
  { province: "İstanbul", term: "istanbul havalimanı", display: "İstanbul / Arnavutköy / İstanbul Havalimanı" },
  { province: "İstanbul", term: "istanbul havalimani", display: "İstanbul / Arnavutköy / İstanbul Havalimanı" },
  { province: "İstanbul", term: "atatürk havalimanı", display: "İstanbul / Bakırköy / Atatürk Havalimanı" },
  { province: "İstanbul", term: "ataturk havalimani", display: "İstanbul / Bakırköy / Atatürk Havalimanı" },
  { province: "İstanbul", term: "kuyumcukent", display: "İstanbul / Bahçelievler / Kuyumcukent" },
  { province: "İstanbul", term: "tekstilkent", display: "İstanbul / Esenler / Tekstilkent" },
  { province: "İstanbul", term: "istoç", display: "İstanbul / Bağcılar / İSTOÇ" },
  { province: "İstanbul", term: "istoc", display: "İstanbul / Bağcılar / İSTOÇ" },
  { province: "Kocaeli", term: "kocaeli", display: "Kocaeli" },
  { province: "Kocaeli", term: "gosb", display: "Kocaeli / Gebze OSB" },
  { province: "Kocaeli", term: "gebze osb", display: "Kocaeli / Gebze OSB" },
  { province: "Kocaeli", term: "gebze organize sanayi bölgesi", display: "Kocaeli / Gebze OSB" },
  { province: "Kocaeli", term: "tosb", display: "Kocaeli / TOSB" },
  { province: "Kocaeli", term: "imes", display: "Kocaeli / Gebze / İMES" },
  { province: "Kocaeli", term: "imes osb", display: "Kocaeli / Gebze / İMES OSB" },
  { province: "Kocaeli", term: "gebkim", display: "Kocaeli / Gebkim" },
  { province: "Kocaeli", term: "gebkim osb", display: "Kocaeli / Gebkim OSB" },
  { province: "Kocaeli", term: "taysad", display: "Kocaeli / TAYSAD" },
  { province: "Kocaeli", term: "şekerpınar", display: "Kocaeli / Çayırova / Şekerpınar" },
  { province: "Kocaeli", term: "sekerpinar", display: "Kocaeli / Çayırova / Şekerpınar" },
  { province: "Kocaeli", term: "dilovası osb", display: "Kocaeli / Dilovası OSB" },
  { province: "Kocaeli", term: "dilovasi osb", display: "Kocaeli / Dilovası OSB" },
  { province: "Kocaeli", term: "güzeller", display: "Kocaeli / Gebze / Güzeller" },
  { province: "Kocaeli", term: "guzeller", display: "Kocaeli / Gebze / Güzeller" },
  { province: "Kocaeli", term: "pelitli", display: "Kocaeli / Gebze / Pelitli" },
  { province: "Kocaeli", term: "balçık", display: "Kocaeli / Gebze / Balçık" },
  { province: "Kocaeli", term: "balcik", display: "Kocaeli / Gebze / Balçık" },
  { province: "Kocaeli", term: "muallimköy", display: "Kocaeli / Gebze / Muallimköy" },
  { province: "Kocaeli", term: "muallimkoy", display: "Kocaeli / Gebze / Muallimköy" },
  { province: "Kocaeli", term: "ford otosan", display: "Kocaeli / Gölcük / Ford Otosan" },
  { province: "Kocaeli", term: "safiport", display: "Kocaeli / Derince / Safiport" },
  { province: "Kocaeli", term: "evyapport", display: "Kocaeli / Körfez / Evyapport" },
];

function normalizeCompare(value: string | null) {
  if (!value) return "";
  return value.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü0-9]/gi, "");
}

async function checkPublishPermission(userId: number, role: string): Promise<{ allowed: boolean; grantId?: number; shouldDecrement?: boolean }> {
  if (role === "admin" || role === "moderator") return { allowed: true };
  const now = new Date();
  const [grant] = await db.select().from(listingPublishGrantsTable)
    .where(and(eq(listingPublishGrantsTable.userId, userId), eq(listingPublishGrantsTable.isActive, true)))
    .limit(1);
  if (!grant) return { allowed: false };
  if (grant.expiresAt && grant.expiresAt < now) return { allowed: false };
  if (grant.grantType === "limited" && (grant.usesRemaining === null || grant.usesRemaining <= 0)) return { allowed: false };
  return { allowed: true, grantId: grant.id, shouldDecrement: grant.grantType === "limited" };
}

function adminUserJson(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName ?? null,
    role: u.role,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    nameColor: u.nameColor,
    nameAnimated: u.nameAnimated,
    isVip: u.isVip && (!u.vipUntil || u.vipUntil > new Date()),
    vipUntil: u.vipUntil?.toISOString() ?? null,
    isBanned: u.isBanned,
    banReason: u.banReason,
    banExpiresAt: u.banExpiresAt?.toISOString() ?? null,
    mutedUntil: u.mutedUntil?.toISOString() ?? null,
    lastKnownIp: u.lastKnownIp ?? null,
    lastDeviceId: u.lastDeviceId ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/admin/stats", authMiddleware, requireAdminOrModerator, async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const settings = await db.select().from(adminSettingsTable).limit(1);
  const s0 = settings[0];
  const fakeMin = s0?.fakeOnlineMin ?? 0;
  const fakeMax = s0?.fakeOnlineMax ?? 0;
  const fakeBonus = fakeMin > 0 || fakeMax > 0
    ? Math.floor(Math.random() * (Math.max(fakeMin, fakeMax) - Math.min(fakeMin, fakeMax) + 1)) + Math.min(fakeMin, fakeMax)
    : (s0?.fakeOnlineBonus ?? 0);

  const [totalUsers, totalListings, todayListings, totalMessages, bannedUsers, pendingListings] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(eq(listingsTable.status, "active")),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(and(eq(listingsTable.status, "active"), sql`${listingsTable.createdAt} >= ${today}`)),
    db.select({ count: sql<number>`count(*)::int` }).from(chatMessagesTable).where(eq(chatMessagesTable.isDeleted, false)),
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.isBanned, true)),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(eq(listingsTable.status, "pending")),
  ]);

  res.json({
    totalUsers: totalUsers[0]?.count ?? 0,
    onlineUsers: onlineSockets.size + fakeBonus,
    totalListings: totalListings[0]?.count ?? 0,
    todayListings: todayListings[0]?.count ?? 0,
    totalMessages: totalMessages[0]?.count ?? 0,
    bannedUsers: bannedUsers[0]?.count ?? 0,
    pendingListings: pendingListings[0]?.count ?? 0,
    reportedMessages: 0,
  });
});

router.get("/admin/users", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const search = req.query["search"] as string | undefined;
  const limit = 20;
  const offset = (page - 1) * limit;

  const conditions = search ? [ilike(usersTable.username, `%${search}%`)] : [];
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [users, countResult] = await Promise.all([
    db.select().from(usersTable).where(whereClause).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(whereClause),
  ]);

  res.json({ users: users.map(adminUserJson), total: countResult[0]?.count ?? 0 });
});

router.post("/admin/users/:id/ban", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { reason, expiresAt } = req.body as { reason?: string; expiresAt?: string | null };
  if (!reason) { res.status(400).json({ error: "Ban sebebi zorunludur" }); return; }
  if (req.user!.role === "moderator") {
    const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
    if (!target || target.role !== "user") {
      res.status(403).json({ error: "Moderatörler yalnızca normal kullanıcıları yasaklayabilir" }); return;
    }
  }
  await db.update(usersTable).set({ isBanned: true, banReason: reason, banExpiresAt: expiresAt ? new Date(expiresAt) : null }).where(eq(usersTable.id, id));
  res.json({ success: true, message: "Kullanıcı yasaklandı" });
});

router.post("/admin/users/:id/unban", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.update(usersTable).set({ isBanned: false, banReason: null, banExpiresAt: null }).where(eq(usersTable.id, id));
  res.json({ success: true, message: "Yasak kaldırıldı" });
});

// ─── Mute / Unmute ────────────────────────────────────────────────
router.post("/admin/users/:id/mute", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  if (req.user!.role === "moderator") {
    const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
    if (!target || target.role !== "user") { res.status(403).json({ error: "Moderatörler yalnızca normal kullanıcıları susturabilir" }); return; }
  }
  const { hours, days } = req.body as { hours?: number; days?: number };
  let mutedUntil: Date;
  if (days && days > 0) {
    mutedUntil = new Date(Date.now() + days * 24 * 3600 * 1000);
  } else if (hours && hours > 0) {
    mutedUntil = new Date(Date.now() + hours * 3600 * 1000);
  } else {
    res.status(400).json({ error: "Geçerli bir süre belirtilmeli (hours veya days)" }); return;
  }
  await db.update(usersTable).set({ mutedUntil }).where(eq(usersTable.id, id));
  res.json({ success: true, mutedUntil: mutedUntil.toISOString() });
});

router.post("/admin/users/:id/unmute", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.update(usersTable).set({ mutedUntil: null }).where(eq(usersTable.id, id));
  res.json({ success: true });
});

// ─── IP Ban ───────────────────────────────────────────────────────
router.post("/admin/users/:id/ip-ban", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const [target] = await db.select({ lastKnownIp: usersTable.lastKnownIp }).from(usersTable).where(eq(usersTable.id, id));
  if (!target?.lastKnownIp) { res.status(400).json({ error: "Kullanıcının IP adresi henüz bilinmiyor (giriş yapması gerekiyor)" }); return; }
  const { reason, bannedUntil } = req.body as { reason?: string; bannedUntil?: string | null };
  await db.insert(ipBansTable).values({
    ip: target.lastKnownIp,
    reason: reason ?? null,
    bannedBy: req.user!.id,
    bannedUntil: bannedUntil ? new Date(bannedUntil) : null,
  });
  res.json({ success: true, ip: target.lastKnownIp });
});

router.get("/admin/ip-bans", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const bans = await db.select().from(ipBansTable).orderBy(desc(ipBansTable.createdAt));
  res.json(bans.map(b => ({
    id: b.id, ip: b.ip, reason: b.reason, bannedBy: b.bannedBy,
    bannedUntil: b.bannedUntil?.toISOString() ?? null,
    isActive: !b.bannedUntil || b.bannedUntil > now,
    createdAt: b.createdAt.toISOString(),
  })));
});

router.delete("/admin/ip-bans/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(ipBansTable).where(eq(ipBansTable.id, id));
  res.json({ success: true });
});

// ─── Device Ban ───────────────────────────────────────────────────
router.post("/admin/users/:id/device-ban", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const [target] = await db.select({ lastDeviceId: usersTable.lastDeviceId }).from(usersTable).where(eq(usersTable.id, id));
  if (!target?.lastDeviceId) { res.status(400).json({ error: "Kullanıcının cihaz kimliği henüz bilinmiyor" }); return; }
  const { reason, bannedUntil } = req.body as { reason?: string; bannedUntil?: string | null };
  await db.insert(deviceBansTable).values({
    deviceId: target.lastDeviceId,
    reason: reason ?? null,
    bannedBy: req.user!.id,
    bannedUntil: bannedUntil ? new Date(bannedUntil) : null,
  });
  res.json({ success: true, deviceId: target.lastDeviceId });
});

router.get("/admin/device-bans", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const bans = await db.select().from(deviceBansTable).orderBy(desc(deviceBansTable.createdAt));
  res.json(bans.map(b => ({
    id: b.id, deviceId: b.deviceId, reason: b.reason, bannedBy: b.bannedBy,
    bannedUntil: b.bannedUntil?.toISOString() ?? null,
    isActive: !b.bannedUntil || b.bannedUntil > now,
    createdAt: b.createdAt.toISOString(),
  })));
});

router.delete("/admin/device-bans/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(deviceBansTable).where(eq(deviceBansTable.id, id));
  res.json({ success: true });
});

// ─── Admin: reset any user's password ────────────────────────────
router.post("/admin/users/:id/reset-password", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 6) { res.status(400).json({ error: "Yeni şifre en az 6 karakter olmalıdır" }); return; }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, id));
  res.json({ success: true, message: "Şifre sıfırlandı" });
});

// ─── Admin: update user's displayName ────────────────────────────
router.patch("/admin/users/:id/display-name", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { displayName } = req.body as { displayName?: string | null };
  await db.update(usersTable).set({ displayName: displayName?.trim() || null }).where(eq(usersTable.id, id));
  res.json({ success: true });
});

router.post("/admin/create-staff", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { username, email, password, role } = req.body as { username?: string; email?: string; password?: string; role?: string };
  if (!username || !email || !password) { res.status(400).json({ error: "Kullanıcı adı, e-posta ve şifre zorunludur" }); return; }
  const allowedRoles = ["moderator", "admin"];
  const targetRole = allowedRoles.includes(role ?? "") ? role! : "moderator";

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "Bu e-posta zaten kullanılıyor" }); return; }
  const existingUser = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existingUser.length > 0) { res.status(409).json({ error: "Bu kullanıcı adı zaten kullanılıyor" }); return; }

  const hash = await bcrypt.hash(password, 10);
  const [created] = await db.insert(usersTable).values({ username, email, passwordHash: hash, role: targetRole }).returning({ id: usersTable.id, username: usersTable.username, role: usersTable.role });
  res.status(201).json({ success: true, user: created });
});

router.patch("/admin/users/:id/role", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { role } = req.body as { role?: string };
  if (!role || !["user", "moderator", "admin"].includes(role)) { res.status(400).json({ error: "Geçersiz rol" }); return; }
  await db.update(usersTable).set({ role }).where(eq(usersTable.id, id));
  res.json({ success: true, message: "Rol güncellendi" });
});

router.patch("/admin/users/:id/name-color", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { nameColor, nameAnimated } = req.body as { nameColor?: string | null; nameAnimated?: boolean };
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (nameColor !== undefined) updates.nameColor = nameColor ?? null;
  if (nameAnimated !== undefined) updates.nameAnimated = Boolean(nameAnimated);
  await db.update(usersTable).set(updates).where(eq(usersTable.id, id));
  res.json({ success: true, message: "İsim rengi güncellendi" });
});

router.patch("/admin/users/:id/vip", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { enabled, days } = req.body as { enabled?: boolean; days?: number };
  const active = Boolean(enabled);
  const vipUntil = active && days && days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000) : null;
  await db.update(usersTable).set({
    isVip: active,
    vipUntil,
    nameColor: active ? "#FACC15" : null,
    nameAnimated: active,
  }).where(eq(usersTable.id, id));
  res.json({ success: true, isVip: active, vipUntil: vipUntil?.toISOString() ?? null });
});

function settingsJson(s: typeof adminSettingsTable.$inferSelect) {
  return {
    chatLocked: s.chatLocked, fakeOnlineBonus: s.fakeOnlineBonus,
    fakeOnlineMin: s.fakeOnlineMin ?? 0, fakeOnlineMax: s.fakeOnlineMax ?? 0,
    maintenanceMode: s.maintenanceMode, welcomeMessage: s.welcomeMessage,
    hasOpenaiKey: !!s.openaiApiKey, spamCooldown: s.spamCooldown ?? 3,
    chatAnnounceListings: s.chatAnnounceListings ?? true,
    hiddenListingCities: parseHiddenListingCities(s.hiddenListingCities),
    botGuvenlikEnabled: s.botGuvenlikEnabled ?? true,
    botBilgiEnabled: s.botBilgiEnabled ?? true,
    botFakeEnabled: s.botFakeEnabled ?? true,
  };
}

router.get("/admin/settings", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const settings = await db.select().from(adminSettingsTable).limit(1);
  if (!settings[0]) {
    const [created] = await db.insert(adminSettingsTable).values({ chatLocked: false, fakeOnlineBonus: 0, maintenanceMode: false }).returning();
    res.json(settingsJson(created));
    return;
  }
  res.json(settingsJson(settings[0]));
});

router.patch("/admin/settings", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { chatLocked, fakeOnlineBonus, fakeOnlineMin, fakeOnlineMax, maintenanceMode, welcomeMessage, openaiApiKey, spamCooldown, chatAnnounceListings, hiddenListingCities, botGuvenlikEnabled, botBilgiEnabled, botFakeEnabled } = req.body as Record<string, unknown>;
  const updates: Partial<typeof adminSettingsTable.$inferInsert> = {};
  if (chatLocked !== undefined) updates.chatLocked = Boolean(chatLocked);
  if (fakeOnlineBonus !== undefined) updates.fakeOnlineBonus = parseInt(String(fakeOnlineBonus), 10);
  if (fakeOnlineMin !== undefined) updates.fakeOnlineMin = Math.max(0, parseInt(String(fakeOnlineMin), 10) || 0);
  if (fakeOnlineMax !== undefined) updates.fakeOnlineMax = Math.max(0, parseInt(String(fakeOnlineMax), 10) || 0);
  if (maintenanceMode !== undefined) updates.maintenanceMode = Boolean(maintenanceMode);
  if (welcomeMessage !== undefined) updates.welcomeMessage = welcomeMessage == null ? null : String(welcomeMessage);
  if (openaiApiKey !== undefined) updates.openaiApiKey = openaiApiKey == null || openaiApiKey === "" ? null : String(openaiApiKey);
  if (spamCooldown !== undefined) updates.spamCooldown = Math.max(0, parseInt(String(spamCooldown), 10) || 0);
  if (chatAnnounceListings !== undefined) updates.chatAnnounceListings = Boolean(chatAnnounceListings);
  if (botGuvenlikEnabled !== undefined) updates.botGuvenlikEnabled = Boolean(botGuvenlikEnabled);
  if (botBilgiEnabled !== undefined) updates.botBilgiEnabled = Boolean(botBilgiEnabled);
  if (botFakeEnabled !== undefined) updates.botFakeEnabled = Boolean(botFakeEnabled);
  if (hiddenListingCities !== undefined) {
    const cities = Array.isArray(hiddenListingCities)
      ? hiddenListingCities.map(c => normalizeCityName(String(c))).filter(Boolean)
      : [];
    updates.hiddenListingCities = JSON.stringify([...new Set(cities)]);
  }

  const existing = await db.select().from(adminSettingsTable).limit(1);
  let result;
  if (!existing[0]) {
    [result] = await db.insert(adminSettingsTable).values({ chatLocked: false, fakeOnlineBonus: 0, maintenanceMode: false, ...updates }).returning();
  } else {
    [result] = await db.update(adminSettingsTable).set(updates).where(eq(adminSettingsTable.id, existing[0].id)).returning();
  }
  res.json(settingsJson(result!));
});

// ── Smart parser: regex-based, no external API needed ──────────────────────────

// All 81 Turkish provinces (normalized → display)
const TR_CITIES: Record<string, string> = {
  "istanbul":"İstanbul","ankara":"Ankara","izmir":"İzmir","bursa":"Bursa",
  "antalya":"Antalya","adana":"Adana","konya":"Konya","gaziantep":"Gaziantep",
  "sanlıurfa":"Şanlıurfa","sanliurfa":"Şanlıurfa","mersin":"Mersin","kayseri":"Kayseri",
  "eskisehir":"Eskişehir","eskişehir":"Eskişehir","diyarbakir":"Diyarbakır","diyarbakır":"Diyarbakır",
  "samsun":"Samsun","denizli":"Denizli","sırnak":"Şırnak","şırnak":"Şırnak",
  "sakarya":"Sakarya","trabzon":"Trabzon","manisa":"Manisa","kocaeli":"Kocaeli",
  "gebze":"Kocaeli","izmit":"Kocaeli","hatay":"Hatay","antakya":"Hatay",
  "balikesir":"Balıkesir","balıkesir":"Balıkesir","van":"Van","batman":"Batman",
  "malatya":"Malatya","kahramanmaras":"Kahramanmaraş","kahramanmaraş":"Kahramanmaraş",
  "erzurum":"Erzurum","mugla":"Muğla","muğla":"Muğla","bodrum":"Muğla","marmaris":"Muğla","fethiye":"Muğla",
  "tekirdag":"Tekirdağ","tekirdağ":"Tekirdağ","siirt":"Siirt",
  "afyon":"Afyonkarahisar","afyonkarahisar":"Afyonkarahisar",
  "aydin":"Aydın","aydın":"Aydın","kutahya":"Kütahya","kütahya":"Kütahya",
  "corum":"Çorum","çorum":"Çorum","elazig":"Elazığ","elazığ":"Elazığ",
  "mardin":"Mardin","tokat":"Tokat","sivas":"Sivas","kastamonu":"Kastamonu",
  "aksaray":"Aksaray","giresun":"Giresun","mus":"Muş","muş":"Muş","usak":"Uşak","uşak":"Uşak",
  "zonguldak":"Zonguldak","ordu":"Ordu","edirne":"Edirne","bolu":"Bolu",
  "isparta":"Isparta","karabuk":"Karabük","karabük":"Karabük",
  "osmaniye":"Osmaniye","duzce":"Düzce","düzce":"Düzce",
  "yalova":"Yalova","nigde":"Niğde","niğde":"Niğde","nevsehir":"Nevşehir","nevşehir":"Nevşehir",
  "kirikkale":"Kırıkkale","kırıkkale":"Kırıkkale","karaman":"Karaman",
  "agri":"Ağrı","ağrı":"Ağrı","rize":"Rize","bingol":"Bingöl","bingöl":"Bingöl",
  "tunceli":"Tunceli","hakkari":"Hakkari","kars":"Kars","igdir":"Iğdır","iğdır":"Iğdır",
  "ardahan":"Ardahan","sinop":"Sinop","artvin":"Artvin","gumushane":"Gümüşhane","gümüşhane":"Gümüşhane",
  "bayburt":"Bayburt","bitlis":"Bitlis","erzincan":"Erzincan",
  "kirsehir":"Kırşehir","kırşehir":"Kırşehir","yozgat":"Yozgat",
  "cankiri":"Çankırı","çankırı":"Çankırı","bilecik":"Bilecik","amasya":"Amasya",
  "burdur":"Burdur","canakkale":"Çanakkale","çanakkale":"Çanakkale",
  "kirklareli":"Kırklareli","kırklareli":"Kırklareli",
  "adiyaman":"Adıyaman","adıyaman":"Adıyaman","bartin":"Bartın","bartın":"Bartın","kilis":"Kilis",
};

// Comprehensive district → {city, district} map for all major Turkish provinces
// Keys are normalized (lowercase, no Turkish diacritics)
const DISTRICT_TO_CITY: Record<string, { city: string; district: string }> = {
  // ─── İSTANBUL ───
  "adalar":        {city:"İstanbul", district:"Adalar"},
  "arnavutkoy":    {city:"İstanbul", district:"Arnavutköy"},
  "atasehir":      {city:"İstanbul", district:"Ataşehir"},
  "avcilar":       {city:"İstanbul", district:"Avcılar"},
  "bagcilar":      {city:"İstanbul", district:"Bağcılar"},
  "bahcelievler":  {city:"İstanbul", district:"Bahçelievler"},
  "bakirkoy":      {city:"İstanbul", district:"Bakırköy"},
  "basaksehir":    {city:"İstanbul", district:"Başakşehir"},
  "bayrampa":      {city:"İstanbul", district:"Bayrampaşa"},
  "bayrampaşa":    {city:"İstanbul", district:"Bayrampaşa"},
  "besiktas":      {city:"İstanbul", district:"Beşiktaş"},
  "beykoz":        {city:"İstanbul", district:"Beykoz"},
  "beylikduzu":    {city:"İstanbul", district:"Beylikdüzü"},
  "beyoglu":       {city:"İstanbul", district:"Beyoğlu"},
  "buyukcekmece":  {city:"İstanbul", district:"Büyükçekmece"},
  "catalca":       {city:"İstanbul", district:"Çatalca"},
  "cekmekoy":      {city:"İstanbul", district:"Çekmeköy"},
  "esenler":       {city:"İstanbul", district:"Esenler"},
  "esenyurt":      {city:"İstanbul", district:"Esenyurt"},
  "eyupsultan":    {city:"İstanbul", district:"Eyüpsultan"},
  "eyup":          {city:"İstanbul", district:"Eyüpsultan"},
  "fatih":         {city:"İstanbul", district:"Fatih"},
  "unkapani":      {city:"İstanbul", district:"Unkapanı"},
  "unkapanı":      {city:"İstanbul", district:"Unkapanı"},
  "fatihunkapani": {city:"İstanbul", district:"Unkapanı"},
  "fatihunkapanı": {city:"İstanbul", district:"Unkapanı"},
  "gaziosmanpasa": {city:"İstanbul", district:"Gaziosmanpaşa"},
  "gungoren":      {city:"İstanbul", district:"Güngören"},
  "kadikoy":       {city:"İstanbul", district:"Kadıköy"},
  "kagithane":     {city:"İstanbul", district:"Kağıthane"},
  "kartal":        {city:"İstanbul", district:"Kartal"},
  "kucukcekmece":  {city:"İstanbul", district:"Küçükçekmece"},
  "maltepe":       {city:"İstanbul", district:"Maltepe"},
  "pendik":        {city:"İstanbul", district:"Pendik"},
  "sancaktepe":    {city:"İstanbul", district:"Sancaktepe"},
  "sariyer":       {city:"İstanbul", district:"Sarıyer"},
  "silivri":       {city:"İstanbul", district:"Silivri"},
  "sultanbeyli":   {city:"İstanbul", district:"Sultanbeyli"},
  "sultangazi":    {city:"İstanbul", district:"Sultangazi"},
  "sile":          {city:"İstanbul", district:"Şile"},
  "sisli":         {city:"İstanbul", district:"Şişli"},
  "tuzla":         {city:"İstanbul", district:"Tuzla"},
  "umraniye":      {city:"İstanbul", district:"Ümraniye"},
  "uskudar":       {city:"İstanbul", district:"Üsküdar"},
  "zeytinburnu":   {city:"İstanbul", district:"Zeytinburnu"},

  // ─── ANKARA ───
  "altindag":      {city:"Ankara", district:"Altındağ"},
  "akyurt":        {city:"Ankara", district:"Akyurt"},
  "cankaya":       {city:"Ankara", district:"Çankaya"},
  "cubuk":         {city:"Ankara", district:"Çubuk"},
  "elmadal":       {city:"Ankara", district:"Elmadağ"},
  "elmadağ":       {city:"Ankara", district:"Elmadağ"},
  "etimesgut":     {city:"Ankara", district:"Etimesgut"},
  "golbasi":       {city:"Ankara", district:"Gölbaşı"},
  "kahramankazan": {city:"Ankara", district:"Kahramankazan"},
  "kazan":         {city:"Ankara", district:"Kazan"},
  "kecioren":      {city:"Ankara", district:"Keçiören"},
  "kiziicahamam":  {city:"Ankara", district:"Kızılcahamam"},
  "mamak":         {city:"Ankara", district:"Mamak"},
  "polatli":       {city:"Ankara", district:"Polatlı"},
  "pursaklar":     {city:"Ankara", district:"Pursaklar"},
  "sincan":        {city:"Ankara", district:"Sincan"},
  "yenimahalle":   {city:"Ankara", district:"Yenimahalle"},
  "beypazari":     {city:"Ankara", district:"Beypazarı"},
  "haymana":       {city:"Ankara", district:"Haymana"},
  "nallihan":      {city:"Ankara", district:"Nallıhan"},

  // ─── İZMİR ───
  "aliaga":        {city:"İzmir", district:"Aliağa"},
  "balcova":       {city:"İzmir", district:"Balçova"},
  "bayrakli":      {city:"İzmir", district:"Bayraklı"},
  "bergama":       {city:"İzmir", district:"Bergama"},
  "bornova":       {city:"İzmir", district:"Bornova"},
  "buca":          {city:"İzmir", district:"Buca"},
  "cesme":         {city:"İzmir", district:"Çeşme"},
  "cigli":         {city:"İzmir", district:"Çiğli"},
  "foca":          {city:"İzmir", district:"Foça"},
  "gaziemir":      {city:"İzmir", district:"Gaziemir"},
  "guzelbahce":    {city:"İzmir", district:"Güzelbahçe"},
  "karabaglar":    {city:"İzmir", district:"Karabağlar"},
  "karsiyaka":     {city:"İzmir", district:"Karşıyaka"},
  "kemalpasa":     {city:"İzmir", district:"Kemalpaşa"},
  "konak":         {city:"İzmir", district:"Konak"},
  "menemen":       {city:"İzmir", district:"Menemen"},
  "narlidere":     {city:"İzmir", district:"Narlıdere"},
  "odemis":        {city:"İzmir", district:"Ödemiş"},
  "seferihisar":   {city:"İzmir", district:"Seferihisar"},
  "selcuk":        {city:"İzmir", district:"Selçuk"},
  "tire":          {city:"İzmir", district:"Tire"},
  "torbali":       {city:"İzmir", district:"Torbalı"},
  "urla":          {city:"İzmir", district:"Urla"},
  "dikili":        {city:"İzmir", district:"Dikili"},
  "bayindir":      {city:"İzmir", district:"Bayındır"},
  "kinik":         {city:"İzmir", district:"Kınık"},

  // ─── BURSA ───
  "gemlik":        {city:"Bursa", district:"Gemlik"},
  "gursu":         {city:"Bursa", district:"Gürsu"},
  "inegol":        {city:"Bursa", district:"İnegöl"},
  "iznik":         {city:"Bursa", district:"İznik"},
  "karacabey":     {city:"Bursa", district:"Karacabey"},
  "kestel":        {city:"Bursa", district:"Kestel"},
  "mudanya":       {city:"Bursa", district:"Mudanya"},
  "nilufer":       {city:"Bursa", district:"Nilüfer"},
  "osmangazi":     {city:"Bursa", district:"Osmangazi"},
  "yildirim":      {city:"Bursa", district:"Yıldırım"},
  "yenisehir":     {city:"Bursa", district:"Yenişehir"},
  "orhaneli":      {city:"Bursa", district:"Orhaneli"},
  "orhangazi":     {city:"Bursa", district:"Orhangazi"},
  "mustafakemalp": {city:"Bursa", district:"Mustafakemalpaşa"},
  "buyukorhan":    {city:"Bursa", district:"Büyükorhan"},
  "harmancik":     {city:"Bursa", district:"Harmancık"},

  // ─── ANTALYA ───
  "alanya":        {city:"Antalya", district:"Alanya"},
  "kepez":         {city:"Antalya", district:"Kepez"},
  "konyaalti":     {city:"Antalya", district:"Konyaaltı"},
  "muratpasa":     {city:"Antalya", district:"Muratpaşa"},
  "serik":         {city:"Antalya", district:"Serik"},
  "manavgat":      {city:"Antalya", district:"Manavgat"},
  "kemer":         {city:"Antalya", district:"Kemer"},
  "aksu":          {city:"Antalya", district:"Aksu"},
  "dosemealti":    {city:"Antalya", district:"Döşemealtı"},
  "elmali":        {city:"Antalya", district:"Elmalı"},
  "finike":        {city:"Antalya", district:"Finike"},
  "gazipasa":      {city:"Antalya", district:"Gazipaşa"},
  "kas":           {city:"Antalya", district:"Kaş"},
  "kumluca":       {city:"Antalya", district:"Kumluca"},
  "akseki":        {city:"Antalya", district:"Akseki"},
  "korkuteli":     {city:"Antalya", district:"Korkuteli"},

  // ─── ADANA ───
  "cukurova":      {city:"Adana", district:"Çukurova"},
  "seyhan":        {city:"Adana", district:"Seyhan"},
  "yuregir":       {city:"Adana", district:"Yüreğir"},
  "saricam":       {city:"Adana", district:"Sarıçam"},
  "ceyhan":        {city:"Adana", district:"Ceyhan"},
  "kozan":         {city:"Adana", district:"Kozan"},
  "karaisali":     {city:"Adana", district:"Karaisalı"},
  "karatas":       {city:"Adana", district:"Karataş"},
  "pozanti":       {city:"Adana", district:"Pozantı"},
  "imamoglu":      {city:"Adana", district:"İmamoğlu"},
  "feke":          {city:"Adana", district:"Feke"},

  // ─── KOCAELİ ───
  "basiskele":     {city:"Kocaeli", district:"Başiskele"},
  "cayirova":      {city:"Kocaeli", district:"Çayırova"},
  "darica":        {city:"Kocaeli", district:"Darıca"},
  "derince":       {city:"Kocaeli", district:"Derince"},
  "golcuk":        {city:"Kocaeli", district:"Gölcük"},
  "izmit":         {city:"Kocaeli", district:"İzmit"},
  "kandira":       {city:"Kocaeli", district:"Kandıra"},
  "karamursel":    {city:"Kocaeli", district:"Karamürsel"},
  "kartepe":       {city:"Kocaeli", district:"Kartepe"},
  "korfez":        {city:"Kocaeli", district:"Körfez"},
  "gebze":         {city:"Kocaeli", district:"Gebze"},
  "dilovasi":      {city:"Kocaeli", district:"Dilovası"},

  // ─── MERSİN ───
  "akdeniz":       {city:"Mersin", district:"Akdeniz"},
  "mezitli":       {city:"Mersin", district:"Mezitli"},
  "toroslar":      {city:"Mersin", district:"Toroslar"},
  "yenisehirm":    {city:"Mersin", district:"Yenişehir"},
  "tarsus":        {city:"Mersin", district:"Tarsus"},
  "erdemli":       {city:"Mersin", district:"Erdemli"},
  "silifke":       {city:"Mersin", district:"Silifke"},
  "anamur":        {city:"Mersin", district:"Anamur"},
  "mut":           {city:"Mersin", district:"Mut"},
  "gulnar":        {city:"Mersin", district:"Gülnar"},
  "bozyazi":       {city:"Mersin", district:"Bozyazı"},
  "aydincik":      {city:"Mersin", district:"Aydıncık"},

  // ─── GAZİANTEP ───
  "sehitkamil":    {city:"Gaziantep", district:"Şehitkamil"},
  "sahinbey":      {city:"Gaziantep", district:"Şahinbey"},
  "nizip":         {city:"Gaziantep", district:"Nizip"},
  "islahiye":      {city:"Gaziantep", district:"İslahiye"},
  "oguzeli":       {city:"Gaziantep", district:"Oğuzeli"},

  // ─── KONYA ───
  "karatay":       {city:"Konya", district:"Karatay"},
  "meram":         {city:"Konya", district:"Meram"},
  "selcuklu":      {city:"Konya", district:"Selçuklu"},
  "eregli":        {city:"Konya", district:"Ereğli"},
  "aksehir":       {city:"Konya", district:"Akşehir"},
  "cumra":         {city:"Konya", district:"Çumra"},
  "beysehir":      {city:"Konya", district:"Beyşehir"},
  "seydisehir":    {city:"Konya", district:"Seydişehir"},
  "ilgin":         {city:"Konya", district:"Ilgın"},
  "kadinhani":     {city:"Konya", district:"Kadınhanı"},
  "karapinar":     {city:"Konya", district:"Karapınar"},
  "kulu":          {city:"Konya", district:"Kulu"},
  "cihanbeyli":    {city:"Konya", district:"Cihanbeyli"},

  // ─── MUĞLA ───
  "bodrum":        {city:"Muğla", district:"Bodrum"},
  "marmaris":      {city:"Muğla", district:"Marmaris"},
  "fethiye":       {city:"Muğla", district:"Fethiye"},
  "milas":         {city:"Muğla", district:"Milas"},
  "ortaca":        {city:"Muğla", district:"Ortaca"},
  "dalaman":       {city:"Muğla", district:"Dalaman"},
  "seydikemer":    {city:"Muğla", district:"Seydikemer"},
  "kavaklıdere":   {city:"Muğla", district:"Kavaklıdere"},
  "ula":           {city:"Muğla", district:"Ula"},
  "koycegiz":      {city:"Muğla", district:"Köyceğiz"},
  "datca":         {city:"Muğla", district:"Datça"},

  // ─── AYDIN ───
  "efeler":        {city:"Aydın", district:"Efeler"},
  "kusadasi":      {city:"Aydın", district:"Kuşadası"},
  "didim":         {city:"Aydın", district:"Didim"},
  "nazilli":       {city:"Aydın", district:"Nazilli"},
  "soke":          {city:"Aydın", district:"Söke"},
  "incirliova":    {city:"Aydın", district:"İncirliova"},
  "germencik":     {city:"Aydın", district:"Germencik"},
  "karpuzlu":      {city:"Aydın", district:"Karpuzlu"},

  // ─── SAKARYA ───
  "adapazari":     {city:"Sakarya", district:"Adapazarı"},
  "serdivan":      {city:"Sakarya", district:"Serdivan"},
  "erenler":       {city:"Sakarya", district:"Erenler"},
  "arifiye":       {city:"Sakarya", district:"Arifiye"},
  "hendek":        {city:"Sakarya", district:"Hendek"},
  "sapanca":       {city:"Sakarya", district:"Sapanca"},
  "karasu":        {city:"Sakarya", district:"Karasu"},
  "pamukova":      {city:"Sakarya", district:"Pamukova"},

  // ─── TRABZON ───
  "akçaabat":      {city:"Trabzon", district:"Akçaabat"},
  "akcaabat":      {city:"Trabzon", district:"Akçaabat"},
  "ortahisar":     {city:"Trabzon", district:"Ortahisar"},
  "arakli":        {city:"Trabzon", district:"Araklı"},
  "of":            {city:"Trabzon", district:"Of"},
  "vakfikebir":    {city:"Trabzon", district:"Vakfıkebir"},
  "yomra":         {city:"Trabzon", district:"Yomra"},

  // ─── HATAY ───
  "antakya":       {city:"Hatay", district:"Antakya"},
  "iskenderun":    {city:"Hatay", district:"İskenderun"},
  "dortyol":       {city:"Hatay", district:"Dörtyol"},
  "kırıkhan":      {city:"Hatay", district:"Kırıkhan"},
  "kirikhan":      {city:"Hatay", district:"Kırıkhan"},
  "reyhanli":      {city:"Hatay", district:"Reyhanlı"},
  "samandag":      {city:"Hatay", district:"Samandağ"},
  "erzin":         {city:"Hatay", district:"Erzin"},
  "hassa":         {city:"Hatay", district:"Hassa"},
  "belen":         {city:"Hatay", district:"Belen"},

  // ─── MANİSA ───
  "akhisar":       {city:"Manisa", district:"Akhisar"},
  "turgutlu":      {city:"Manisa", district:"Turgutlu"},
  "salihlim":      {city:"Manisa", district:"Salihli"},
  "salihli":       {city:"Manisa", district:"Salihli"},
  "soma":          {city:"Manisa", district:"Soma"},
  "yunusemre":     {city:"Manisa", district:"Yunusemre"},
  "sehzadeler":    {city:"Manisa", district:"Şehzadeler"},
  "alasehir":      {city:"Manisa", district:"Alaşehir"},
  "golmarmara":    {city:"Manisa", district:"Gölmarmara"},

  // ─── BALIKESİR ───
  "bandirma":      {city:"Balıkesir", district:"Bandırma"},
  "edremit":       {city:"Balıkesir", district:"Edremit"},
  "altieylul":     {city:"Balıkesir", district:"Altıeylül"},
  "karesi":        {city:"Balıkesir", district:"Karesi"},
  "burhaniye":     {city:"Balıkesir", district:"Burhaniye"},
  "gomec":         {city:"Balıkesir", district:"Gömeç"},
  "ayvalik":       {city:"Balıkesir", district:"Ayvalık"},
  "erdek":         {city:"Balıkesir", district:"Erdek"},

  // ─── TEKİRDAĞ ───
  "suleymanpasa":  {city:"Tekirdağ", district:"Süleymanpaşa"},
  "corlu":         {city:"Tekirdağ", district:"Çorlu"},
  "cerkezkoy":     {city:"Tekirdağ", district:"Çerkezköy"},
  "kapakli":       {city:"Tekirdağ", district:"Kapaklı"},
  "ergene":        {city:"Tekirdağ", district:"Ergene"},
  "malkara":       {city:"Tekirdağ", district:"Malkara"},
  "muratli":       {city:"Tekirdağ", district:"Muratlı"},
  "hayrabolu":     {city:"Tekirdağ", district:"Hayrabolu"},

  // ─── SAMSUN ───
  "ilkadim":       {city:"Samsun", district:"İlkadım"},
  "canik":         {city:"Samsun", district:"Canik"},
  "atakum":        {city:"Samsun", district:"Atakum"},
  "tekkekoyu":     {city:"Samsun", district:"Tekkeköy"},
  "bafra":         {city:"Samsun", district:"Bafra"},
  "carsamba":      {city:"Samsun", district:"Çarşamba"},
  "vezirkopru":    {city:"Samsun", district:"Vezirköprü"},

  // ─── DENİZLİ ───
  "merkezefendi":  {city:"Denizli", district:"Merkezefendi"},
  "pamukkale":     {city:"Denizli", district:"Pamukkale"},
  "buldan":        {city:"Denizli", district:"Buldan"},
  "civril":        {city:"Denizli", district:"Çivril"},
  "acipayam":      {city:"Denizli", district:"Acıpayam"},
  "tavas":         {city:"Denizli", district:"Tavas"},

  // ─── ŞANLIURFA ───
  "haliliye":      {city:"Şanlıurfa", district:"Haliliye"},
  "karakopru":     {city:"Şanlıurfa", district:"Karaköprü"},
  "birecik":       {city:"Şanlıurfa", district:"Birecik"},
  "viransehir":    {city:"Şanlıurfa", district:"Viranşehir"},
  "siverek":       {city:"Şanlıurfa", district:"Siverek"},

  // ─── DİYARBAKIR ───
  "baglar":        {city:"Diyarbakır", district:"Bağlar"},
  "kayapinar":     {city:"Diyarbakır", district:"Kayapınar"},
  "yenisehird":    {city:"Diyarbakır", district:"Yenişehir"},
  "ergani":        {city:"Diyarbakır", district:"Ergani"},
  "bismil":        {city:"Diyarbakır", district:"Bismil"},
  "silvan":        {city:"Diyarbakır", district:"Silvan"},

  // ─── MALATYA ───
  "battalgazi":    {city:"Malatya", district:"Battalgazi"},
  "yesilyu t":     {city:"Malatya", district:"Yeşilyurt"},
  "yesilyurt":     {city:"Malatya", district:"Yeşilyurt"},
  "dogansehi r":   {city:"Malatya", district:"Doğanşehir"},
  "dogansehir":    {city:"Malatya", district:"Doğanşehir"},

  // ─── KAYSERİ ───
  "kocasinan":     {city:"Kayseri", district:"Kocasinan"},
  "melikgazi":     {city:"Kayseri", district:"Melikgazi"},
  "talas":         {city:"Kayseri", district:"Talas"},
  "develi":        {city:"Kayseri", district:"Develi"},
  "bünyan":        {city:"Kayseri", district:"Bünyan"},
  "bunyan":        {city:"Kayseri", district:"Bünyan"},
  "yahyali":       {city:"Kayseri", district:"Yahyalı"},

  // ─── ESKİŞEHİR ───
  "odunpazari":    {city:"Eskişehir", district:"Odunpazarı"},
  "tepebaşi":      {city:"Eskişehir", district:"Tepebaşı"},
  "tepebasi":      {city:"Eskişehir", district:"Tepebaşı"},
  "mihalgazi":     {city:"Eskişehir", district:"Mihalgazi"},
  "alpu":          {city:"Eskişehir", district:"Alpu"},

  // ─── YALOVA ───
  "ciftlikkoy":    {city:"Yalova", district:"Çiftlikköy"},
  "altinova":      {city:"Yalova", district:"Altınova"},
  "cınarcik":      {city:"Yalova", district:"Çınarcık"},
  "cinarcik":      {city:"Yalova", district:"Çınarcık"},
  "armutlu":       {city:"Yalova", district:"Armutlu"},
  "termal":        {city:"Yalova", district:"Termal"},

  // ─── ORDU ───
  "altinordu":     {city:"Ordu", district:"Altınordu"},
  "unye":          {city:"Ordu", district:"Ünye"},
  "fatsa":         {city:"Ordu", district:"Fatsa"},
  "golkoyu":       {city:"Ordu", district:"Gölköy"},
  "gurgentepe":    {city:"Ordu", district:"Gürgentepe"},

  // ─── ZONGULDAK ───
  "eregli z":      {city:"Zonguldak", district:"Ereğli"},
  "çaycuma":       {city:"Zonguldak", district:"Çaycuma"},
  "caycuma":       {city:"Zonguldak", district:"Çaycuma"},
  "devrek":        {city:"Zonguldak", district:"Devrek"},
  "alaplı":        {city:"Zonguldak", district:"Alaplı"},
  "alapli":        {city:"Zonguldak", district:"Alaplı"},

  // ─── KAHRAMANMARAŞ ───
  "dulkadirolu":   {city:"Kahramanmaraş", district:"Dulkadiroğlu"},
  "onikisubat":    {city:"Kahramanmaraş", district:"Onikişubat"},
  "elbistan":      {city:"Kahramanmaraş", district:"Elbistan"},
  "afsin":         {city:"Kahramanmaraş", district:"Afşin"},
};

function normalizeForLookup(s: string): string {
  return s.toLowerCase()
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i").replace(/Ğ/g, "g").replace(/Ü/g, "u")
    .replace(/Ş/g, "s").replace(/Ö/g, "o").replace(/Ç/g, "c")
    .replace(/I/g, "i");
}

function parseListingText(raw: string): Record<string, string> {
  const text = raw.trim();
  // Turkish-locale lowercase — handles İ→i, I→ı correctly (JS /i flag cannot do this)
  const textTR = text.toLocaleLowerCase("tr-TR");
  const lines = text.split(/\n/);

  // ── Phone numbers ──────────────────────────────────────────────────────────
  const phoneMatch = text.match(/(?:0|\+90)[\s\-]?(?:\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\d{3}[\s\-]?\d{7})/);
  const rawPhone = phoneMatch?.[0]?.replace(/[\s\-\(\)]/g, "") ?? "";
  const contactPhone = rawPhone ? rawPhone.replace(/^0/, "+90").replace(/^\+90(\d{10})$/, "+90$1") : "";
  const applyUrl = contactPhone ? `tel:${contactPhone}` : "";

  // ── Contact name ───────────────────────────────────────────────────────────
  let contactName = "";
  // Turkish title-case (handles ALL CAPS input like "ONUR BEY")
  const toTitleCaseTR = (s: string) => s.toLowerCase()
    .replace(/(^|\s)([a-zçğışöüi])/g, (_, sp, c: string) => sp + c.toLocaleUpperCase("tr-TR"));

  const BAD_NAME_WORDS = [
    "güvenlik","security","personel","eleman","firma","şirket","merkezi","hizmet",
    "acil","ilan","arıyoruz","aranıyor","başvuru","iletişim","irtibat","bilgi","başvur",
    "tam","yarı","zaman","çalışma","görevli","uzman","şef","amir","müdür",
    "proje","plaza","otel","avm","bölge","merkez","alım","vardiya","sgk",
  ];
  const TRW = "[A-ZÇĞİÖŞÜa-zçğışöüİ]"; // accepts both upper and lowercase (for ALL CAPS texts)
  const isGoodName = (s: string) => {
    const sl = s.toLowerCase();
    if (s.length < 4 || s.length > 45) return false;
    if (BAD_NAME_WORDS.some(w => sl.includes(w))) return false;
    if (/\d/.test(s)) return false;
    const parts = s.trim().split(/\s+/);
    if (parts.length < 2 || parts.length > 3) return false;
    return parts.every(p => p.length >= 2);
  };

  // NOTE: All name patterns run against textTR (Turkish-lowercased) — no /i flag needed
  // The captured name will be lowercase; toTitleCaseTR converts it to proper case.
  const namePatterns: RegExp[] = [
    // "iletişim onur bey : 05..." / "iletişim: ahmet yılmaz"
    new RegExp(`(?:ileti[şs]im|yetkili|irtibat|sorumlu|koordinatör|temsilci)\\s*[:\\-.\\s]?\\s*(${TRW}{2,20}\\s+${TRW}{2,20}(?:\\s+${TRW}{2,20})?)`),
    // "ad soyad: ..." / "adı soyadı: ..."
    new RegExp(`(?:ad\\s+soyad|adı\\s+soyadı|isim|ad)\\s*[:\\-]\\s*(${TRW}{2,20}\\s+${TRW}{2,20})`),
    // "onur bey" / "fatma hanım" — name followed by Turkish honorific
    new RegExp(`(${TRW}{2,20}\\s+${TRW}{2,20})\\s+(?:bey|hanım|bay|bayan)`),
    // Name right before phone number
    new RegExp(`(${TRW}{3,20}\\s+${TRW}{3,20})\\s*[:\\-]?\\s*(?:0|\\+90)5`),
    // After colon at end of line
    new RegExp(`:\\s*(${TRW}{2,20}\\s+${TRW}{2,20})\\s*(?:\\n|$)`),
  ];
  for (const pat of namePatterns) {
    const m = textTR.match(pat); // match against Turkish-lowercased text
    if (m?.[1]) {
      const candidate = toTitleCaseTR(m[1].trim());
      if (isGoodName(candidate)) { contactName = candidate; break; }
    }
  }
  if (!contactName) {
    for (const line of lines) {
      const l = line.trim();
      const parts = l.split(/\s+/);
      if ((parts.length === 2 || parts.length === 3) && !/\d/.test(l)) {
        const candidate = toTitleCaseTR(l);
        if (isGoodName(candidate)) { contactName = candidate; break; }
      }
    }
  }

  // ── City & District ────────────────────────────────────────────────────────
  let city = "";
  let district = "";

  // Tokenize: split on spaces, slashes, commas, dashes, dots, parens, apostrophes
  // Strip common Turkish case suffixes before lookup ('de, 'da, 'nde, 'nda, 'te, 'ta, 'e, 'a, 'in, 'ın etc.)
  const TR_SUFFIX = /(?:['’`])?(?:de|da|te|ta|nde|nda|nte|nta|inda|ında|unda|ünde|ye|ya|ne|na|in|ın|un|ün|e|a|i|ı|u|ü|deki|daki|nin|nın|nun|nün|ler|lar|den|dan|ten|tan)$/i;
  const tokens = text.split(/[\s\/,\-\.\(\)'’`]+/)
    .filter(t => t.length >= 2)
    .map(t => t.replace(TR_SUFFIX, "").trim())
    .filter(t => t.length >= 3);

  // 0) Explicit labeled district: "İlçe: Kadıköy", "Semt: Beşiktaş", "Bölge: ..."
  const labeledDistrict = text.match(/(?:ilçe|semt|mahalle)\s*[:\-]?\s*([A-ZÇĞİÖŞÜa-zçğışöüİ]{3,30})/i);
  if (labeledDistrict?.[1]) {
    const n = normalizeForLookup(labeledDistrict[1].split(/[\s,]/)[0]!);
    if (DISTRICT_TO_CITY[n]) { district = DISTRICT_TO_CITY[n]!.district; city = DISTRICT_TO_CITY[n]!.city; }
  }

  // 1) Check "district/city" or "district-city" slash patterns
  const slashPattern = /([A-ZÇĞİÖŞÜa-zçğışöüİ]{3,})[\/\-]([A-ZÇĞİÖŞÜa-zçğışöüİ]{3,})/g;
  let sm: RegExpExecArray | null;
  while ((sm = slashPattern.exec(text)) !== null && !city) {
    const a = normalizeForLookup(sm[1]!);
    const b = normalizeForLookup(sm[2]!);
    const da = DISTRICT_TO_CITY[a];
    const db_entry = DISTRICT_TO_CITY[b];
    const ca = TR_CITIES[a];
    const cb = TR_CITIES[b];
    if (da && cb && da.city === TR_CITIES[b] || da && !cb) {
      district = da.district; city = da.city;
    } else if (db_entry && ca && db_entry.city === TR_CITIES[a] || db_entry && !ca) {
      district = db_entry.district; city = db_entry.city;
    } else if (ca) {
      city = ca;
    } else if (cb) {
      city = cb;
    }
  }

  // 2) Labeled city patterns: "İl: İstanbul", "Şehir: Ankara", "Konum: ..." etc.
  if (!city) {
    const labeled = text.match(/(?:il|şehir|konum|lokasyon|bölge)\s*[:\-]?\s*([A-ZÇĞİÖŞÜa-zçğışöüİ]{3,30})/i);
    if (labeled?.[1]) {
      const n = normalizeForLookup(labeled[1].split(/[\s,]/)[0]!);
      if (TR_CITIES[n]) city = TR_CITIES[n]!;
      else if (DISTRICT_TO_CITY[n]) { city = DISTRICT_TO_CITY[n]!.city; if (!district) district = DISTRICT_TO_CITY[n]!.district; }
    }
  }

  // 3) Scan every token: district first (more specific), then city
  const DIRECT_SUFFIX = /(?:de|da|te|ta|ye|ya|ne|na|nde|nda|den|dan|ten|tan|deki|daki|ler|lar|in|ın|un|ün)$/i;
  for (const tok of tokens) {
    const n = normalizeForLookup(tok);
    const n2 = n.replace(DIRECT_SUFFIX, "");
    for (const candidate of n === n2 ? [n] : [n, n2]) {
      if (!district && DISTRICT_TO_CITY[candidate]) {
        district = DISTRICT_TO_CITY[candidate]!.district;
        if (!city) city = DISTRICT_TO_CITY[candidate]!.city;
      }
      if (!city && TR_CITIES[candidate]) city = TR_CITIES[candidate]!;
      if (city && district) break;
    }
    if (city && district) break;
  }

  // 4) If district found but city still missing, derive from district map
  if (district && !city) {
    const n = normalizeForLookup(district);
    if (DISTRICT_TO_CITY[n]) city = DISTRICT_TO_CITY[n]!.city;
  }

  // ── Salary ─────────────────────────────────────────────────────────────────
  let salary = "";
  // NOTE: All salary patterns run against textTR (Turkish-lowercased) — no /i flag needed
  const salaryPatterns: [RegExp, boolean][] = [
    // "toplam hakediş: 47.751 tl" — highest priority (real take-home)
    [/toplam\s+(?:hakedi[şs]|kazanç|paket)\s*[:\-]?\s*(\d[\d\.]+)\s*(?:tl|₺)/, true],
    // "maaş: herşey dahil 50000" / "maaş: net 25.000 tl"
    [/(?:maa[şs]|ücret|aylık)\s*[:\-]?\s*((?:net|brüt|her[şs]ey\s*dahil|her\s*[şs]ey\s*dahil|tüm\s*dahil|hepsi\s*dahil)?\s*\d[\d\.]{2,}(?:\s*[-–]\s*\d[\d\.]+)?(?:\s*bin)?\s*(?:tl|₺)?)/, true],
    // "net 25.000 tl" / "brüt 30.000 tl"
    [/(?:net|brüt)\s+(\d[\d\.]+(?:\s*[-–]\s*\d[\d\.]+)?)\s*(?:bin\s*)?(?:tl|₺)/, true],
    // "25.000 – 30.000 tl"
    [/(\d[\d\.]+)\s*[-–]\s*(\d[\d\.]+)\s*(?:bin\s*)?(?:tl|₺)/, false],
    // "25000 tl" / "25.000tl" (min 4 chars to skip "08.00" time patterns)
    [/(\d[\d\.]{3,})\s*(?:bin\s*)?(?:tl|₺)/, false],
    // "25 bin tl"
    [/(\d{2,3})\s*bin\s*(?:tl|₺)/, false],
    // "₺25000"
    [/₺\s*(\d[\d\.]+(?:\s*[-–]\s*\d[\d\.]+)?)/, false],
  ];
  function normalizeSalary(r: string): string {
    let s = r.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    // Strip label prefix: "Maaş:", "Ücret:", "Net:", "Brüt:"
    s = s.replace(/^(?:maaş|ücret|aylık|net|brüt)\s*[:\-]?\s*/i, "");
    s = s.charAt(0).toUpperCase() + s.slice(1);
    // Ensure TL is always uppercase, strip trailing lowercase "tl"
    s = s.replace(/\btl\b/gi, "TL");
    if (!/TL|₺/.test(s)) s += " TL";
    // Format bare large numbers for readability: 50000 → 50.000
    s = s.replace(/\b(\d{4,6})\b/g, n => parseInt(n, 10).toLocaleString("tr-TR"));
    return s;
  }
  // Match against Turkish-lowercased text so İ/ı/Ş/ş case-fold correctly
  for (let si = 0; si < salaryPatterns.length; si++) {
    const [pat, useGroup] = salaryPatterns[si]!;
    const m = textTR.match(pat);
    if (m) {
      const raw = useGroup ? (m[1] ?? m[0]) : m[0];
      salary = normalizeSalary(raw);
      if (si === 0) salary += " (Toplam Hakediş)";
      break;
    }
  }

  // ── Work type ──────────────────────────────────────────────────────────────
  let workType = "Tam Zamanlı";
  // Shift patterns: "2+2", "2+2+2", "12+12", "24+24" etc.
  if (/vardiy/i.test(text) || /\b\d{1,2}\s*\+\s*\d{1,2}\b/.test(text)) workType = "Vardiyalı";
  else if (/yarı\s*zamanl/i.test(text) || /part[\s\-]?time/i.test(text)) workType = "Yarı Zamanlı";
  else if (/proje\s*baz/i.test(text) || /freelance/i.test(text)) workType = "Proje Bazlı";

  // ── Job title ──────────────────────────────────────────────────────────────
  let title = "";

  // 1) Explicit label: "Pozisyon: ...", "Görev: ...", "İlan: ..."
  const labeledTitle = text.match(/(?:pozisyon|görev|ünvan|iş\s*ilanı|aranan\s*pozisyon)\s*[:\-]?\s*(.+)/i);
  if (labeledTitle?.[1]) {
    const t = labeledTitle[1].trim().split(/\n/)[0]!.trim();
    if (t.length > 3 && t.length < 90) title = t;
  }

  // 2) Smart extraction: look for specific security job titles in the text
  const JOB_TITLE_PATTERNS: { re: RegExp; label: string }[] = [
    { re: /silahlı\s*(?:özel\s*)?güvenlik\s*(?:görevlisi|personeli|elemanı)/i, label: "Silahlı Güvenlik Görevlisi" },
    { re: /güvenlik\s*müdürü/i,        label: "Güvenlik Müdürü" },
    { re: /güvenlik\s*koordinatörü/i,  label: "Güvenlik Koordinatörü" },
    { re: /güvenlik\s*şefi/i,          label: "Güvenlik Şefi" },
    { re: /güvenlik\s*amiri/i,         label: "Güvenlik Amiri" },
    { re: /güvenlik\s*uzmanı/i,        label: "Güvenlik Uzmanı" },
    { re: /güvenlik\s*sorumlusu/i,     label: "Güvenlik Sorumlusu" },
    { re: /özel\s*güvenlik\s*görevlisi/i, label: "Özel Güvenlik Görevlisi" },
    { re: /özel\s*güvenlik\s*personeli/i, label: "Özel Güvenlik Personeli" },
    { re: /güvenlik\s*görevlisi/i,     label: "Güvenlik Görevlisi" },
    { re: /koruma\s*uzmanı/i,          label: "Özel Koruma Uzmanı" },
    { re: /özel\s*koruma/i,            label: "Özel Koruma Görevlisi" },
    { re: /koruma\s*görevlisi/i,       label: "Koruma Görevlisi" },
    { re: /silahlı\s*güvenlik/i,       label: "Silahlı Güvenlik Görevlisi" },
    { re: /bekçi/i,                    label: "Bekçi" },
    { re: /resepsiyonist/i,            label: "Güvenlik Resepsiyonisti" },
    { re: /kapıcı/i,                   label: "Kapıcı" },
    { re: /güvenlik/i,                 label: "Güvenlik Görevlisi" },
  ];
  if (!title) {
    for (const { re, label } of JOB_TITLE_PATTERNS) {
      if (re.test(text)) {
        // Build a richer title: job + location
        const loc = district || city;
        title = loc ? `${label} — ${loc}` : label;
        break;
      }
    }
  }

  // 3) Fallback: first meaningful non-emoji line (cleaned up)
  if (!title) {
    for (const line of lines) {
      const l = line.trim()
        .replace(/^[^A-ZÇĞİÖŞÜa-zçğışöüİ0-9]*/g, "")
        .replace(/\s+/g, " ").trim();
      if (l.length > 5 && l.length < 90 && !/^\d/.test(l) && !l.includes("http") && !/^(?:0|\+90)/.test(l))
        { title = l; break; }
    }
  }

  // ── Company ────────────────────────────────────────────────────────────────
  let company = "";
  const companyPatterns: RegExp[] = [
    /(?:şirket|firma|kurum|işveren)\s*[:\-]?\s*(.+)/i,
    /([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğışöüİ\s]{2,30}(?:A\.Ş\.|Ltd\.|Tic\.|Grup|Güvenlik|Holding|Şirketi))/,
  ];
  for (const pat of companyPatterns) {
    const m = text.match(pat);
    if (m?.[1]) { company = m[1].trim().split(/\n/)[0]!.trim(); if (company.length > 2 && company.length < 60) break; company = ""; }
  }

  // ── Description ────────────────────────────────────────────────────────────
  const descLines = lines.filter(l => {
    const ll = l.trim();
    if (!ll) return false;
    if (/(?:0|\+90)[\s\-]?\d{3}/.test(ll)) return false;
    if (/http[s]?:\/\//.test(ll)) return false;
    if (ll === title) return false;
    return true;
  });
  const description = descLines.join("\n").trim();

  // ── Gender ─────────────────────────────────────────────────────────────────
  // Ortak çıkarım mantığı (bayan/kadın/hanım → Bayan, bay/erkek → Bay)
  const gender = extractGender(text) ?? "";

  // ── Formalize description ─────────────────────────────────────────────────
  function formalizeDescription(raw: string): string {
    return raw.split("\n")
      .map(line => {
        const l = line.trim().replace(/^[^A-ZÇĞİÖŞÜa-zçğışöüİ0-9]*/g, "").trim();
        if (!l) return "";
        return l.charAt(0).toUpperCase() + l.slice(1);
      })
      .filter(l => l.length > 0)
      .join("\n");
  }

  return {
    title,
    company: company || "Özel Güvenlik",
    city,
    district,
    salary,
    workType,
    gender,
    description: formalizeDescription(description),
    contactPhone,
    contactName: contactName || "Özel Güvenlik",
    applyUrl,
  };
}

router.post("/admin/listings/parse", authMiddleware, async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Giriş yapmanız gerekiyor" }); return; }
  const perm = await checkPublishPermission(req.user.id, req.user.role);
  if (!perm.allowed) { res.status(403).json({ error: "İlan paylaşım yetkiniz bulunmuyor" }); return; }
  const { text } = req.body as { text?: string };
  if (!text?.trim()) { res.status(400).json({ error: "Metin zorunludur" }); return; }
  const result = parseListingText(text);
  res.json(result);
});

router.post("/admin/chat/lock", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const settings = await db.select().from(adminSettingsTable).limit(1);
  const current = settings[0]?.chatLocked ?? false;
  if (!settings[0]) {
    await db.insert(adminSettingsTable).values({ chatLocked: !current, fakeOnlineBonus: 0, maintenanceMode: false });
  } else {
    await db.update(adminSettingsTable).set({ chatLocked: !current }).where(eq(adminSettingsTable.id, settings[0].id));
  }
  const ioInstance = (req as any).app.get("io") as { emit: (event: string, data: unknown) => void } | null;
  if (ioInstance) ioInstance.emit("chat_locked", { locked: !current });
  res.json({ success: true, message: !current ? "Sohbet kilitledi" : "Sohbet kilidi açıldı" });
});

// ─── Clear all chat ────────────────────────────────────────────────
router.delete("/admin/chat/messages/all", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  await db.update(chatMessagesTable).set({ isDeleted: true });
  const io = (req as any).app.get("io") as { emit: (event: string, data: unknown) => void } | null;
  if (io) io.emit("chat:clear", {});
  res.json({ success: true });
});

// ─── Chat rules ────────────────────────────────────────────────────
router.get("/admin/chat/rules", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const rules = await db.select().from(chatRulesTable).orderBy(asc(chatRulesTable.sortOrder), asc(chatRulesTable.id));
  res.json(rules.map(r => ({ id: r.id, content: r.content, sortOrder: r.sortOrder })));
});

router.get("/chat/rules", async (_req, res): Promise<void> => {
  const rules = await db.select().from(chatRulesTable).orderBy(asc(chatRulesTable.sortOrder), asc(chatRulesTable.id));
  res.json(rules.map(r => ({ id: r.id, content: r.content, sortOrder: r.sortOrder })));
});

router.post("/admin/chat/rules", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { content, sortOrder } = req.body as { content?: string; sortOrder?: number };
  if (!content?.trim()) { res.status(400).json({ error: "İçerik zorunludur" }); return; }
  const [rule] = await db.insert(chatRulesTable).values({ content: content.trim(), sortOrder: sortOrder ?? 0 }).returning();
  res.status(201).json({ id: rule!.id, content: rule!.content, sortOrder: rule!.sortOrder });
});

router.patch("/admin/chat/rules/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { content, sortOrder } = req.body as { content?: string; sortOrder?: number };
  const updates: Partial<typeof chatRulesTable.$inferInsert> = {};
  if (content !== undefined) updates.content = content.trim();
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  await db.update(chatRulesTable).set(updates).where(eq(chatRulesTable.id, id));
  res.json({ success: true });
});

router.delete("/admin/chat/rules/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(chatRulesTable).where(eq(chatRulesTable.id, id));
  res.sendStatus(204);
});

router.get("/admin/banned-words", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const words = await db.select().from(bannedWordsTable).orderBy(desc(bannedWordsTable.createdAt));
  res.json(words.map(w => ({ id: w.id, word: w.word, createdAt: w.createdAt.toISOString() })));
});

router.post("/admin/banned-words", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { word } = req.body as { word?: string };
  if (!word?.trim()) { res.status(400).json({ error: "Kelime zorunludur" }); return; }
  const [existing] = await db.select().from(bannedWordsTable).where(eq(bannedWordsTable.word, word.trim().toLowerCase()));
  if (existing) { res.status(400).json({ error: "Bu kelime zaten engelli" }); return; }
  const [created] = await db.insert(bannedWordsTable).values({ word: word.trim().toLowerCase() }).returning();
  res.status(201).json({ id: created.id, word: created.word, createdAt: created.createdAt.toISOString() });
});

router.delete("/admin/banned-words/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(bannedWordsTable).where(eq(bannedWordsTable.id, id));
  res.sendStatus(204);
});

// ─── Admin Listings ────────────────────────────────────────────────
router.get("/admin/listings", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const requestedLimit = req.query["limit"] === "all" ? 500 : parseInt(String(req.query["limit"] ?? "50"), 10);
  const limit = Math.min(500, Math.max(1, requestedLimit || 50));
  const offset = (page - 1) * limit;
  const status = req.query["status"] as string | undefined;
  const search = String(req.query["search"] ?? "").trim();
  const city = String(req.query["city"] ?? "").trim();
  const conditions = status ? [eq(listingsTable.status, status)] : [];
  if (city) conditions.push(ilike(listingsTable.city, `%${city}%`));
  if (search) {
    const numericId = Number(search.replace(/^#/, ""));
    conditions.push(or(
      Number.isInteger(numericId) && numericId > 0 ? eq(listingsTable.id, numericId) : sql`false`,
      ilike(listingsTable.title, `%${search}%`),
      ilike(listingsTable.company, `%${search}%`),
      ilike(listingsTable.city, `%${search}%`)
    )!);
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [listings, countResult] = await Promise.all([
    db.select().from(listingsTable).where(whereClause).orderBy(desc(listingsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(whereClause),
  ]);
  res.json({
    listings: listings.map(l => ({
      id: l.id, title: l.title, company: l.company, city: l.city, salary: l.salary,
      workType: l.workType, description: l.description, requirements: l.requirements,
      status: l.status, isFeatured: l.isFeatured, cardTheme: l.cardTheme, likeCount: l.likeCount,
      applyUrl: l.applyUrl, sourceTag: l.sourceTag,
      expiresAt: l.expiresAt?.toISOString() ?? null, createdAt: l.createdAt.toISOString(),
    })),
    total: countResult[0]?.count ?? 0,
  });
});

router.get("/admin/listings/cities", authMiddleware, requireAdminOrModerator, async (_req, res): Promise<void> => {
  const settings = await db.select({ hiddenListingCities: adminSettingsTable.hiddenListingCities }).from(adminSettingsTable).limit(1);
  const hidden = parseHiddenListingCities(settings[0]?.hiddenListingCities);
  const rows = await db.select({ city: listingsTable.city, count: sql<number>`count(*)::int` })
    .from(listingsTable)
    .groupBy(listingsTable.city)
    .orderBy(sql`count(*) desc`, listingsTable.city);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const province = provinceFromListingCity(row.city);
    if (!province) continue;
    counts.set(province, (counts.get(province) ?? 0) + row.count);
  }
  res.json({
    cities: [...counts.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr-TR")),
    hidden,
  });
});

router.get("/admin/location-filter-terms", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(locationFilterTermsTable).orderBy(asc(locationFilterTermsTable.province), asc(locationFilterTermsTable.term));
  const seenBuiltin = new Set<string>();
  const builtin = [
    ...BUILTIN_LOCATION_FILTER_TERMS,
    ...Object.entries(DISTRICT_TO_CITY).map(([term, value]) => ({
      province: value.city,
      term,
      display: `${value.city} / ${value.district}`,
    })),
  ]
    .filter(item => {
      const key = `${item.province}|${item.term}`;
      if (seenBuiltin.has(key)) return false;
      seenBuiltin.add(key);
      return true;
    })
    .sort((a, b) => a.province.localeCompare(b.province, "tr-TR") || a.term.localeCompare(b.term, "tr-TR"))
    .map((value, index) => ({
      id: -(index + 1),
      province: value.province,
      term: value.term,
      display: value.display,
      createdAt: null,
      source: "builtin" as const,
    }));
  const custom = rows.map(row => ({
    id: row.id,
    province: row.province,
    term: row.term,
    display: row.display,
    createdAt: row.createdAt.toISOString(),
    source: "admin" as const,
  }));
  res.json([...custom, ...builtin]);
});

router.post("/admin/location-filter-terms", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { province, term, display } = req.body as Record<string, unknown>;
  const cleanProvince = normalizeLocationTerm(String(province ?? ""));
  const cleanTerm = normalizeLocationTerm(String(term ?? ""));
  const cleanDisplay = normalizeLocationTerm(String(display ?? ""));
  if (!cleanProvince || !cleanTerm) {
    res.status(400).json({ error: "İl ve eşleşme kelimesi zorunludur" });
    return;
  }
  const [created] = await db.insert(locationFilterTermsTable).values({
    province: cleanProvince,
    term: cleanTerm,
    display: cleanDisplay || cleanProvince,
  }).returning();
  res.status(201).json({
    id: created!.id,
    province: created!.province,
    term: created!.term,
    display: created!.display,
    createdAt: created!.createdAt.toISOString(),
  });
});

router.delete("/admin/location-filter-terms/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(locationFilterTermsTable).where(eq(locationFilterTermsTable.id, id));
  res.sendStatus(204);
});

router.post("/admin/listings", authMiddleware, async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Giriş yapmanız gerekiyor" }); return; }
  const perm = await checkPublishPermission(req.user.id, req.user.role);
  if (!perm.allowed) { res.status(403).json({ error: "İlan paylaşım yetkiniz bulunmuyor" }); return; }
  const { title, company, city, workType, salary, description, requirements, applyUrl, isFeatured, expiresAt, cardTheme } = req.body as Record<string, unknown>;
  if (!title || !company || !city || !workType) { res.status(400).json({ error: "Başlık, şirket, şehir ve çalışma şekli zorunludur" }); return; }
  const [listing] = await db.insert(listingsTable).values({
    title: String(title), company: String(company), city: String(city), workType: String(workType),
    salary: salary ? String(salary) : null, description: description ? String(description) : null,
    requirements: requirements ? String(requirements) : null, applyUrl: applyUrl ? String(applyUrl) : null,
    isFeatured: Boolean(isFeatured), cardTheme: normalizeListingCardTheme(cardTheme), status: "active",
    // Manuel admin ilanları varsayılan olarak süresiz; admin elle expiresAt verirse ona göre kalkar
    expiresAt: expiresAt ? new Date(String(expiresAt)) : null,
    authorId: req.user.id,
  }).returning();
  if (perm.shouldDecrement && perm.grantId) {
    await db.update(listingPublishGrantsTable)
      .set({ usesRemaining: sql`${listingPublishGrantsTable.usesRemaining} - 1` })
      .where(eq(listingPublishGrantsTable.id, perm.grantId));
  }
  res.status(201).json({ id: listing!.id, title: listing!.title, status: listing!.status });
});

router.patch("/admin/listings/:id/status", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { status, isFeatured, cardTheme } = req.body as { status?: string; isFeatured?: boolean; cardTheme?: unknown };
  const updates: Partial<typeof listingsTable.$inferInsert> = {};
  if (status && ["active", "pending", "rejected"].includes(status)) updates.status = status;
  if (isFeatured !== undefined) updates.isFeatured = Boolean(isFeatured);
  if (cardTheme !== undefined) updates.cardTheme = normalizeListingCardTheme(cardTheme);
  await db.update(listingsTable).set(updates).where(eq(listingsTable.id, id));
  res.json({ success: true });
});

router.patch("/admin/listings/:id", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { title, company, city, salary, workType, description, requirements, applyUrl, status, isFeatured, cardTheme, expiresAt } = req.body as Record<string, unknown>;
  const updates: Partial<typeof listingsTable.$inferInsert> = {};
  if (title !== undefined) {
    const value = String(title).trim();
    if (!value) { res.status(400).json({ error: "Başlık boş olamaz" }); return; }
    updates.title = value;
  }
  if (company !== undefined) {
    const value = String(company).trim();
    if (!value) { res.status(400).json({ error: "Şirket boş olamaz" }); return; }
    updates.company = value;
  }
  if (city !== undefined) {
    const value = String(city).trim();
    if (!value) { res.status(400).json({ error: "İl/ilçe boş olamaz" }); return; }
    updates.city = value;
  }
  if (salary !== undefined) updates.salary = salary == null || String(salary).trim() === "" ? null : String(salary).trim();
  if (workType !== undefined) updates.workType = String(workType || "Tam Zamanlı");
  if (description !== undefined) updates.description = description == null || String(description).trim() === "" ? null : String(description);
  if (requirements !== undefined) updates.requirements = requirements == null || String(requirements).trim() === "" ? null : String(requirements);
  if (applyUrl !== undefined) updates.applyUrl = applyUrl == null || String(applyUrl).trim() === "" ? null : String(applyUrl).trim();
  if (status !== undefined && ["active", "pending", "rejected"].includes(String(status))) updates.status = String(status);
  if (isFeatured !== undefined) updates.isFeatured = Boolean(isFeatured);
  if (cardTheme !== undefined) updates.cardTheme = normalizeListingCardTheme(cardTheme);
  if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(String(expiresAt)) : null;
  await db.update(listingsTable).set(updates).where(eq(listingsTable.id, id));
  res.json({ success: true });
});

router.delete("/admin/listings/:id", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(listingsTable).where(eq(listingsTable.id, id));
  res.sendStatus(204);
});

router.post("/admin/listings/bulk-delete", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const { ids } = req.body as { ids?: unknown };
  const cleanIds = Array.isArray(ids)
    ? [...new Set(ids.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0))]
    : [];
  if (cleanIds.length === 0) { res.status(400).json({ error: "Silinecek ilan seçilmedi" }); return; }
  const deletedRows = await db.delete(listingsTable).where(inArray(listingsTable.id, cleanIds)).returning({ id: listingsTable.id });
  res.json({ success: true, deleted: deletedRows.length });
});

// ─── Banners ─────────────────────────────────────────────────────
const DEFAULT_BANNERS = [
  {
    title: "Türkiye geneli güncel özel güvenlik ilanlarını hemen incele",
    imageUrl: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
    linkUrl: "/ilanlar",
    sortOrder: 1,
  },
  {
    title: "Silahlı ve silahsız güvenlik fırsatları tek ekranda",
    imageUrl: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1200&q=80",
    linkUrl: "/ilanlar",
    sortOrder: 2,
  },
  {
    title: "Part-time güvenlik personeli ilanını ücretsiz oluştur",
    imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
    linkUrl: "/part-time",
    sortOrder: 3,
  },
  {
    title: "Profilini tamamla, işverenlerin seni daha hızlı bulsun",
    imageUrl: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80",
    linkUrl: "/profil",
    sortOrder: 4,
  },
  {
    title: "Sohbete katıl, sektördeki duyuruları ve fırsatları kaçırma",
    imageUrl: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80",
    linkUrl: "/sohbet",
    sortOrder: 5,
  },
];

async function ensureDefaultBanners(): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(bannersTable).where(eq(bannersTable.isActive, true));
  if (count > 0) return;
  await db.insert(bannersTable).values(DEFAULT_BANNERS.map(b => ({ ...b, isActive: true })));
}

router.get("/admin/banners", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  await ensureDefaultBanners();
  const banners = await db.select().from(bannersTable).orderBy(asc(bannersTable.sortOrder), desc(bannersTable.createdAt));
  res.json(banners.map(b => ({ id: b.id, title: b.title, imageUrl: b.imageUrl, linkUrl: b.linkUrl, isActive: b.isActive, sortOrder: b.sortOrder, createdAt: b.createdAt.toISOString() })));
});

router.post("/admin/banners", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { title, imageUrl, linkUrl, isActive, sortOrder } = req.body as Record<string, unknown>;
  if (!imageUrl) { res.status(400).json({ error: "Resim URL zorunludur" }); return; }
  const [banner] = await db.insert(bannersTable).values({ title: title ? String(title) : null, imageUrl: String(imageUrl), linkUrl: linkUrl ? String(linkUrl) : null, isActive: isActive !== false, sortOrder: sortOrder ? parseInt(String(sortOrder), 10) : 0 }).returning();
  res.status(201).json({ id: banner!.id, imageUrl: banner!.imageUrl, isActive: banner!.isActive });
});

router.patch("/admin/banners/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { title, imageUrl, linkUrl, isActive, sortOrder } = req.body as Record<string, unknown>;
  const updates: Partial<typeof bannersTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title ? String(title) : null;
  if (imageUrl !== undefined) updates.imageUrl = String(imageUrl);
  if (linkUrl !== undefined) updates.linkUrl = linkUrl ? String(linkUrl) : null;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (sortOrder !== undefined) updates.sortOrder = parseInt(String(sortOrder), 10);
  await db.update(bannersTable).set(updates).where(eq(bannersTable.id, id));
  res.json({ success: true });
});

router.delete("/admin/banners/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(bannersTable).where(eq(bannersTable.id, id));
  res.sendStatus(204);
});

router.get("/banners", async (_req, res): Promise<void> => {
  await ensureDefaultBanners();
  const banners = await db.select().from(bannersTable).where(eq(bannersTable.isActive, true)).orderBy(asc(bannersTable.sortOrder), desc(bannersTable.createdAt));
  res.json(banners.map(b => ({ id: b.id, title: b.title, imageUrl: b.imageUrl, linkUrl: b.linkUrl })));
});

// ─── Akıllı İlan Yayınlama Yetkileri (Grant) ─────────────────────
router.get("/admin/grants", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const grants = await db.select({
    id: listingPublishGrantsTable.id,
    userId: listingPublishGrantsTable.userId,
    username: usersTable.username,
    grantType: listingPublishGrantsTable.grantType,
    usesRemaining: listingPublishGrantsTable.usesRemaining,
    expiresAt: listingPublishGrantsTable.expiresAt,
    isActive: listingPublishGrantsTable.isActive,
    note: listingPublishGrantsTable.note,
    createdAt: listingPublishGrantsTable.createdAt,
  })
    .from(listingPublishGrantsTable)
    .leftJoin(usersTable, eq(listingPublishGrantsTable.userId, usersTable.id))
    .where(eq(listingPublishGrantsTable.isActive, true))
    .orderBy(desc(listingPublishGrantsTable.createdAt));
  res.json(grants.map(g => ({
    id: g.id, userId: g.userId, username: g.username,
    grantType: g.grantType, usesRemaining: g.usesRemaining,
    expiresAt: g.expiresAt?.toISOString() ?? null,
    isActive: g.isActive, note: g.note,
    createdAt: g.createdAt.toISOString(),
  })));
});

router.post("/admin/grants", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { userId, grantType, usesRemaining, expiresAt, note } = req.body as {
    userId?: number; grantType?: string; usesRemaining?: number | null; expiresAt?: string | null; note?: string;
  };
  if (!userId) { res.status(400).json({ error: "Kullanıcı ID zorunludur" }); return; }
  if (!grantType || !["unlimited", "limited", "timed"].includes(grantType)) {
    res.status(400).json({ error: "Geçersiz hak türü (unlimited / limited / timed)" }); return;
  }
  const [grant] = await db.insert(listingPublishGrantsTable).values({
    userId, grantedBy: req.user!.id, grantType,
    usesRemaining: grantType === "limited" ? (usesRemaining ?? 1) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    isActive: true, note: note || null,
  }).returning();
  res.status(201).json({ id: grant!.id, userId: grant!.userId, grantType: grant!.grantType });
});

router.delete("/admin/grants/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.update(listingPublishGrantsTable).set({ isActive: false }).where(eq(listingPublishGrantsTable.id, id));
  res.json({ success: true });
});

router.get("/users/my-publish-grant", authMiddleware, async (req, res): Promise<void> => {
  const { id: userId, role } = req.user!;
  if (role === "admin" || role === "moderator") { res.json({ canPublish: true, reason: role }); return; }
  const perm = await checkPublishPermission(userId, role);
  res.json({ canPublish: perm.allowed, grantId: perm.grantId ?? null });
});

// ─── Admin: support tickets ──────────────────────────────────────
router.get("/admin/support", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const status = req.query["status"] as string | undefined;
  const conditions = status && status !== "all" ? [eq(supportTicketsTable.status, status)] : [];
  const tickets = await db.select().from(supportTicketsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportTicketsTable.updatedAt)).limit(50);
  res.json(tickets.map(t => ({ id: t.id, subject: t.subject, status: t.status, userId: t.userId, username: null, msgCount: 0, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })));
});

export default router;
