import { db, notificationsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

let ran = false;

export async function wipeAllNotificationsOnce(): Promise<void> {
  if (ran) return;
  ran = true;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS app_one_shot (
        key TEXT PRIMARY KEY,
        done_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // INSERT başarılıysa ilk kez çalışıyoruz → tüm bildirimleri sil
    const inserted = await db.execute(sql`
      INSERT INTO app_one_shot (key) VALUES ('wipe_notifications_v2026_07_16')
      ON CONFLICT (key) DO NOTHING
      RETURNING key
    `) as { rows?: unknown[] };
    if (!(inserted.rows?.length)) return;

    await db.delete(notificationsTable);
    logger.info("notifications: tüm kullanıcı bildirimleri sıfırlandı (tek seferlik)");
  } catch (err) {
    logger.warn({ err }, "notifications wipe once failed");
  }
}

/** Admin: herkesi temizle (tekrarlanabilir) */
export async function wipeAllNotificationsNow(): Promise<number> {
  const deleted = await db.delete(notificationsTable).returning({ id: notificationsTable.id });
  return deleted.length;
}
