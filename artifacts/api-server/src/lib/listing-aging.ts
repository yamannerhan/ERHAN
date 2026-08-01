import { db, listingsTable, notificationsTable, listingSeoPath } from "@workspace/db";
import { and, eq, gte, lte, or, isNull } from "drizzle-orm";
import { logger } from "./logger";

const DAY_MS = 24 * 60 * 60 * 1000;

function isDirect(st: string | null | undefined): boolean {
  return st === "direct_user" || st === "direct_company" || st === "admin_created";
}

/**
 * 7. gün hatırlatma; 14. gün yenilenmeyen doğrudan → pasif.
 * Bot: 48–72h last_seen yoksa pasif (scraper ile birlikte).
 */
export async function runListingAgingPass(): Promise<{ reminded: number; deactivated: number; botsStale: number }> {
  const now = new Date();
  let reminded = 0;
  let deactivated = 0;
  let botsStale = 0;

  try {
    // 7 gün: freshness yok / last renew eski — bildirim
    const day7Start = new Date(now.getTime() - 8 * DAY_MS);
    const day7End = new Date(now.getTime() - 7 * DAY_MS);
    const dueRemind = await db
      .select()
      .from(listingsTable)
      .where(and(
        eq(listingsTable.isActive, true),
        or(
          eq(listingsTable.sourceType, "direct_user"),
          eq(listingsTable.sourceType, "direct_company"),
          eq(listingsTable.sourceType, "admin_created"),
        )!,
        gte(listingsTable.createdAt, day7Start),
        lte(listingsTable.createdAt, day7End),
      ))
      .limit(100);

    for (const l of dueRemind) {
      if (!l.authorId) continue;
      const renewed = l.lastRenewedAt ? new Date(l.lastRenewedAt).getTime() : 0;
      const freshness = l.freshnessConfirmedAt ? new Date(l.freshnessConfirmedAt).getTime() : 0;
      if (Math.max(renewed, freshness) > day7End.getTime()) continue;
      await db.insert(notificationsTable).values({
        userId: l.authorId,
        type: "listing",
        title: "İlanınızı yenileyin",
        message: `"${l.title}" 7 gündür yenilenmedi. Aktif kalsın istiyorsanız yenileyin; 14. günde pasife alınır.`,
        relatedId: l.id,
        linkUrl: listingSeoPath(l.id, l.slug),
        isRead: false,
      }).catch(() => undefined);
      reminded += 1;
    }

    // 14 gün: yenilenmeyen → is_active=false
    const day14 = new Date(now.getTime() - 14 * DAY_MS);
    const staleDirect = await db
      .select()
      .from(listingsTable)
      .where(and(
        eq(listingsTable.isActive, true),
        or(
          eq(listingsTable.sourceType, "direct_user"),
          eq(listingsTable.sourceType, "direct_company"),
          eq(listingsTable.sourceType, "admin_created"),
        )!,
        lte(listingsTable.createdAt, day14),
        or(
          isNull(listingsTable.lastRenewedAt),
          lte(listingsTable.lastRenewedAt, day14),
        )!,
        or(
          isNull(listingsTable.freshnessConfirmedAt),
          lte(listingsTable.freshnessConfirmedAt, day14),
        )!,
      ))
      .limit(200);

    for (const l of staleDirect) {
      // Yenileme veya yayın 14 gün içindeyse atla
      const lastTouch = Math.max(
        l.lastRenewedAt ? new Date(l.lastRenewedAt).getTime() : 0,
        l.freshnessConfirmedAt ? new Date(l.freshnessConfirmedAt).getTime() : 0,
        l.createdAt ? new Date(l.createdAt).getTime() : 0,
      );
      if (lastTouch > day14.getTime()) continue;
      await db.update(listingsTable)
        .set({ isActive: false, status: "inactive", updatedAt: now })
        .where(eq(listingsTable.id, l.id));
      if (l.authorId) {
        await db.insert(notificationsTable).values({
          userId: l.authorId,
          type: "listing",
          title: "İlan pasife alındı",
          message: `"${l.title}" 14 gün yenilenmediği için pasife alındı. Yenileyerek tekrar yayınlayabilirsiniz.`,
          relatedId: l.id,
          linkUrl: listingSeoPath(l.id, l.slug),
          isRead: false,
        }).catch(() => undefined);
      }
      deactivated += 1;
    }

    // Bot listings expire only through their source-date TTL; short lastSeen windows must not hide them early.

  } catch (err) {
    logger.error({ err }, "listing aging pass failed");
  }

  return { reminded, deactivated, botsStale };
}

let agingTimer: ReturnType<typeof setInterval> | null = null;

export function startListingAgingWorker(): void {
  if (agingTimer) return;
  void runListingAgingPass().then((r) => {
    if (r.reminded || r.deactivated || r.botsStale) {
      logger.info(r, "listing aging pass");
    }
  });
  agingTimer = setInterval(() => {
    void runListingAgingPass().then((r) => {
      if (r.reminded || r.deactivated || r.botsStale) logger.info(r, "listing aging pass");
    });
  }, 60 * 60 * 1000);
}
