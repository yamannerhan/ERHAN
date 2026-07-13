import { Router } from "express";
import { authMiddleware, optionalAuthMiddleware, requireAdmin } from "../middlewares/auth";
import {
  getPushPublicKey,
  savePushSubscription,
  removePushSubscription,
  broadcastPush,
  countPushSubscriptions,
  ensurePushSchema,
  ensureVapidKeys,
  isInvalidSoundUrl,
  sanitizeSoundUrl,
} from "../lib/web-push";
import { getUserNotifPrefs, updateUserNotifPrefs, type UserNotifPrefs } from "../lib/user-notif-prefs";
import { db, adminSettingsTable, pushCampaignsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router = Router();

function nextSendDate(schedule: string, from = new Date()): Date {
  const d = new Date(from.getTime());
  if (schedule === "daily") d.setDate(d.getDate() + 1);
  else if (schedule === "weekly") d.setDate(d.getDate() + 7);
  else if (schedule === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 1);
  return d;
}

/** Kullanıcı bildirim tercihleri (profil) */
router.get("/push/prefs", authMiddleware, async (req, res): Promise<void> => {
  try {
    const prefs = await getUserNotifPrefs(req.user!.id);
    res.json(prefs);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Tercihler alınamadı" });
  }
});

router.patch("/push/prefs", authMiddleware, async (req, res): Promise<void> => {
  try {
    const body = req.body as Partial<UserNotifPrefs>;
    const prefs = await updateUserNotifPrefs(req.user!.id, body);
    res.json(prefs);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Tercihler kaydedilemedi" });
  }
});

router.get("/push/vapid-public-key", async (_req, res): Promise<void> => {
  try {
    const publicKey = await getPushPublicKey();
    res.json({ publicKey });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "VAPID alınamadı" });
  }
});

router.post("/push/subscribe", optionalAuthMiddleware, async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      res.status(400).json({ error: "Geçersiz abonelik" });
      return;
    }
    await savePushSubscription({
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userId: req.user?.id ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Abonelik kaydedilemedi" });
  }
});

router.post("/push/unsubscribe", async (req, res): Promise<void> => {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      res.status(400).json({ error: "endpoint gerekli" });
      return;
    }
    await removePushSubscription(endpoint);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Abonelik silinemedi" });
  }
});

router.get("/admin/push/stats", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  await ensurePushSchema();
  await ensureVapidKeys();
  const [settings] = await db.select().from(adminSettingsTable).limit(1);
  const subscribers = await countPushSubscriptions();
  const recent = await db.select().from(pushCampaignsTable).orderBy(desc(pushCampaignsTable.createdAt)).limit(20);
  res.json({
    subscribers,
    pushEnabled: settings?.pushEnabled !== false,
    pushOnNewListing: settings?.pushOnNewListing !== false,
    pushOnChatReply: settings?.pushOnChatReply !== false,
    pushSoundEnabled: settings?.pushSoundEnabled !== false,
    pushDigestMode: settings?.pushDigestMode ?? "off",
    pushDigestLastSentAt: settings?.pushDigestLastSentAt?.toISOString() ?? null,
    pushOnUserJoin: settings?.pushOnUserJoin !== false,
    pushSoundListingUrl: settings?.pushSoundListingUrl ?? null,
    pushSoundJoinUrl: settings?.pushSoundJoinUrl ?? null,
    pushSoundReplyUrl: settings?.pushSoundReplyUrl ?? null,
    pushSoundCampaignUrl: settings?.pushSoundCampaignUrl ?? null,
    recent: recent.map((c) => ({
      id: c.id,
      title: c.title,
      body: c.body,
      url: c.url,
      schedule: c.schedule,
      sentCount: c.sentCount,
      isActive: c.isActive,
      nextSendAt: c.nextSendAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      sentAt: c.sentAt?.toISOString() ?? null,
    })),
  });
});

router.post("/admin/push/send", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { title, body, url, schedule } = req.body as {
    title?: string;
    body?: string;
    url?: string;
    schedule?: string;
  };
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "Başlık ve mesaj gerekli" });
    return;
  }
  const mode = ["instant", "daily", "weekly", "monthly"].includes(String(schedule))
    ? String(schedule)
    : "instant";

  await ensurePushSchema();
  const now = new Date();
  const recurring = mode !== "instant";

  const [campaign] = await db.insert(pushCampaignsTable).values({
    title: title.trim().slice(0, 120),
    body: body.trim().slice(0, 500),
    url: url?.trim() || "/",
    schedule: mode,
    createdBy: req.user!.id,
    isActive: recurring,
    nextSendAt: recurring ? nextSendDate(mode, now) : null,
  }).returning();

  // Anlık veya tekrarlayan: hemen bir kez gönder (force = site açık olsa bile)
  const result = await broadcastPush({
    title: campaign.title,
    body: campaign.body,
    url: campaign.url ?? "/",
    tag: `campaign-${campaign.id}-${Date.now()}`,
    kind: "campaign",
    force: true,
  }, { force: true });

  await db.update(pushCampaignsTable)
    .set({ sentCount: result.sent, sentAt: now })
    .where(eq(pushCampaignsTable.id, campaign.id));

  const warnParts: string[] = [];
  if (result.total === 0 && result.skippedForeground === 0) {
    warnParts.push("Abone cihaz yok — kullanıcıların bildirim izni vermesi gerekir.");
  }
  if (result.skippedForeground > 0) {
    warnParts.push(`${result.skippedForeground} cihaz uygulama açık olduğu için atlandı.`);
  }

  res.json({
    success: true,
    mode,
    sent: result.sent,
    total: result.total,
    skippedForeground: result.skippedForeground,
    campaignId: campaign.id,
    message: recurring
      ? `${result.sent} cihaza gönderildi. ${mode === "daily" ? "Günlük" : mode === "weekly" ? "Haftalık" : "Aylık"} otomatik tekrar aktif.`
      : `${result.sent}/${result.total} cihaza gönderildi.`,
    warning: warnParts.join(" ") || null,
  });
});

/** Aynı bildirimi tekrar gönder */
router.post("/admin/push/resend/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Geçersiz ID" });
    return;
  }
  await ensurePushSchema();
  const [campaign] = await db.select().from(pushCampaignsTable).where(eq(pushCampaignsTable.id, id)).limit(1);
  if (!campaign) {
    res.status(404).json({ error: "Kampanya bulunamadı" });
    return;
  }
  const result = await broadcastPush({
    title: campaign.title,
    body: campaign.body,
    url: campaign.url ?? "/",
    tag: `campaign-resend-${campaign.id}-${Date.now()}`,
    kind: "campaign",
    force: true,
  }, { force: true });

  await db.update(pushCampaignsTable)
    .set({
      sentCount: (campaign.sentCount ?? 0) + result.sent,
      sentAt: new Date(),
    })
    .where(eq(pushCampaignsTable.id, campaign.id));

  res.json({
    success: true,
    sent: result.sent,
    total: result.total,
    message: `${result.sent}/${result.total} cihaza tekrar gönderildi.`,
  });
});

/** Tekrarlayan kampanyayı durdur */
router.post("/admin/push/stop/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Geçersiz ID" });
    return;
  }
  await db.update(pushCampaignsTable)
    .set({ isActive: false, nextSendAt: null })
    .where(eq(pushCampaignsTable.id, id));
  res.json({ success: true, message: "Otomatik gönderim durduruldu." });
});

export default router;
