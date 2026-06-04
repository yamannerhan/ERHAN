import { Router } from "express";
import { db, chatMessagesTable, usersTable, adminSettingsTable, chatReactionsTable } from "@workspace/db";
import { eq, desc, and, lt, inArray } from "drizzle-orm";
import { authMiddleware, optionalAuthMiddleware, requireAdmin, requireAdminOrModerator } from "../middlewares/auth";
import { triggerContextualReply } from "../lib/chat-bot";
import { filterProfanity } from "../lib/profanity";
import { VIRTUAL_USERS } from "../lib/virtual-users";

const router = Router();

export const onlineSockets = new Map<string, { userId?: number; joinedAt: Date }>();

const lastMessageAt = new Map<number, number>();

function extractMentions(content: string): string[] {
  const regex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    mentions.push(match[1]!);
  }
  return [...new Set(mentions)];
}

async function formatMessage(
  msg: typeof chatMessagesTable.$inferSelect,
  userMap: Map<number, typeof usersTable.$inferSelect>,
  reactionsMap?: Map<number, Array<{ emoji: string; userId: number; username: string; displayName: string | null }>>
) {
  const vUser = VIRTUAL_USERS[msg.userId];
  const user = userMap.get(msg.userId);
  let replyToUsername: string | null = null;
  let replyToContent: string | null = null;

  if (msg.replyToId) {
    const [replyMsg] = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.id, msg.replyToId));
    if (replyMsg) {
      replyToContent = replyMsg.content;
      const replyVUser = VIRTUAL_USERS[replyMsg.userId];
      const replyUser = userMap.get(replyMsg.userId);
      replyToUsername = replyVUser?.username ?? replyUser?.username ?? null;
    }
  }

  return {
    id: msg.id,
    content: msg.content,
    userId: msg.userId,
    username:        vUser?.username        ?? user?.username        ?? "Silindi",
    displayName:     vUser?.displayName     ?? user?.displayName     ?? null,
    userAvatarUrl:   vUser?.avatarUrl       ?? user?.avatarUrl       ?? null,
    userNameColor:   vUser?.nameColor       ?? user?.nameColor       ?? null,
    userNameAnimated:vUser?.nameAnimated    ?? user?.nameAnimated    ?? false,
    userRole:        vUser?.role            ?? user?.role            ?? "user",
    isBot:           vUser?.isBot           ?? false,
    isFake:          vUser?.isFake          ?? false,
    replyToId: msg.replyToId,
    replyToUsername,
    replyToContent,
    isPinned: msg.isPinned,
    mentions: extractMentions(msg.content),
    reactions: reactionsMap?.get(msg.id) ?? [],
    createdAt: msg.createdAt.toISOString(),
  };
}

router.get("/chat/messages", optionalAuthMiddleware, async (req, res): Promise<void> => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10)));
  const before = req.query["before"] ? parseInt(String(req.query["before"]), 10) : undefined;

  const conditions = [eq(chatMessagesTable.isDeleted, false)];
  if (before != null && !isNaN(before)) {
    conditions.push(lt(chatMessagesTable.id, before));
  }

  const messages = await db.select().from(chatMessagesTable)
    .where(and(...conditions))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);

  messages.reverse();

  const allUsers = await db.select().from(usersTable);
  const userMap = new Map(allUsers.map(u => [u.id, u]));

  // Batch-fetch reactions for all messages
  const msgIds = messages.map(m => m.id);
  let reactionsMap = new Map<number, Array<{ emoji: string; userId: number; username: string; displayName: string | null }>>();
  if (msgIds.length > 0) {
    const allReactions = await db.select().from(chatReactionsTable).where(inArray(chatReactionsTable.messageId, msgIds));
    for (const r of allReactions) {
      const list = reactionsMap.get(r.messageId) ?? [];
      list.push({ emoji: r.emoji, userId: r.userId, username: r.username, displayName: r.displayName ?? null });
      reactionsMap.set(r.messageId, list);
    }
  }

  const formatted = await Promise.all(messages.map(m => formatMessage(m, userMap, reactionsMap)));
  res.json(formatted);
});

router.post("/chat/messages", authMiddleware, async (req, res): Promise<void> => {
  const settings = await db.select().from(adminSettingsTable).limit(1);
  const chatLocked = settings[0]?.chatLocked ?? false;
  const spamCooldown = settings[0]?.spamCooldown ?? 3;

  if (chatLocked && req.user!.role !== "admin") {
    res.status(403).json({ error: "Sohbet şu an kilitli" });
    return;
  }

  if (req.user!.role === "user" && spamCooldown > 0) {
    const last = lastMessageAt.get(req.user!.id) ?? 0;
    const diffSec = (Date.now() - last) / 1000;
    if (diffSec < spamCooldown) {
      const wait = Math.ceil(spamCooldown - diffSec);
      res.status(429).json({ error: `Çok hızlı mesaj gönderiyorsunuz. ${wait} saniye bekleyin.`, waitSeconds: wait });
      return;
    }
  }
  lastMessageAt.set(req.user!.id, Date.now());

  const { content, replyToId } = req.body as { content?: string; replyToId?: number | null };
  if (!content?.trim()) {
    res.status(400).json({ error: "Mesaj boş olamaz" });
    return;
  }
  if (content.length > 500) {
    res.status(400).json({ error: "Mesaj çok uzun (max 500 karakter)" });
    return;
  }

  // Susturma kontrolü
  if (req.user!.mutedUntil && req.user!.mutedUntil > new Date()) {
    const remaining = Math.ceil((req.user!.mutedUntil.getTime() - Date.now()) / 60000);
    res.status(403).json({ error: `Sohbette susturuldunuz. ${remaining} dakika sonra mesaj gönderebilirsiniz.`, type: "muted" });
    return;
  }

  const filteredContent = filterProfanity(content.trim());

  const [msg] = await db.insert(chatMessagesTable).values({
    content: filteredContent,
    userId: req.user!.id,
    replyToId: replyToId ?? null,
    isPinned: false,
    isDeleted: false,
  }).returning();

  const allUsers = await db.select().from(usersTable);
  const userMap = new Map(allUsers.map(u => [u.id, u]));
  const formatted = await formatMessage(msg, userMap);

  const io = (req as unknown as { app: { get: (key: string) => unknown } }).app.get("io") as { emit: (event: string, data: unknown) => void } | null;
  if (io) {
    io.emit("chat:message", formatted);
  }

  // GuvenlikBot — kullanıcı mesajına anahtar kelime bazlı akıllı yanıt
  triggerContextualReply(formatted.content, formatted.username, formatted.userRole);

  res.status(201).json(formatted);
});

