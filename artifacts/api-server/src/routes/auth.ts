import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { authMiddleware, signToken } from "../middlewares/auth";
import { io, makeBotMsg, saveChatMessage } from "../index";

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

router.post("/auth/register", async (req, res): Promise<void> => {
  const { username, email, password, firstName, lastName } =
    req.body as { username?: string; email?: string; password?: string; firstName?: string; lastName?: string };

  if (!username || !email || !password) {
    res.status(400).json({ error: "Tüm alanlar zorunludur" });
    return;
  }
  if (username.length < 3) {
    res.status(400).json({ error: "Kullanıcı adı en az 3 karakter olmalıdır" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Şifre en az 6 karakter olmalıdır" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) { res.status(400).json({ error: "Bu e-posta adresi zaten kayıtlı" }); return; }

  const [existingUsername] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existingUsername) { res.status(400).json({ error: "Bu kullanıcı adı zaten alınmış" }); return; }

  // displayName = sadece ad (sohbette görünür)
  const displayName = firstName?.trim() || null;
  // fullName = ad + soyad (CV için)
  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ") || null;

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    username,
    email,
    passwordHash,
    role: "user",
    displayName,
    fullName,
  }).returning();

  const token = signToken(user.id, user.role);

  // ── Sohbete hoşgeldin mesajı ──────────────────────────────────
  try {
    const name = displayName || username;
    const welcomeMsg = `🎉 **${name}** @${username} aramıza katıldı! Hoşgeldin, iyi eğlenceler dileriz! 👋`;
    await saveChatMessage(0, welcomeMsg);
    io.emit("chat:welcome", { message: welcomeMsg, username });
    io.emit("chat:message", makeBotMsg(welcomeMsg, null));
  } catch {
    // Chat mesajı gönderilemezse kaydı etkileme
  }

  res.status(201).json({ user: userJson(user), token });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "E-posta/kullanıcı adı ve şifre zorunludur" });
    return;
  }

  const adminEmail = process.env["ADMIN_EMAIL"] || "erhanyaman001@gmail.com";
  const adminUsername = process.env["ADMIN_USERNAME"] || "admin";
  const adminPassword = process.env["ADMIN_PASSWORD"] || "yamann01";
  const isAdminLogin = (email.toLowerCase() === adminEmail.toLowerCase() || email.toLowerCase() === adminUsername.toLowerCase()) && password === adminPassword;

  if (isAdminLogin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const [existingAdmin] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.email, adminEmail), eq(usersTable.username, adminUsername)))
      .limit(1);

    let adminUser = existingAdmin;
    if (adminUser) {
      const [updatedAdmin] = await db.update(usersTable).set({
        username: adminUsername,
        email: adminEmail,
        passwordHash,
        role: "admin",
        displayName: "Admin",
        fullName: "Admin",
        isBanned: false,
        banReason: null,
        banExpiresAt: null,
      }).where(eq(usersTable.id, adminUser.id)).returning();
      adminUser = updatedAdmin;
    } else {
      const [createdAdmin] = await db.insert(usersTable).values({
        username: adminUsername,
        email: adminEmail,
        passwordHash,
        role: "admin",
        displayName: "Admin",
        fullName: "Admin",
      }).returning();
      adminUser = createdAdmin;
    }

    const token = signToken(adminUser.id, adminUser.role);
    res.json({ user: userJson(adminUser), token });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, email), eq(usersTable.username, email)));

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
router.post("/auth/change-password", authMiddleware, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } =
    req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Mevcut ve yeni şifre zorunludur" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "Yeni şifre en az 6 karakter olmalıdır" });
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
