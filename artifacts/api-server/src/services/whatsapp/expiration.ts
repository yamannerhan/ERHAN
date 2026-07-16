import { db, listingsTable } from "@workspace/db";
import { and, eq, lte, isNull, or } from "drizzle-orm";
import { logger } from "../../lib/logger";

/**
 * Süresi dolmuş WhatsApp ilanlarını pasifleştir.
 * expires_at <= now AND source_tag = whatsapp AND auto_delete_on_expiry.
 */
export async function expireWhatsAppListings(now = new Date()): Promise<number> {
  const expired = await db.update(listingsTable)
    .set({
      status: "expired",
      isActive: false,
      expiredAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(listingsTable.sourceTag, "whatsapp"),
      eq(listingsTable.isActive, true),
      eq(listingsTable.autoDeleteOnExpiry, true),
      lte(listingsTable.expiresAt, now),
      or(isNull(listingsTable.expiredAt), eq(listingsTable.status, "active")),
    ))
    .returning({ id: listingsTable.id });

  if (expired.length > 0) {
    logger.info({ count: expired.length, operation: "wa_ad_expiration" }, "wa: expired listings");
  }
  return expired.length;
}
