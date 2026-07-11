import webpush from "web-push";
import { db, adminSettingsTable, pushSubscriptionsTable, listingsTable, pushCampaignsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logger } from "./logger";
import {
  DEFAULT_NOTIF_PREFS,
  getNotifPrefsMap,
  prefsAllowPushKind,
} from "./user-notif-prefs";
import { isUserForeground } from "./presence";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  sound?: boolean;
  /** listing | join | reply | campaign | digest | welcome */
  kind?: string;
  soundUrl?: string | null;
  icon?: string | null;
  badge?: string | null;
  /** true = uygulama açık olsa bile OS bildirimi göster */
  force?: boolean;
};

let ensured = false;

/** YouTube sayfa linki ses dosyası değildir — çalmaz */
export function sanitizeSoundUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  const low = u.toLowerCase();
  if (
    low.includes("youtube.com")
    || low.includes("youtu.be")
    || low.includes("youtube.com/shorts")
    || low.includes("music.youtube")
  ) {
    return null;
  }
  // Doğrudan ses / genel https dosya
  return u;
}

export function isInvalidSoundUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return sanitizeSoundUrl(url) == null;
}

function nextSendDate(schedule: string, from = new Date()): Date {
  const d = new Date(from.getTime());
  if (schedule === "daily") d.setDate(d.getDate() + 1);
  else if (schedule === "weekly") d.setDate(d.getDate() + 7);
  else if (schedule === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 1);
  return d;
}

