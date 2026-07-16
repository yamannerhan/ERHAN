import {
  db,
  listingsTable,
  sourcesTable,
  whatsappProcessedMessagesTable,
  whatsappScanJobsTable,
  whatsappSourcesTable,
} from "@workspace/db";
import { and, count, desc, eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { ensureLegacySource } from "./publisher";
import { DEFAULT_SESSION_ID } from "./types";

export async function upsertWhatsAppSource(params: {
  chatId: string;
  chatName: string;
  sessionId?: string;
  enqueueInitial?: boolean;
}): Promise<{
  source: typeof whatsappSourcesTable.$inferSelect;
  legacySourceId: number;
  created: boolean;
}> {
  const sessionId = params.sessionId ?? DEFAULT_SESSION_ID;
  const legacySourceId = await ensureLegacySource({
    chatId: params.chatId,
    chatName: params.chatName,
    sessionId,
  });

  const [existing] = await db.select()
    .from(whatsappSourcesTable)
    .where(and(
      eq(whatsappSourcesTable.sessionId, sessionId),
      eq(whatsappSourcesTable.chatId, params.chatId),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(whatsappSourcesTable)
      .set({
        chatName: params.chatName,
        isEnabled: true,
        legacySourceId,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(whatsappSourcesTable.id, existing.id))
      .returning();

    if (params.enqueueInitial !== false && updated.initialScanStatus !== "completed") {
      await enqueueScanJob("WHATSAPP_INITIAL_SCAN", updated.id);
    }
    return { source: updated, legacySourceId, created: false };
  }

  const sourceType = params.chatId.includes("@newsletter") ? "channel" : "group";
  const [created] = await db.insert(whatsappSourcesTable).values({
    sessionId,
    chatId: params.chatId,
    chatName: params.chatName,
    sourceType,
    isEnabled: true,
    initialScanStatus: "pending",
    legacySourceId,
  }).returning();

  if (params.enqueueInitial !== false) {
    await enqueueScanJob("WHATSAPP_INITIAL_SCAN", created.id);
  }

  logger.info({
    sessionId,
    sourceId: created.id,
    legacySourceId,
    chatId: params.chatId.slice(0, 8),
  }, "wa: source upserted");

  return { source: created, legacySourceId, created: true };
}

export async function enqueueScanJob(
  type: "WHATSAPP_INITIAL_SCAN" | "WHATSAPP_INCREMENTAL_SCAN" | "WHATSAPP_AD_EXPIRATION",
  sourceId?: number | null,
): Promise<number> {
  // Aynı kaynak için bekleyen aynı tip iş varsa yenisini ekleme
  if (sourceId != null) {
    const [pending] = await db.select({ id: whatsappScanJobsTable.id })
      .from(whatsappScanJobsTable)
      .where(and(
        eq(whatsappScanJobsTable.type, type),
        eq(whatsappScanJobsTable.sourceId, sourceId),
        eq(whatsappScanJobsTable.status, "PENDING"),
      ))
      .limit(1);
    if (pending) return pending.id;
  }

  const [job] = await db.insert(whatsappScanJobsTable).values({
    type,
    sourceId: sourceId ?? null,
    status: "PENDING",
  }).returning({ id: whatsappScanJobsTable.id });
  return job.id;
}

export async function listWhatsAppSourcesForAdmin(sessionId = DEFAULT_SESSION_ID) {
  const rows = await db.select()
    .from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.sessionId, sessionId))
    .orderBy(desc(whatsappSourcesTable.createdAt));

  const withCounts = await Promise.all(rows.map(async (s) => {
    const legacyId = s.legacySourceId;
    let listingCount = 0;
    let totalImported = 0;
    let lastCheckedAt: string | null = null;
    if (legacyId) {
      const [countRow] = await db.select({ c: count() })
        .from(listingsTable)
        .where(and(eq(listingsTable.sourceId, legacyId), eq(listingsTable.status, "active")));
      listingCount = Number(countRow?.c ?? 0);
      const [legacy] = await db.select({
        totalImported: sourcesTable.totalImported,
        lastCheckedAt: sourcesTable.lastCheckedAt,
      })
        .from(sourcesTable)
        .where(eq(sourcesTable.id, legacyId))
        .limit(1);
      totalImported = legacy?.totalImported ?? 0;
      lastCheckedAt = legacy?.lastCheckedAt?.toISOString() ?? null;
    }

    return {
      id: legacyId ?? s.id,
      waSourceId: s.id,
      name: s.chatName,
      url: s.chatId,
      kind: s.sourceType === "channel" ? "channel" : "group",
      active: s.isEnabled,
      checkInterval: 10,
      initialScanDone: s.initialScanStatus === "completed",
      initialScanProgress: s.initialScanStatus === "completed" ? 100
        : s.initialScanStatus === "running" ? 50
          : s.initialScanStatus === "failed" ? 0
            : 1,
      isScanning: s.initialScanStatus === "running",
      totalImported,
      listingCount,
      lastScanMessagesRead: 0,
      lastScanFound: 0,
      lastScanAdded: 0,
      lastScanDuplicates: 0,
      lastScanErrors: 0,
      lastScanPublished: 0,
      lastCheckedAt: s.latestScannedAt?.toISOString() ?? lastCheckedAt,
      lastMessageAt: s.latestScannedTimestamp
        ? new Date(s.latestScannedTimestamp * 1000).toISOString()
        : null,
      lastError: s.lastError ?? null,
      initialScanStatus: s.initialScanStatus,
    };
  }));

  const totals = withCounts.reduce(
    (acc, s) => {
      acc.groups += 1;
      acc.totalImported += s.totalImported;
      acc.listingCount += s.listingCount;
      return acc;
    },
    { groups: 0, totalImported: 0, listingCount: 0, lastAdded: 0 },
  );

  return { sources: withCounts, totals };
}

export async function disableWhatsAppSource(legacyOrWaId: number, sessionId = DEFAULT_SESSION_ID): Promise<{
  name: string;
}> {
  // Önce whatsapp_sources id, yoksa legacySourceId
  let [wa] = await db.select().from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.id, legacyOrWaId))
    .limit(1);
  if (!wa) {
    [wa] = await db.select().from(whatsappSourcesTable)
      .where(and(
        eq(whatsappSourcesTable.legacySourceId, legacyOrWaId),
        eq(whatsappSourcesTable.sessionId, sessionId),
      ))
      .limit(1);
  }
  if (!wa) {
    // Eski sources tablosu yolu
    const [legacy] = await db.select().from(sourcesTable)
      .where(and(eq(sourcesTable.id, legacyOrWaId), eq(sourcesTable.platform, "whatsapp")))
      .limit(1);
    if (!legacy) throw new Error("Kaynak bulunamadı");
    await db.delete(sourcesTable).where(eq(sourcesTable.id, legacy.id));
    return { name: legacy.name };
  }

  const name = wa.chatName;
  if (wa.legacySourceId) {
    await db.update(sourcesTable)
      .set({ active: false, isScanning: false })
      .where(eq(sourcesTable.id, wa.legacySourceId));
    await db.delete(sourcesTable).where(eq(sourcesTable.id, wa.legacySourceId));
  }
  await db.update(whatsappSourcesTable)
    .set({ isEnabled: false, updatedAt: new Date() })
    .where(eq(whatsappSourcesTable.id, wa.id));
  await db.delete(whatsappSourcesTable).where(eq(whatsappSourcesTable.id, wa.id));
  return { name };
}

