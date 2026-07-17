import { db, sourcesTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

let schemaReady = false;

export async function ensureBotAnnounceSchema(): Promise<void> {
  if (schemaReady) return;
  await db.execute(sql`ALTER TABLE sources ADD COLUMN IF NOT EXISTS initial_scan_completed_at TIMESTAMPTZ`);
  await db.execute(sql`
    UPDATE sources
    SET initial_scan_completed_at = COALESCE(initial_scan_completed_at, NOW() - INTERVAL '1 minute')
    WHERE initial_scan_done = TRUE
      AND initial_scan_completed_at IS NULL
  `);
  schemaReady = true;
}

/**
 * Tek kaynak için: ilk tarama bitmeden kullanıcıya duyuru yok.
 */
export function canAnnounceListingToUsers(opts: {
  isInitialScan?: boolean;
  initialScanDone?: boolean | null;
}): boolean {
  if (opts.isInitialScan) return false;
  if (!opts.initialScanDone) return false;
  return true;
}

/**
 * Herhangi bir bot (TG / Link / Eleman / WA) ilk taramadaysa
 * TÜM kullanıcı ilan bildirimleri susturulur.
 * Sıfırla & yeniden tara bitene kadar bildirim gitmez.
 */
export async function isUserListingAnnounceGloballyMuted(): Promise<boolean> {
  await ensureBotAnnounceSchema();

  const [pendingSource] = await db.select({ id: sourcesTable.id })
    .from(sourcesTable)
    .where(and(
      eq(sourcesTable.active, true),
      inArray(sourcesTable.platform, ["telegram", "url_pool", "eleman", "whatsapp"]),
      eq(sourcesTable.initialScanDone, false),
    ))
    .limit(1);
  if (pendingSource) return true;

  try {
    const wa = await db.execute(sql`
      SELECT id FROM whatsapp_sources
      WHERE is_enabled = true
        AND COALESCE(initial_scan_status, 'pending') <> 'completed'
      LIMIT 1
    `);
    const rows = (wa as { rows?: unknown[] }).rows ?? [];
    if (rows.length > 0) return true;
  } catch {
    // WA tablosu yoksa yok say
  }

  return false;
}

/** @deprecated */
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