/** Deploy'da drizzle push gecikse bile tablolar/kolonlar hazır olsun */
export async function ensurePushSchema(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_campaigns (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        url TEXT,
        schedule TEXT NOT NULL DEFAULT 'instant',
        sent_count INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ
      )
    `);
    await db.execute(sql`ALTER TABLE push_campaigns ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE push_campaigns ADD COLUMN IF NOT EXISTS next_send_at TIMESTAMPTZ`);
    const cols: Array<[string, string]> = [
      ["push_enabled", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["push_on_new_listing", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["push_on_chat_reply", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["push_sound_enabled", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["push_digest_mode", "TEXT NOT NULL DEFAULT 'off'"],
      ["push_digest_last_sent_at", "TIMESTAMPTZ"],
      ["vapid_public_key", "TEXT"],
      ["vapid_private_key", "TEXT"],
      ["push_on_user_join", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["push_sound_listing_url", "TEXT"],
      ["push_sound_join_url", "TEXT"],
      ["push_sound_reply_url", "TEXT"],
      ["push_sound_campaign_url", "TEXT"],
    ];
    for (const [name, type] of cols) {
      await db.execute(sql.raw(
        `ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS ${name} ${type}`,
      ));
    }
    ensured = true;
  } catch (e) {
    logger.warn({ err: e }, "web-push: schema ensure failed");
  }
}

async function getOrCreateSettings() {
  await ensurePushSchema();
  let [s] = await db.select().from(adminSettingsTable).limit(1);
  if (!s) {
    [s] = await db.insert(adminSettingsTable).values({ chatLocked: false, fakeOnlineBonus: 0, maintenanceMode: false }).returning();
  }
  return s!;
}

export async function ensureVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const s = await getOrCreateSettings();
  if (s.vapidPublicKey && s.vapidPrivateKey) {
    webpush.setVapidDetails("mailto:admin@ozelguvenlik.online", s.vapidPublicKey, s.vapidPrivateKey);
    return { publicKey: s.vapidPublicKey, privateKey: s.vapidPrivateKey };
  }
  const keys = webpush.generateVAPIDKeys();
  await db.update(adminSettingsTable)
    .set({ vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey })
    .where(eq(adminSettingsTable.id, s.id));
  webpush.setVapidDetails("mailto:admin@ozelguvenlik.online", keys.publicKey, keys.privateKey);
  logger.info("web-push: VAPID keys generated");
  return keys;
}

export async function getPushPublicKey(): Promise<string> {
  const { publicKey } = await ensureVapidKeys();
  return publicKey;
}

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userId?: number | null;
  userAgent?: string | null;
}): Promise<void> {
  await ensurePushSchema();
  await ensureVapidKeys();
  const existing = await db.select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, input.endpoint))
    .limit(1);
  if (existing[0]) {
    await db.update(pushSubscriptionsTable).set({
      p256dh: input.p256dh,
      auth: input.auth,
      userId: input.userId ?? null,
      userAgent: input.userAgent ?? null,
      updatedAt: new Date(),
    }).where(eq(pushSubscriptionsTable.id, existing[0].id));
    return;
  }
  await db.insert(pushSubscriptionsTable).values({
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userId: input.userId ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await ensurePushSchema();
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
}

export async function countPushSubscriptions(): Promise<number> {
  await ensurePushSchema();
  const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(pushSubscriptionsTable);
  return Number(row?.c ?? 0);
}

async function sendToSub(
  sub: typeof pushSubscriptionsTable.$inferSelect,
  payload: PushPayload,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12, urgency: "high" },
    );
    return true;
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id));
      logger.info({ id: sub.id }, "web-push: stale subscription removed");
    } else {
      logger.warn({ err: e, id: sub.id }, "web-push: send failed");
    }
    return false;
  }
}

export async function broadcastPush(
  payload: PushPayload,
  opts?: { userIds?: number[]; excludeUserIds?: number[]; force?: boolean },
): Promise<{ sent: number; total: number; skippedForeground: number }> {
  await ensureVapidKeys();
  const s = await getOrCreateSettings();
  if (s.pushEnabled === false) return { sent: 0, total: 0, skippedForeground: 0 };

  const force = opts?.force === true || payload.force === true;
  const adminSoundOn = s.pushSoundEnabled !== false && payload.sound !== false;
  const kind = payload.kind || "campaign";
  const rawSound =
    payload.soundUrl
    ?? (kind === "listing" ? s.pushSoundListingUrl
      : kind === "join" ? s.pushSoundJoinUrl
      : kind === "reply" || kind === "chat" ? s.pushSoundReplyUrl
      : s.pushSoundCampaignUrl)
    ?? null;
  const baseSoundUrl = sanitizeSoundUrl(rawSound) || (kind === "campaign" || kind === "digest" ? "/sounds/notify.wav" : null);

  let subs = await db.select().from(pushSubscriptionsTable);
  if (opts?.userIds?.length) {
    const set = new Set(opts.userIds);
    subs = subs.filter((x) => x.userId != null && set.has(x.userId));
  }
  if (opts?.excludeUserIds?.length) {
    const ban = new Set(opts.excludeUserIds);
    subs = subs.filter((x) => x.userId == null || !ban.has(x.userId));
  }

  const userIds = subs.map((x) => x.userId).filter((id): id is number => id != null);
  const prefsMap = await getNotifPrefsMap(userIds);

  let sent = 0;
  let eligible = 0;
  let skippedForeground = 0;
  for (const sub of subs) {
    const prefs = sub.userId != null
      ? (prefsMap.get(sub.userId) ?? DEFAULT_NOTIF_PREFS)
      : DEFAULT_NOTIF_PREFS;

    // Giriş yapmış kullanıcı tercihi kapalıysa gönderme
    if (sub.userId != null && !prefsAllowPushKind(prefs, kind)) continue;

    // Uygulama öndeyse (kampanya force değilse) atla
    if (
      !force
      && sub.userId != null
      && prefs.notifOnlyBackground !== false
      && isUserForeground(sub.userId)
    ) {
      skippedForeground++;
      continue;
    }
    eligible++;

    const sound = adminSoundOn && prefs.notifSound !== false;
    const full: PushPayload = {
      ...payload,
      kind,
      force,
      sound,
      soundUrl: sound ? baseSoundUrl : null,
      icon: payload.icon || "/notification-icon.png",
      badge: payload.badge || "/notification-badge.png",
    };
    if (await sendToSub(sub, full)) sent++;
  }
  return { sent, total: eligible, skippedForeground };
}

/** Sadece gerçek kullanıcı ilanı — bot/scraper çağırmaz */
export async function maybePushNewListing(listing: { id: number; title: string; city?: string | null }): Promise<void> {
  try {
    const s = await getOrCreateSettings();
    if (s.pushEnabled === false || s.pushOnNewListing === false) return;
    const city = listing.city ? ` · ${listing.city}` : "";
    await broadcastPush({
      title: "Yeni üye ilanı",
      body: `${listing.title}${city}`,
      url: `/ilan/${listing.id}`,
      tag: `listing-${listing.id}`,
      kind: "listing",
    });
  } catch (e) {
    logger.warn({ err: e }, "web-push: listing push failed");
  }
}

/** Yeni kayıt olan üye — herkese bir kez (sohbete yeniden girince değil) */
export async function maybePushNewRegistration(displayName: string): Promise<void> {
  try {
    const s = await getOrCreateSettings();
    if (s.pushEnabled === false || s.pushOnUserJoin === false) return;
    await broadcastPush({
      title: "Yeni üye kaydoldu",
      body: `${displayName} aramıza katıldı`,
      url: "/sohbet",
      tag: `register-${Date.now()}`,
      kind: "join",
    });
  } catch (e) {
    logger.warn({ err: e }, "web-push: registration push failed");
  }
}

/** @deprecated reconnect spam — yeni kayıt için maybePushNewRegistration kullan */
export async function maybePushUserJoin(displayName: string): Promise<void> {
  return maybePushNewRegistration(displayName);
}

export async function maybePushChatReply(userId: number, title: string, body: string): Promise<void> {
  try {
    const s = await getOrCreateSettings();
    if (s.pushEnabled === false || s.pushOnChatReply === false) return;
    await broadcastPush(
      { title, body, url: "/sohbet", tag: `chat-reply-${userId}-${Date.now()}`, kind: "reply" },
      { userIds: [userId] },
    );
  } catch (e) {
    logger.warn({ err: e }, "web-push: chat reply push failed");
  }
}

/** Gerçek kullanıcı sohbet mesajı — gönderen hariç herkese (uygulama arka plandayken) */
export async function maybePushChatMessage(opts: {
  senderUserId: number;
  senderName: string;
  preview: string;
}): Promise<void> {
  try {
    const s = await getOrCreateSettings();
    if (s.pushEnabled === false || s.pushOnChatReply === false) return;
    const body = opts.preview.length > 100 ? `${opts.preview.slice(0, 100)}…` : opts.preview;
    await broadcastPush(
      {
        title: `${opts.senderName} sohbette yazdı`,
        body,
        url: "/sohbet",
        tag: "chat-message",
        kind: "chat",
      },
      { excludeUserIds: [opts.senderUserId] },
    );
  } catch (e) {
    logger.warn({ err: e }, "web-push: chat message push failed");
  }
}

export async function maybePushWelcome(userId: number, displayName: string): Promise<void> {
  try {
    const s = await getOrCreateSettings();
    if (s.pushEnabled === false) return;
    await broadcastPush(
      {
        title: "Hoş geldin!",
        body: `Merhaba ${displayName}, Özel Güvenlik ailesine katıldığın için teşekkürler. İyi eğlenceler!`,
        url: "/",
        tag: `welcome-${userId}`,
        kind: "welcome",
      },
      { userIds: [userId] },
    );
  } catch (e) {
    logger.warn({ err: e }, "web-push: welcome push failed");
  }
}

function digestDue(mode: string, last: Date | null): boolean {
  if (mode === "off" || !mode) return false;
  const now = Date.now();
  if (!last) return true;
  const ms = now - last.getTime();
  if (mode === "daily") return ms >= 24 * 60 * 60 * 1000;
  if (mode === "weekly") return ms >= 7 * 24 * 60 * 60 * 1000;
  if (mode === "monthly") return ms >= 30 * 24 * 60 * 60 * 1000;
  return false;
}

export async function runPushDigestIfDue(): Promise<void> {
  try {
    const s = await getOrCreateSettings();
    if (s.pushEnabled === false) return;
    const mode = s.pushDigestMode || "off";
    if (!digestDue(mode, s.pushDigestLastSentAt ?? null)) return;

    const since = s.pushDigestLastSentAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [row] = await db.select({ c: sql<number>`count(*)::int` })
      .from(listingsTable)
      .where(and(eq(listingsTable.isActive, true), gte(listingsTable.createdAt, since)));
    const count = Number(row?.c ?? 0);
    const label = mode === "daily" ? "Günlük" : mode === "weekly" ? "Haftalık" : "Aylık";
    await broadcastPush({
      title: `${label} özet — Özel Güvenlik`,
      body: count > 0
        ? `Son dönemde ${count} yeni ilan yayınlandı. Hemen göz atın.`
        : "Yeni ilanlar için siteyi ziyaret edin.",
      url: "/",
      tag: `digest-${mode}`,
      kind: "campaign",
      force: true,
    }, { force: true });
    await db.update(adminSettingsTable)
      .set({ pushDigestLastSentAt: new Date() })
      .where(eq(adminSettingsTable.id, s.id));
    logger.info({ mode, count }, "web-push: digest sent");
  } catch (e) {
    logger.warn({ err: e }, "web-push: digest failed");
  }
}

/** Tekrarlayan kampanyaları gönder (günlük/haftalık/aylık aynı içerik) */
export async function runScheduledCampaigns(): Promise<void> {
  try {
    await ensurePushSchema();
    const s = await getOrCreateSettings();
    if (s.pushEnabled === false) return;
    const now = new Date();
    const due = await db.select().from(pushCampaignsTable)
      .where(and(
        eq(pushCampaignsTable.isActive, true),
        lte(pushCampaignsTable.nextSendAt, now),
      ));
    for (const c of due) {
      const result = await broadcastPush({
        title: c.title,
        body: c.body,
        url: c.url ?? "/",
        tag: `campaign-sched-${c.id}-${Date.now()}`,
        kind: "campaign",
        force: true,
      }, { force: true });
      await db.update(pushCampaignsTable).set({
        sentCount: (c.sentCount ?? 0) + result.sent,
        sentAt: now,
        nextSendAt: nextSendDate(c.schedule || "daily", now),
      }).where(eq(pushCampaignsTable.id, c.id));
      logger.info({ id: c.id, sent: result.sent, schedule: c.schedule }, "web-push: scheduled campaign sent");
    }
  } catch (e) {
    logger.warn({ err: e }, "web-push: scheduled campaigns failed");
  }
}

export function startPushDigestWorker(): void {
  void ensurePushSchema().then(() => ensureVapidKeys()).catch(() => {});
  const tick = () => {
    void runPushDigestIfDue();
    void runScheduledCampaigns();
  };
  setInterval(tick, 15 * 60 * 1000);
  setTimeout(tick, 45_000);
}
