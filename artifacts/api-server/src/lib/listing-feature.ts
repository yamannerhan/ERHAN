import { db, listingsTable, usersTable, supportTicketsTable, supportMessagesTable, notificationsTable } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { emitRealtime } from "./realtime";
import { logger } from "./logger";

export const FREE_FEATURE_LIMIT = 3;
export const FREE_FEATURE_DAYS = 3;

export async function ensureFeatureSchema(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS featured_is_free BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS auto_delete_on_expiry BOOLEAN NOT NULL DEFAULT TRUE`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS free_feature_used INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {
    logger.warn({ err: e }, "feature: schema ensure failed");
  }
}

export async function getFreeFeatureRemaining(userId: number): Promise<number> {
  await ensureFeatureSchema();
  const [u] = await db.select({ used: usersTable.freeFeatureUsed }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const used = Number(u?.used ?? 0);
  return Math.max(0, FREE_FEATURE_LIMIT - used);
}

/** İlk 3 ilan için 3 gün ücretsiz öne çıkarma uygula */
export async function applyFreeFeatureIfAvailable(
  listingId: number,
  userId: number,
): Promise<{ applied: boolean; remaining: number; featuredUntil: Date | null }> {
  await ensureFeatureSchema();
  const remaining = await getFreeFeatureRemaining(userId);
  if (remaining <= 0) {
    return { applied: false, remaining: 0, featuredUntil: null };
  }

  const until = new Date(Date.now() + FREE_FEATURE_DAYS * 24 * 60 * 60 * 1000);
  await db.update(listingsTable)
    .set({
      isFeatured: true,
      featuredUntil: until,
      featuredIsFree: true,
    })
    .where(eq(listingsTable.id, listingId));

  const usedSoFar = FREE_FEATURE_LIMIT - remaining;
  await db.update(usersTable)
    .set({ freeFeatureUsed: usedSoFar + 1 })
    .where(eq(usersTable.id, userId));

  return { applied: true, remaining: remaining - 1, featuredUntil: until };
}

export async function createFeaturePurchaseTicket(opts: {
  userId: number;
  username: string;
  listingId: number;
  listingTitle: string;
}): Promise<{ ticketId: number }> {
  const subject = `Öne çıkarma satın alma — İlan #${opts.listingId}`;
  const message =
    `Merhaba, «${opts.listingTitle}» (#${opts.listingId}) ilanım için öne çıkarma satın almak istiyorum.\n\n` +
    `Ücretsiz 3 hak / 3 gün hakkımı kullandım. Lütfen ücret ve süre bilgisini paylaşın; satın almak istiyorum.`;

  const [ticket] = await db.insert(supportTicketsTable).values({
    userId: opts.userId,
    subject,
    status: "waiting",
  }).returning();

  await db.insert(supportMessagesTable).values({
    ticketId: ticket!.id,
    userId: opts.userId,
    message,
    isStaff: false,
  });

  const staff = await db.select({ id: usersTable.id }).from(usersTable)
    .where(sql`${usersTable.role} IN ('admin','moderator')`);

  if (staff.length > 0) {
    await db.insert(notificationsTable).values(
      staff.map((s) => ({
        userId: s.id,
        type: "support",
        title: "Öne çıkarma talebi",
        message: `${opts.username}: #${opts.listingId} — satın almak istiyorum`,
        relatedId: ticket!.id,
        linkUrl: "/admin",
        isRead: false,
      })),
    );
    emitRealtime("notification:new", {
      type: "support",
      title: "Öne çıkarma talebi",
      message: `${opts.username}: #${opts.listingId} — satın almak istiyorum`,
      relatedId: ticket!.id,
      linkUrl: "/admin",
      adminOnly: true,
      createdAt: new Date().toISOString(),
    });
  }

  return { ticketId: ticket!.id };
}

/** Süresi biten öne çıkarmaları kapat */
export async function expireFeaturedListings(): Promise<number> {
  await ensureFeatureSchema();
  const now = new Date();
  const expired = await db.update(listingsTable)
    .set({ isFeatured: false, featuredUntil: null })
    .where(and(
      eq(listingsTable.isFeatured, true),
      lt(listingsTable.featuredUntil, now),
    ))
    .returning({ id: listingsTable.id });
  if (expired.length > 0) {
    logger.info({ count: expired.length }, "feature: süresi dolan öne çıkarmalar kapatıldı");
  }
  return expired.length;
}

export function startFeatureExpiryWorker(): void {
  void ensureFeatureSchema();
  setInterval(() => { void expireFeaturedListings(); }, 15 * 60 * 1000);
  setTimeout(() => { void expireFeaturedListings(); }, 20_000);
}
