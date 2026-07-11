import webpush from "web-push";
import { db, adminSettingsTable, pushSubscriptionsTable, listingsTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
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
  /** listing | join | reply | campaign | digest */
  kind?: string;
  soundUrl?: string | null;
  icon?: string | null;
  badge?: string | null;
};

let ensured = false;

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

export async function broadcastPush(payload: PushPayload, opts?: { userIds?: number[] }): Promise<{ sent: number; total: number }> {
  await ensureVapidKeys();
  const s = await getOrCreateSettings();
  if (s.pushEnabled === false) return { sent: 0, total: 0 };

  const adminSoundOn = s.pushSoundEnabled !== false && payload.sound !== false;
  const kind = payload.kind || "campaign";
  const baseSoundUrl =
    payload.soundUrl
    ?? (kind === "listing" ? s.pushSoundListingUrl
      : kind === "join" ? s.pushSoundJoinUrl
      : kind === "reply" ? s.pushSoundReplyUrl
      : s.pushSoundCampaignUrl)
    ?? null;

  let subs = await db.select().from(pushSubscriptionsTable);
  if (opts?.userIds?.length) {
    const set = new Set(opts.userIds);
    subs = subs.filter((x) => x.userId != null && set.has(x.userId));
  }

  const userIds = subs.map((x) => x.userId).filter((id): id is number => id != null);
  const prefsMap = await getNotifPrefsMap(userIds);

  let sent = 0;
  let eligible = 0;
  for (const sub of subs) {
    const prefs = sub.userId != null
      ? (prefsMap.get(sub.userId) ?? DEFAULT_NOTIF_PREFS)
      : DEFAULT_NOTIF_PREFS;

    // Giriş yapmış kullanıcı tercihi kapalıysa gönderme
    if (sub.userId != null && !prefsAllowPushKind(prefs, kind)) continue;

    // Uygulama öndeyse (ekran açık) ve tercih açıksa push gönderme
    if (
      sub.userId != null
      && prefs.notifOnlyBackground !== false
      && isUserForeground(sub.userId)
    ) {
      continue;
    }
    eligible++;

    const sound = adminSoundOn && prefs.notifSound !== false;
    const full: PushPayload = {
      ...payload,
      kind,
      sound,
      soundUrl: sound ? baseSoundUrl : null,
      icon: payload.icon || "/notification-icon.png",
      badge: payload.badge || "/notification-badge.png",
    };
    if (await sendToSub(sub, full)) sent++;
  }
  return { sent, total: eligible };
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

export async function maybePushUserJoin(displayName: string): Promise<void> {
  try {
    const s = await getOrCreateSettings();
    if (s.pushEnabled === false || s.pushOnUserJoin === false) return;
    await broadcastPush({
      title: "Yeni üye sohbete katıldı",
      body: `${displayName} aramıza katıldı`,
      url: "/sohbet",
      tag: `join-${Date.now()}`,
      kind: "join",
    });
  } catch (e) {
    logger.warn({ err: e }, "web-push: join push failed");
  }
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
    });
    await db.update(adminSettingsTable)
      .set({ pushDigestLastSentAt: new Date() })
      .where(eq(adminSettingsTable.id, s.id));
    logger.info({ mode, count }, "web-push: digest sent");
  } catch (e) {
    logger.warn({ err: e }, "web-push: digest failed");
  }
}

export function startPushDigestWorker(): void {
  void ensurePushSchema().then(() => ensureVapidKeys()).catch(() => {});
  setInterval(() => { void runPushDigestIfDue(); }, 30 * 60 * 1000);
  setTimeout(() => { void runPushDigestIfDue(); }, 45_000);
}
