import { Router } from "express";
import { db, chatMessagesTable, usersTable, adminSettingsTable, chatReactionsTable, notificationsTable } from "@workspace/db";
import { eq, desc, and, lt, gt, inArray } from "drizzle-orm";
import { authMiddleware, optionalAuthMiddleware, requireAdmin, requireAdminOrModerator } from "../middlewares/auth";
import { triggerContextualReply } from "../lib/chat-bot";
import { filterProfanity } from "../lib/profanity";
import { getExtraBannedWords } from "../lib/banned-words-cache";
import { VIRTUAL_USERS } from "../lib/virtual-users";
import { emitRealtimeToUser } from "../lib/realtime";

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
  reactionsMap?: Map<number, Array<{ emoji: string; userId: number; username: string; displayName: string | null }>>,
  pollMap?: Map<number, Awaited<ReturnType<typeof import("../lib/chat-polls").getPollPayload>>>,
) {
  const vUser = VIRTUAL_USERS[msg.userId];
  const user = userMap.get(msg.userId);
  let replyToUsername: string | null = null;
  let replyToContent: string | null = null;

  if (msg.replyToId) {
    const [replyMsg] = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.id, msg.replyToId));
    if (replyMsg) {
      const { parsePollIdFromContent } = await import("../lib/chat-polls");
      const pollId = parsePollIdFromContent(replyMsg.content);
      replyToContent = pollId ? "📊 Anket" : replyMsg.content;
      const replyVUser = VIRTUAL_USERS[replyMsg.userId];
      const replyUser = userMap.get(replyMsg.userId);
      replyToUsername = replyVUser?.username ?? replyUser?.username ?? null;
    }
  }

  const { parsePollIdFromContent } = await import("../lib/chat-polls");
  const pollId = parsePollIdFromContent(msg.content);
  const poll = pollId && pollMap ? pollMap.get(pollId) ?? null : null;

  return {
    id: msg.id,
    content: poll ? `📊 ${poll.question}` : msg.content,
    rawContent: msg.content,
    poll: poll ?? null,
    userId: msg.userId,
    username:        vUser?.username        ?? user?.username        ?? "Silindi",
    displayName:     vUser?.displayName     ?? user?.displayName     ?? null,
    userAvatarUrl:   vUser?.avatarUrl       ?? user?.avatarUrl       ?? null,
    userNameColor:   vUser?.nameColor       ?? user?.nameColor       ?? null,
    userNameAnimated:vUser?.nameAnimated    ?? user?.nameAnimated    ?? false,
    userRole:        vUser?.role            ?? user?.role            ?? "user",
    isVip:           user ? (user.isVip && (!user.vipUntil || user.vipUntil > new Date())) : false,
    vipUntil:        user?.vipUntil?.toISOString() ?? null,
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
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "100"), 10)));
    const before = req.query["before"] ? parseInt(String(req.query["before"]), 10) : undefined;
    const after = req.query["after"] ? parseInt(String(req.query["after"]), 10) : undefined;

    const conditions = [eq(chatMessagesTable.isDeleted, false)];
    if (before != null && !isNaN(before)) {
      conditions.push(lt(chatMessagesTable.id, before));
    }
    if (after != null && !isNaN(after)) {
      conditions.push(gt(chatMessagesTable.id, after));
    }

    const messages = await db.select().from(chatMessagesTable)
      .where(and(...conditions))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(limit);

    messages.reverse();

    const allUsers = await db.select().from(usersTable);
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    const msgIds = messages.map(m => m.id);
    const reactionsMap = new Map<number, Array<{ emoji: string; userId: number; username: string; displayName: string | null }>>();
    if (msgIds.length > 0) {
      const allReactions = await db.select().from(chatReactionsTable).where(inArray(chatReactionsTable.messageId, msgIds));
      for (const r of allReactions) {
        const list = reactionsMap.get(r.messageId) ?? [];
        list.push({ emoji: r.emoji, userId: r.userId, username: r.username, displayName: r.displayName ?? null });
        reactionsMap.set(r.messageId, list);
      }
    }

    const { getPollsForMessages } = await import("../lib/chat-polls");
    const pollMap = await getPollsForMessages(
      messages.map((m) => m.content),
      req.user?.id ?? null,
    );

    const formatted = await Promise.all(messages.map(m => formatMessage(m, userMap, reactionsMap, pollMap)));
    res.json(formatted);
  } catch (error) {
    req.app.get("logger")?.error?.({ error }, "chat/messages failed");
    res.status(500).json({ error: "Sohbet mesajları yüklenemedi" });
  }
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

  const extraBanned = await getExtraBannedWords();
  const filteredContent = filterProfanity(content.trim(), extraBanned);

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

  // Yanıt bildirimi — gerçek kullanıcıya
  if (replyToId) {
    try {
      const [orig] = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.id, replyToId)).limit(1);
      if (orig && orig.userId > 0 && orig.userId !== req.user!.id) {
        const { getUserNotifPrefs, prefsAllowInAppType } = await import("../lib/user-notif-prefs");
        const prefs = await getUserNotifPrefs(orig.userId);
        if (prefsAllowInAppType(prefs, "message")) {
          const preview = filteredContent.length > 100 ? `${filteredContent.slice(0, 100)}…` : filteredContent;
          const title = "Mesajın yanıtlandı";
          const message = `${req.user!.username}: ${preview}`;
          await db.insert(notificationsTable).values({
            userId: orig.userId,
            type: "message",
            title,
            message,
            relatedId: msg.id,
            linkUrl: "/sohbet",
            isRead: false,
          });
          emitRealtimeToUser(orig.userId, "notification:new", {
            type: "message",
            title,
            message,
            relatedId: msg.id,
            linkUrl: "/sohbet",
            userId: orig.userId,
            createdAt: new Date().toISOString(),
          });
          void import("../lib/web-push").then((m) =>
            m.maybePushChatReply(orig.userId, title, message),
          ).catch(() => {});
        }
      }
    } catch { /* bildirim hatası mesajı engellemesin */ }
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
  const displayName = (req.user as any).displayName ?? null;

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