/** İlanları sil, checkpoint/processed sıfırla, initial scan yeniden kuyruğa al. */
export async function resetWhatsAppSource(legacyOrWaId: number, sessionId = DEFAULT_SESSION_ID): Promise<{
  deletedListings: number;
  waSourceId: number;
}> {
  let [wa] = await db.select().from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.id, legacyOrWaId))
    .limit(1);
  if (!wa) {
    [wa] = await db.select().from(whatsappSourcesTable)
      .where(and(
        eq(whatsappSourcesTable.legacySourceId, legacyOrWaId),
        eq(whatsappSourcesTable.sessionId, sessionId),
      ))
      .limit(1);
  }
  if (!wa) throw new Error("WhatsApp kaynağı bulunamadı");

  let deletedListings = 0;
  if (wa.legacySourceId) {
    const deleted = await db.delete(listingsTable)
      .where(and(
        eq(listingsTable.sourceId, wa.legacySourceId),
        eq(listingsTable.sourceTag, "whatsapp"),
      ))
      .returning({ id: listingsTable.id });
    deletedListings = deleted.length;
  }

  await db.delete(whatsappProcessedMessagesTable)
    .where(and(
      eq(whatsappProcessedMessagesTable.sessionId, sessionId),
      eq(whatsappProcessedMessagesTable.chatId, wa.chatId),
    ));

  await db.update(whatsappSourcesTable).set({
    initialScanStatus: "pending",
    initialScanStartedAt: null,
    initialScanCompletedAt: null,
    oldestReachedAt: null,
    latestScannedMessageId: null,
    latestScannedTimestamp: null,
    latestScannedAt: null,
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(whatsappSourcesTable.id, wa.id));

  if (wa.legacySourceId) {
    await db.update(sourcesTable).set({
      initialScanDone: false,
      initialScanProgress: 1,
      lastTelegramMessageId: null,
      lastError: null,
      isScanning: false,
    }).where(eq(sourcesTable.id, wa.legacySourceId));
  }

  await enqueueScanJob("WHATSAPP_INITIAL_SCAN", wa.id);
  return { deletedListings, waSourceId: wa.id };
}

