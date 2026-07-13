import { db, adminSettingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

let columnsReady = false;

/** spam_night_enabled / spam_day_enabled kolonlarını güvenli ekle */
export async function ensureSpamScheduleColumns(): Promise<void> {
  if (columnsReady) return;
  try {
    await db.execute(sql`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS spam_night_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
    await db.execute(sql`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS spam_day_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    columnsReady = true;
  } catch (e) {
    console.error("[spam-schedule] column ensure failed:", e);
  }
}

/** Türkiye (Europe/Istanbul) saatinde şu anki saat 0–23 */
export function turkeyHourNow(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  return Math.min(23, Math.max(0, parseInt(h ?? "0", 10) || 0));
}

/** 00:00–05:59 gece, 06:00–23:59 gündüz (TR) */
export function isTurkeyNight(d = new Date()): boolean {
  const h = turkeyHourNow(d);
  return h >= 0 && h < 6;
}

type SpamSettings = {
  spamCooldown?: number | null;
  spamNightEnabled?: boolean | null;
  spamDayEnabled?: boolean | null;
};

/**
 * Admin/mod hariç üyeler için etkili spam bekleme süresi (saniye).
 * Gece: spamNightEnabled (varsayılan true) → cooldown
 * Gündüz: spamDayEnabled (varsayılan false) → cooldown
 */
export function effectiveSpamCooldownSeconds(settings: SpamSettings | null | undefined): number {
  const cooldown = Math.max(0, settings?.spamCooldown ?? 3);
  if (cooldown <= 0) return 0;
  const night = isTurkeyNight();
  if (night) {
    return settings?.spamNightEnabled !== false ? cooldown : 0;
  }
  return settings?.spamDayEnabled === true ? cooldown : 0;
}

export async function loadSpamSettings(): Promise<{
  spamCooldown: number;
  spamNightEnabled: boolean;
  spamDayEnabled: boolean;
  chatLocked: boolean;
}> {
  await ensureSpamScheduleColumns();
  const [row] = await db.select().from(adminSettingsTable).limit(1);
  return {
    spamCooldown: row?.spamCooldown ?? 3,
    spamNightEnabled: row?.spamNightEnabled !== false,
    spamDayEnabled: row?.spamDayEnabled === true,
    chatLocked: row?.chatLocked ?? false,
  };
}