// Toggle emoji reaction
router.post("/chat/messages/:id/react", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const msgId = parseInt(rawId ?? "", 10);
  if (isNaN(msgId)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const { emoji } = req.body as { emoji?: string };
  const ALLOWED = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
  if (!emoji || !ALLOWED.includes(emoji)) { res.status(400).json({ error: "Geçersiz emoji" }); return; }

  const userId = req.user!.id;
  const username = req.user!.username;
  const displayName = req.user!.displayName ?? null;

  const [existing] = await db.select().from(chatReactionsTable)
    .where(and(
      eq(chatReactionsTable.messageId, msgId),
      eq(chatReactionsTable.userId, userId),
      eq(chatReactionsTable.emoji, emoji)
    )).limit(1);

  if (existing) {
    await db.delete(chatReactionsTable).where(eq(chatReactionsTable.id, existing.id));
  } else {
    await db.insert(chatReactionsTable).values({ messageId: msgId, userId, emoji, username, displayName });
  }

  const updatedReactions = await db.select().from(chatReactionsTable)
    .where(eq(chatReactionsTable.messageId, msgId));

  const reactions = updatedReactions.map(r => ({ emoji: r.emoji, userId: r.userId, username: r.username, displayName: r.displayName ?? null }));

  const io = (req as unknown as { app: { get: (key: string) => unknown } }).app.get("io") as { emit: (event: string, data: unknown) => void } | null;
  if (io) {
    io.emit("chat:react", { messageId: msgId, reactions });
  }

  res.json({ reactions });
});

router.delete("/chat/messages/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  await db.update(chatMessagesTable).set({ isDeleted: true }).where(eq(chatMessagesTable.id, id));

  const io = (req as unknown as { app: { get: (key: string) => unknown } }).app.get("io") as { emit: (event: string, data: unknown) => void } | null;
  if (io) {
    io.emit("chat:delete", { id });
  }

  res.sendStatus(204);
});

router.delete("/chat/messages", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  await db.update(chatMessagesTable).set({ isDeleted: true }).where(eq(chatMessagesTable.isDeleted, false));

  const clearedBy = req.user!.displayName || req.user!.username;
  const roleLabel = req.user!.role === "admin" ? "Admin" : "Moderatör";

  const io = (req as unknown as { app: { get: (key: string) => unknown } }).app.get("io") as { emit: (event: string, data: unknown) => void } | null;
  if (io) {
    // Önce tüm clientları temizle
    io.emit("chat:cleared", { clearedBy: req.user!.username, role: req.user!.role });

    // Sistem mesajı — GuvenlikBot formatında, Socket.io üzerinden gönderilir
    const systemMsg = {
      id: Date.now() + Math.random(),
      content: `${roleLabel} ${clearedBy} sohbeti temizledi. Yeni sohbet başlıyor.`,
      userId: 0,
      username: "Sistem",
      displayName: "SİSTEM",
      userAvatarUrl: null,
      userNameColor: "#64748b",
      userNameAnimated: false,
      userRole: "bot",
      isBot: true,
      replyToId: null,
      replyToUsername: null,
      replyToContent: null,
      isPinned: false,
      mentions: [],
      reactions: [],
      createdAt: new Date().toISOString(),
    };
    // Kısa gecikmeyle gönder — clientlar önce cleared event'ini işlesin
    setTimeout(() => { io.emit("chat:message", systemMsg); }, 300);
  }

  res.sendStatus(204);
});

router.post("/chat/messages/:id/pin", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [msg] = await db.select({ isPinned: chatMessagesTable.isPinned }).from(chatMessagesTable).where(eq(chatMessagesTable.id, id));
  if (!msg) { res.status(404).json({ error: "Mesaj bulunamadı" }); return; }

  await db.update(chatMessagesTable).set({ isPinned: !msg.isPinned }).where(eq(chatMessagesTable.id, id));
  res.json({ success: true, message: msg.isPinned ? "Sabitleme kaldırıldı" : "Mesaj sabitlendi" });
});

router.get("/chat/online", async (_req, res): Promise<void> => {
  const settings = await db.select().from(adminSettingsTable).limit(1);
  const s0 = settings[0];
  const fakeMin = s0?.fakeOnlineMin ?? 0;
  const fakeMax = s0?.fakeOnlineMax ?? 0;
  const fakeBonus = fakeMin > 0 || fakeMax > 0
    ? Math.floor(Math.random() * (Math.max(fakeMin, fakeMax) - Math.min(fakeMin, fakeMax) + 1)) + Math.min(fakeMin, fakeMax)
    : (s0?.fakeOnlineBonus ?? 0);
  const realCount = onlineSockets.size;
  res.json({ count: realCount + fakeBonus, fakeBonus });
});

export default router;
