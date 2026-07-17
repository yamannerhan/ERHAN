import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let schemaReady = false;

export async function ensureBotAnnounceSchema(): Promise<void> {
  if (schemaReady) return;
  await db.execute(sql`ALTER TABLE sources ADD COLUMN IF NOT EXISTS initial_scan_completed_at TIMESTAMPTZ`);
  // Daha önce bitmiş kaynaklar: tamamlanmış sayılsın
  await db.execute(sql`
    UPDATE sources
    SET initial_scan_completed_at = COALESCE(initial_scan_completed_at, NOW() - INTERVAL '1 minute')
    WHERE initial_scan_done = TRUE
      AND initial_scan_completed_at IS NULL
  `);
  schemaReady = true;
}

/**
 * Kullanıcıya (sohbet + bildirim + push) ilan duyurusu gidebilir mi?
 * İlk tarama / sıfırlama süresince ASLA hayır.
 * Tarama bitince (initialScanDone) gelen yeni ilanlar evet.
 */
export function canAnnounceListingToUsers(opts: {
  isInitialScan?: boolean;
  initialScanDone?: boolean | null;
}): boolean {
  if (opts.isInitialScan) return false;
  if (!opts.initialScanDone) return false;
  return true;
}

/** @deprecated use canAnnounceListingToUsers — grace kaldırıldı (bitince hemen yeni ilan) */
export const BOT_PUBLIC_ANNOUNCE_GRACE_MS = 0;

/** @deprecated use canAnnounceListingToUsers */
export function isBotPublicAnnounceReady(opts: {
  isInitialScan: boolean;
  initialScanDone?: boolean | null;
  initialScanCompletedAt?: Date | string | null;
}): boolean {
  return canAnnounceListingToUsers({
    isInitialScan: opts.isInitialScan,
    initialScanDone: opts.initialScanDone,
  });
}
