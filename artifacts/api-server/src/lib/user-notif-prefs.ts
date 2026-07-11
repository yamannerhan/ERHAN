import { db, usersTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";

export type UserNotifPrefs = {
  notifListings: boolean;
  notifJoin: boolean;
  notifSite: boolean;
  notifOther: boolean;
  notifSound: boolean;
  /** Gerçek kullanıcı sohbet mesajı sesi */
  notifChatSound: boolean;
  /** true = push/OS bildirimi yalnızca uygulama arka plandayken */
  notifOnlyBackground: boolean;
};

export const DEFAULT_NOTIF_PREFS: UserNotifPrefs = {
  notifListings: true,
  notifJoin: true,
  notifSite: true,
  notifOther: true,
  notifSound: true,
  notifChatSound: true,
  notifOnlyBackground: true,
};

let ensured = false;

export async function ensureUserNotifPrefsSchema(): Promise<void> {
  if (ensured) return;
  try {
    const cols: Array<[string, string]> = [
      ["notif_listings", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["notif_join", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["notif_site", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["notif_other", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["notif_sound", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["notif_chat_sound", "BOOLEAN NOT NULL DEFAULT TRUE"],
      ["notif_only_background", "BOOLEAN NOT NULL DEFAULT TRUE"],
    ];
    for (const [name, type] of cols) {
      await db.execute(sql.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${name} ${type}`));
    }
    ensured = true;
  } catch (e) {
    logger.warn({ err: e }, "user-notif-prefs: schema ensure failed");
  }
}

export function prefsAllowPushKind(prefs: UserNotifPrefs, kind: string): boolean {
  if (kind === "listing") return prefs.notifListings !== false;
  if (kind === "join") return prefs.notifJoin !== false;
  if (kind === "campaign" || kind === "digest" || kind === "welcome") return prefs.notifSite !== false;
  if (kind === "reply" || kind === "chat") return prefs.notifOther !== false;
  return prefs.notifOther !== false;
}

export function prefsAllowInAppType(prefs: UserNotifPrefs, type: string): boolean {
  if (type === "listing") return prefs.notifListings !== false;
  if (type === "admin" || type === "system" || type === "welcome") return prefs.notifSite !== false;
  return prefs.notifOther !== false;
}

function mapRow(u: {
  notifListings: boolean | null;
  notifJoin: boolean | null;
  notifSite: boolean | null;
  notifOther: boolean | null;
  notifSound: boolean | null;
  notifChatSound?: boolean | null;
  notifOnlyBackground?: boolean | null;
}): UserNotifPrefs {
  return {
    notifListings: u.notifListings !== false,
    notifJoin: u.notifJoin !== false,
    notifSite: u.notifSite !== false,
    notifOther: u.notifOther !== false,
    notifSound: u.notifSound !== false,
    notifChatSound: u.notifChatSound !== false,
    notifOnlyBackground: u.notifOnlyBackground !== false,
  };
}

export async function getUserNotifPrefs(userId: number): Promise<UserNotifPrefs> {
  await ensureUserNotifPrefsSchema();
  const [u] = await db.select({
    notifListings: usersTable.notifListings,
    notifJoin: usersTable.notifJoin,
    notifSite: usersTable.notifSite,
    notifOther: usersTable.notifOther,
    notifSound: usersTable.notifSound,
    notifChatSound: usersTable.notifChatSound,
    notifOnlyBackground: usersTable.notifOnlyBackground,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) return { ...DEFAULT_NOTIF_PREFS };
  return mapRow(u);
}

export async function getNotifPrefsMap(userIds: number[]): Promise<Map<number, UserNotifPrefs>> {
  await ensureUserNotifPrefsSchema();
  const map = new Map<number, UserNotifPrefs>();
  if (!userIds.length) return map;
  const unique = [...new Set(userIds)];
  const rows = await db.select({
    id: usersTable.id,
    notifListings: usersTable.notifListings,
    notifJoin: usersTable.notifJoin,
    notifSite: usersTable.notifSite,
    notifOther: usersTable.notifOther,
    notifSound: usersTable.notifSound,
    notifChatSound: usersTable.notifChatSound,
    notifOnlyBackground: usersTable.notifOnlyBackground,
  }).from(usersTable).where(inArray(usersTable.id, unique));
  for (const u of rows) {
    map.set(u.id, mapRow(u));
  }
  return map;
}

export async function updateUserNotifPrefs(
  userId: number,
  patch: Partial<UserNotifPrefs>,
): Promise<UserNotifPrefs> {
  await ensureUserNotifPrefsSchema();
  const updates: Partial<UserNotifPrefs> = {};
  (Object.keys(DEFAULT_NOTIF_PREFS) as Array<keyof UserNotifPrefs>).forEach((key) => {
    if (patch[key] !== undefined) updates[key] = Boolean(patch[key]);
  });
  if (Object.keys(updates).length) {
    await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));
  }
  return getUserNotifPrefs(userId);
}
