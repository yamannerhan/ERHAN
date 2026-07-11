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
} from "../lib/web-push";
import { db, adminSettingsTable, pushCampaignsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router = Router();

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
  const [campaign] = await db.insert(pushCampaignsTable).values({
    title: title.trim().slice(0, 120),
    body: body.trim().slice(0, 500),
    url: url?.trim() || "/",
    schedule: mode,
    createdBy: req.user!.id,
  }).returning();

  if (mode === "instant") {
    const result = await broadcastPush({
      title: campaign.title,
      body: campaign.body,
      url: campaign.url ?? "/",
      tag: `campaign-${campaign.id}`,
      kind: "campaign",
    });
    await db.update(pushCampaignsTable)
      .set({ sentCount: result.sent, sentAt: new Date() })
      .where(eq(pushCampaignsTable.id, campaign.id));
    res.json({
      success: true,
      mode: "instant",
      sent: result.sent,
      total: result.total,
      message: `${result.sent}/${result.total} cihaza gönderildi.`,
    });
    return;
  }

  // daily/weekly/monthly: digest modunu ayarla (özet motoru kullanır)
  const [settings] = await db.select().from(adminSettingsTable).limit(1);
  if (settings) {
    await db.update(adminSettingsTable)
      .set({ pushDigestMode: mode, pushEnabled: true })
      .where(eq(adminSettingsTable.id, settings.id));
  }
  res.json({
    success: true,
    mode,
    message: `${mode === "daily" ? "Günlük" : mode === "weekly" ? "Haftalık" : "Aylık"} özet bildirim aktif edildi.`,
  });
});

export default router;