router.delete("/chat/messages/:id", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  // Moderatör yalnızca normal kullanıcı mesajını silebilir
  if (req.user!.role === "moderator") {
    const [row] = await db.select({ userId: chatMessagesTable.userId }).from(chatMessagesTable).where(eq(chatMessagesTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "Mesaj bulunamadı" }); return; }
    if (row.userId > 0) {
      const [author] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
      if (author && author.role !== "user") {
        res.status(403).json({ error: "Moderatörler yalnızca üye mesajlarını silebilir" });
        return;
      }
    }
  }

  await db.update(chatMessagesTable).set({ isDeleted: true }).where(eq(chatMessagesTable.id, id));

  const io = (req as unknown as { app: { get: (key: string) => unknown } }).app.get("io") as { emit: (event: string, data: unknown) => void } | null;
  if (io) {
    io.emit("chat:delete", { id });
  }

  res.sendStatus(204);
});

router.delete("/chat/messages", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  await db.update(chatMessagesTable).set({ isDeleted: true }).where(eq(chatMessagesTable.isDeleted, false));

  const clearedBy = (req.user as any).displayName || req.user!.username;
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

/** Admin / moderatör anket paylaşır */
router.post("/chat/polls", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  try {
    const { question, options } = req.body as { question?: string; options?: string[] };
    const { createPoll } = await import("../lib/chat-polls");
    const result = await createPoll({
      question: question ?? "",
      options: Array.isArray(options) ? options : [],
      createdBy: req.user!.id,
    });

    const allUsers = await db.select().from(usersTable);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const [msg] = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.id, result.messageId)).limit(1);
    const pollMap = new Map([[result.poll.id, result.poll]]);
    const formatted = await formatMessage(msg!, userMap, undefined, pollMap);

    const io = (req as unknown as { app: { get: (key: string) => unknown } }).app.get("io") as { emit: (event: string, data: unknown) => void } | null;
    if (io) io.emit("chat:message", formatted);

    res.status(201).json(formatted);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Anket oluşturulamadı" });
  }
});

router.post("/chat/polls/:id/vote", authMiddleware, async (req, res): Promise<void> => {
  try {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const pollId = parseInt(rawId ?? "", 10);
    const optionIndex = Number((req.body as { optionIndex?: number }).optionIndex);
    if (isNaN(pollId) || isNaN(optionIndex)) {
      res.status(400).json({ error: "Geçersiz oy" });
      return;
    }
    const { votePoll } = await import("../lib/chat-polls");
    const poll = await votePoll(pollId, req.user!.id, optionIndex);
    const io = (req as unknown as { app: { get: (key: string) => unknown } }).app.get("io") as { emit: (event: string, data: unknown) => void } | null;
    if (io) io.emit("chat:poll:update", poll);
    res.json(poll);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Oy kaydedilemedi" });
  }
});

export default router;
