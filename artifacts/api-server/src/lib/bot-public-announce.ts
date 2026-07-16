import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/** İlk tarama bittikten sonra kullanıcı duyurusu için bekleme */
export const BOT_PUBLIC_ANNOUNCE_GRACE_MS = 10 * 60 * 1000;

let schemaReady = false;

export async function ensureBotAnnounceSchema(): Promise<void> {
  if (schemaReady) return;
  await db.execute(sql`ALTER TABLE sources ADD COLUMN IF NOT EXISTS initial_scan_completed_at TIMESTAMPTZ`);
  // Daha önce bitmiş kaynaklar: grace geçmiş sayılsın
  await db.execute(sql`
    UPDATE sources
    SET initial_scan_completed_at = NOW() - INTERVAL '11 minutes'
    WHERE initial_scan_done = TRUE
      AND initial_scan_completed_at IS NULL
  `);
  schemaReady = true;
}

/** İlk tarama + 10 dk grace sonrası yeni ilanlar herkese (sohbet + bildirim) */
export function isBotPublicAnnounceReady(opts: {
  isInitialScan: boolean;
  initialScanDone?: boolean | null;
  initialScanCompletedAt?: Date | string | null;
}): boolean {
  if (opts.isInitialScan) return false;
  if (!opts.initialScanDone) return false;
  const raw = opts.initialScanCompletedAt;
  if (!raw) return false;
  const completed = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(completed.getTime())) return false;
  return Date.now() - completed.getTime() >= BOT_PUBLIC_ANNOUNCE_GRACE_MS;
}