export async function resetAllWhatsAppSourcesNew(sessionId = DEFAULT_SESSION_ID): Promise<{
  deletedListings: number;
  pendingGroups: number;
}> {
  const sources = await db.select().from(whatsappSourcesTable)
    .where(and(
      eq(whatsappSourcesTable.sessionId, sessionId),
      eq(whatsappSourcesTable.isEnabled, true),
    ));

  const deleted = await db.delete(listingsTable)
    .where(eq(listingsTable.sourceTag, "whatsapp"))
    .returning({ id: listingsTable.id });

  await db.delete(whatsappProcessedMessagesTable)
    .where(eq(whatsappProcessedMessagesTable.sessionId, sessionId));

  for (const s of sources) {
    await db.update(whatsappSourcesTable).set({
      initialScanStatus: "pending",
      initialScanStartedAt: null,
      initialScanCompletedAt: null,
      oldestReachedAt: null,
      latestScannedMessageId: null,
      latestScannedTimestamp: null,
      latestScannedAt: null,
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(whatsappSourcesTable.id, s.id));
    await enqueueScanJob("WHATSAPP_INITIAL_SCAN", s.id);
  }

  return { deletedListings: deleted.length, pendingGroups: sources.length };
}

/** Eski sources (platform=whatsapp) satırlarını yeni tabloya taşı. */
export async function migrateLegacyWhatsAppSources(sessionId = DEFAULT_SESSION_ID): Promise<number> {
  const legacy = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.platform, "whatsapp"));
  let migrated = 0;
  for (const s of legacy) {
    if (!s.url) continue;
    const [exists] = await db.select({ id: whatsappSourcesTable.id })
      .from(whatsappSourcesTable)
      .where(and(
        eq(whatsappSourcesTable.sessionId, sessionId),
        eq(whatsappSourcesTable.chatId, s.url),
      ))
      .limit(1);
    if (exists) {
      await db.update(whatsappSourcesTable)
        .set({ legacySourceId: s.id, chatName: s.name, isEnabled: s.active })
        .where(eq(whatsappSourcesTable.id, exists.id));
      continue;
    }
    await db.insert(whatsappSourcesTable).values({
      sessionId,
      chatId: s.url,
      chatName: s.name,
      sourceType: s.url.includes("@newsletter") ? "channel" : "group",
      isEnabled: s.active,
      initialScanStatus: s.initialScanDone ? "completed" : "pending",
      legacySourceId: s.id,
      latestScannedTimestamp: s.lastTelegramMessageId
        ? Math.floor(Number(s.lastTelegramMessageId) / 1000) || null
        : null,
    });
    migrated += 1;
  }
  return migrated;
}
