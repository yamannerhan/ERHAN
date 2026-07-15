import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { authMiddleware, signToken } from "../middlewares/auth";
import { loginRateLimit, passwordRateLimit, registerRateLimit } from "../middlewares/security";
import { io, makeBotMsg, saveChatMessage } from "../index";
import { emitRealtimeToUser } from "../lib/realtime";

const router = Router();

function userJson(user: any) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName ?? null,
    fullName: user.fullName ?? null,
    role: user.role,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    nameColor: user.nameColor,
    nameAnimated: user.nameAnimated,
    isVip: user.isVip && (!user.vipUntil || user.vipUntil > new Date()),
    vipUntil: user.vipUntil?.toISOString() ?? null,
    xp: user.xp ?? 0,
    level: user.level ?? 1,
    avatarFrame: user.avatarFrame ?? "none",
    chatBubble: user.chatBubble ?? "default",
    isBanned: user.isBanned,
    banReason: user.banReason,
    banExpiresAt: user.banExpiresAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    phone: user.phone ?? null,
    birthDate: user.birthDate ?? null,
    height: user.height ?? null,
    weight: user.weight ?? null,
    address: user.address ?? null,
    maritalStatus: user.maritalStatus ?? null,
  };
}

router.post("/auth/register", registerRateLimit, async (req, res): Promise<void> => {
  const { username, email, password, firstName, lastName } =
    req.body as { username?: string; email?: string; password?: string; firstName?: string; lastName?: string };

  if (!username || !email || !password) {
    res.status(400).json({ error: "Tüm alanlar zorunludur" });
    return;
  }
  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedUsername.length < 3 || normalizedUsername.length > 40 || normalizedEmail.length > 254) {
    res.status(400).json({ error: "Kullanıcı adı veya e-posta biçimi geçersiz" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: "Geçerli bir e-posta adresi girin" });
    return;
  }
  if (password.length < 10 || password.length > 128) {
    res.status(400).json({ error: "Şifre 10-128 karakter olmalıdır" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing) { res.status(400).json({ error: "Bu e-posta adresi zaten kayıtlı" }); return; }

  const [existingUsername] = await db.select().from(usersTable).where(eq(usersTable.username, normalizedUsername));
  if (existingUsername) { res.status(400).json({ error: "Bu kullanıcı adı zaten alınmış" }); return; }

  // displayName = sadece ad (sohbette görünür)
  const displayName = firstName?.trim() || null;
  // fullName = ad + soyad (CV için)
  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ") || null;

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash,
    role: "user",
    displayName,
    fullName,
  }).returning();

  const token = signToken(user.id, user.role);

  // ── Sohbete hoşgeldin mesajı ──────────────────────────────────
  try {
    const name = displayName || normalizedUsername;
    const welcomeMsg = `🎉 **${name}** @${normalizedUsername} aramıza katıldı! Hoşgeldin, iyi eğlenceler dileriz! 👋`;
    const saved = await saveChatMessage(0, welcomeMsg);
    io.emit("chat:welcome", { message: welcomeMsg, username: normalizedUsername });
    if (saved) {
      io.emit("chat:message", makeBotMsg(welcomeMsg, null, saved.id, saved.createdAt.toISOString()));
    }
  } catch {
    // Chat mesajı gönderilemezse kaydı etkileme
  }

  // Admin'den kişisel hoşgeldin bildirimi (uygulama kapalıysa push da gider)
  try {
    const name = displayName || normalizedUsername;
    const title = "Hoş geldin!";
    const message = `Merhaba ${name}, Özel Güvenlik ailesine katıldığın için teşekkürler. İyi eğlenceler!`;
    await db.insert(notificationsTable).values({
      userId: user.id,
      type: "welcome",
      title,
      message,
      linkUrl: "/",
      isRead: false,
    });
    emitRealtimeToUser(user.id, "notification:new", {
      type: "welcome",
      title,
      message,
      linkUrl: "/",
      userId: user.id,
      createdAt: new Date().toISOString(),
    });
    void import("../lib/web-push").then((m) => m.maybePushWelcome(user.id, name)).catch(() => {});
    // Diğer üyelere: yeni kayıt bildirimi (sohbete girince değil)
    void import("../lib/web-push").then((m) => m.maybePushNewRegistration(name)).catch(() => {});
  } catch {
    // bildirim hatası kaydı etkilemesin
  }

  res.status(201).json({ user: userJson(user), token: token });
});

router.post("/auth/login", loginRateLimit, async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "E-posta/kullanıcı adı ve şifre zorunludur" });
    return;
  }

  const identifier = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, identifier), eq(usersTable.username, email.trim())));

  if (!user) { res.status(401).json({ error: "E-posta/kullanıcı adı veya şifre hatalı" }); return; }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "E-posta/kullanıcı adı veya şifre hatalı" }); return; }

  if (user.isBanned) {
    const now = new Date();
    if (!user.banExpiresAt || user.banExpiresAt > now) {
      res.status(403).json({ error: "Hesabınız yasaklandı", banReason: user.banReason });
      return;
    }
  }

  const token = signToken(user.id, user.role);
  res.json({ user: userJson(user), token });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true, message: "Çıkış yapıldı" });
});

router.get("/auth/me", authMiddleware, (req, res): void => {
  try {
    res.json(userJson(req.user!));
  } catch {
    res.status(500).json({ error: "Kullanıcı bilgisi alınamadı" });
  }
});

// Change password — available to all authenticated users
router.post("/auth/change-password", authMiddleware, passwordRateLimit, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } =
    req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Mevcut ve yeni şifre zorunludur" });
    return;
  }
  if (newPassword.length < 10 || newPassword.length > 128) {
    res.status(400).json({ error: "Yeni şifre 10-128 karakter olmalıdır" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "Mevcut şifre hatalı" }); return; }

  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, user.id));
  res.json({ success: true, message: "Şifre güncellendi" });
});

export default router;
