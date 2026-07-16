import {
  db,
  listingsTable,
  sourcesTable,
  whatsappProcessedMessagesTable,
  whatsappScanJobsTable,
  whatsappSessionsTable,
  whatsappSourcesTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, inArray, lte, isNull, or, sql } from "drizzle-orm";
import { SESSION_ID } from "./whatsapp.types";

export async function persistSessionMeta(params: {
  sessionId: string;
  status: string;
  connectionMode: string | null;
  phoneMasked: string | null;
  lastError: string | null;
  clientInstanceId: string | null;
  readyAt: Date | null;
}): Promise<void> {
  await db.insert(whatsappSessionsTable).values({
    id: params.sessionId,
    status: params.status,
    connectionMode: params.connectionMode,
    phoneMasked: params.phoneMasked,
    lastError: params.lastError,
    clientInstanceId: params.clientInstanceId,
    readyAt: params.readyAt,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: whatsappSessionsTable.id,
    set: {
      status: params.status,
      connectionMode: params.connectionMode,
      phoneMasked: params.phoneMasked,
      lastError: params.lastError,
      clientInstanceId: params.clientInstanceId,
      readyAt: params.readyAt,
      updatedAt: new Date(),
    },
  });
}

export async function ensureLegacySource(chatId: string, chatName: string): Promise<number> {
  const [existing] = await db.select()
    .from(sourcesTable)
    .where(and(eq(sourcesTable.platform, "whatsapp"), eq(sourcesTable.url, chatId)))
    .limit(1);
  if (existing) {
    await db.update(sourcesTable)
      .set({ name: chatName, active: true, status: "active" })
      .where(eq(sourcesTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(sourcesTable).values({
    name: chatName,
    platform: "whatsapp",
    url: chatId,
    active: true,
    status: "active",
    autoPublish: true,
    requireApproval: false,
    checkInterval: 10,
  }).returning();
  return created.id;
}

export async function upsertSource(params: {
  chatId: string;
  chatName: string;
  sessionId?: string;
  enqueueInitial?: boolean;
}): Promise<{ source: typeof whatsappSourcesTable.$inferSelect; legacySourceId: number; created: boolean }> {
  const sessionId = params.sessionId ?? SESSION_ID;
  const legacySourceId = await ensureLegacySource(params.chatId, params.chatName);

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
      await enqueueJob("WHATSAPP_INITIAL_SCAN", updated.id);
    }
    return { source: updated, legacySourceId, created: false };
  }

  const [created] = await db.insert(whatsappSourcesTable).values({
    sessionId,
    chatId: params.chatId,
    chatName: params.chatName,
    sourceType: params.chatId.includes("@newsletter") ? "channel" : "group",
    isEnabled: true,
    initialScanStatus: "pending",
    legacySourceId,
  }).returning();

  if (params.enqueueInitial !== false) {
    await enqueueJob("WHATSAPP_INITIAL_SCAN", created.id);
  }
  return { source: created, legacySourceId, created: true };
}

export async function enqueueJob(
  type: "WHATSAPP_INITIAL_SCAN" | "WHATSAPP_INCREMENTAL_SCAN" | "WHATSAPP_AD_EXPIRATION",
  sourceId?: number | null,
): Promise<number> {
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

export async function claimNextJob() {
  const [job] = await db.select()
    .from(whatsappScanJobsTable)
    .where(inArray(whatsappScanJobsTable.status, ["PENDING", "RETRYING"]))
    .orderBy(asc(whatsappScanJobsTable.id))
    .limit(1);
  if (!job) return null;

  const [claimed] = await db.update(whatsappScanJobsTable)
    .set({
      status: "RUNNING",
      attempts: job.attempts + 1,
      startedAt: new Date(),
      error: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(whatsappScanJobsTable.id, job.id),
      inArray(whatsappScanJobsTable.status, ["PENDING", "RETRYING"]),
    ))
    .returning();
  return claimed ?? null;
}

export async function completeJob(id: number): Promise<void> {
  await db.update(whatsappScanJobsTable).set({
    status: "COMPLETED",
    completedAt: new Date(),
    error: null,
    updatedAt: new Date(),
  }).where(eq(whatsappScanJobsTable.id, id));
}

export async function failJob(id: number, attempts: number, error: string, maxAttempts = 3): Promise<void> {
  const retry = attempts < maxAttempts;
  await db.update(whatsappScanJobsTable).set({
    status: retry ? "RETRYING" : "FAILED",
    error: error.slice(0, 500),
    completedAt: retry ? null : new Date(),
    updatedAt: new Date(),
  }).where(eq(whatsappScanJobsTable.id, id));
}

export async function getSourceById(id: number) {
  const [row] = await db.select().from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.id, id)).limit(1);
  return row ?? null;
}

export async function listEnabledSources(sessionId = SESSION_ID) {
  return db.select().from(whatsappSourcesTable)
    .where(and(
      eq(whatsappSourcesTable.sessionId, sessionId),
      eq(whatsappSourcesTable.isEnabled, true),
    ));
}

export async function listSourcesForAdmin(sessionId = SESSION_ID) {
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
        lastScanMessagesRead: sourcesTable.lastScanMessagesRead,
        lastScanFound: sourcesTable.lastScanFound,
        lastScanAdded: sourcesTable.lastScanAdded,
        lastScanDuplicates: sourcesTable.lastScanDuplicates,
        lastScanErrors: sourcesTable.lastScanErrors,
        lastScanPublished: sourcesTable.lastScanPublished,
      }).from(sourcesTable).where(eq(sourcesTable.id, legacyId)).limit(1);
      totalImported = legacy?.totalImported ?? 0;
      lastCheckedAt = legacy?.lastCheckedAt?.toISOString() ?? null;
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
            : s.initialScanStatus === "failed" ? 0 : 1,
        isScanning: s.initialScanStatus === "running",
        totalImported,
        listingCount,
        lastScanMessagesRead: legacy?.lastScanMessagesRead ?? 0,
        lastScanFound: legacy?.lastScanFound ?? 0,
        lastScanAdded: legacy?.lastScanAdded ?? 0,
        lastScanDuplicates: legacy?.lastScanDuplicates ?? 0,
        lastScanErrors: legacy?.lastScanErrors ?? 0,
        lastScanPublished: legacy?.lastScanPublished ?? 0,
        lastCheckedAt: s.latestScannedAt?.toISOString() ?? lastCheckedAt,
        lastMessageAt: s.latestScannedTimestamp
          ? new Date(s.latestScannedTimestamp * 1000).toISOString()
          : null,
        lastError: s.lastError ?? null,
        initialScanStatus: s.initialScanStatus,
      };
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
          : s.initialScanStatus === "failed" ? 0 : 1,
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

export async function findSourceByLegacyOrId(legacyOrWaId: number, sessionId = SESSION_ID) {
  let [wa] = await db.select().from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.id, legacyOrWaId)).limit(1);
  if (!wa) {
    [wa] = await db.select().from(whatsappSourcesTable)
      .where(and(
        eq(whatsappSourcesTable.legacySourceId, legacyOrWaId),
        eq(whatsappSourcesTable.sessionId, sessionId),
      )).limit(1);
  }
  return wa ?? null;
}

export async function disableSource(legacyOrWaId: number, sessionId = SESSION_ID) {
  const wa = await findSourceByLegacyOrId(legacyOrWaId, sessionId);
  if (!wa) {
    const [legacy] = await db.select().from(sourcesTable)
      .where(and(eq(sourcesTable.id, legacyOrWaId), eq(sourcesTable.platform, "whatsapp")))
      .limit(1);
    if (!legacy) throw new Error("Kaynak bulunamadı");
    await db.delete(sourcesTable).where(eq(sourcesTable.id, legacy.id));
    return { name: legacy.name };
  }
  const name = wa.chatName;
  if (wa.legacySourceId) {
    await db.delete(sourcesTable).where(eq(sourcesTable.id, wa.legacySourceId));
  }
  await db.delete(whatsappSourcesTable).where(eq(whatsappSourcesTable.id, wa.id));
  return { name };
}

export async function resetSource(legacyOrWaId: number, sessionId = SESSION_ID) {
  const wa = await findSourceByLegacyOrId(legacyOrWaId, sessionId);
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

  await enqueueJob("WHATSAPP_INITIAL_SCAN", wa.id);
  return { deletedListings, waSourceId: wa.id };
}

export async function resetAllSources(sessionId = SESSION_ID) {
  const sources = await listEnabledSources(sessionId);
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
    await enqueueJob("WHATSAPP_INITIAL_SCAN", s.id);
  }
  return { deletedListings: deleted.length, pendingGroups: sources.length };
}

export async function advanceCheckpoint(sourceId: number, messageId: string, timestampSec: number) {
  await db.update(whatsappSourcesTable).set({
    latestScannedMessageId: messageId,
    latestScannedTimestamp: timestampSec,
    latestScannedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(whatsappSourcesTable.id, sourceId));
}

export async function markProcessed(params: {
  sessionId: string;
  chatId: string;
  messageId: string;
  timestampSec: number;
  result: string;
  contentHash: string | null;
  jobPostingId: number | null;
}) {
  await db.insert(whatsappProcessedMessagesTable).values({
    sessionId: params.sessionId,
    chatId: params.chatId,
    messageId: params.messageId,
    messageTimestamp: params.timestampSec,
    result: params.result,
    jobPostingId: params.jobPostingId,
    contentHash: params.contentHash,
  }).onConflictDoNothing();
}

export async function isMessageProcessed(sessionId: string, chatId: string, messageId: string) {
  const [row] = await db.select({ id: whatsappProcessedMessagesTable.id })
    .from(whatsappProcessedMessagesTable)
    .where(and(
      eq(whatsappProcessedMessagesTable.sessionId, sessionId),
      eq(whatsappProcessedMessagesTable.chatId, chatId),
      eq(whatsappProcessedMessagesTable.messageId, messageId),
    ))
    .limit(1);
  return Boolean(row);
}

export async function syncLegacyScanMeta(waSourceId: number, stats: {
  messagesRead: number;
  published: number;
  duplicates: number;
  errors: number;
}) {
  const wa = await getSourceById(waSourceId);
  if (!wa?.legacySourceId) return;
  await db.update(sourcesTable).set({
    lastCheckedAt: new Date(),
    lastScanMessagesRead: stats.messagesRead,
    lastScanFound: stats.published + stats.duplicates,
    lastScanAdded: stats.published,
    lastScanDuplicates: stats.duplicates,
    lastScanErrors: stats.errors,
    lastScanPublished: stats.published,
    totalImported: sql`${sourcesTable.totalImported} + ${stats.published}`,
    initialScanDone: wa.initialScanStatus === "completed",
    isScanning: false,
    lastError: wa.lastError,
    lastTelegramMessageId: wa.latestScannedTimestamp
      ? String(wa.latestScannedTimestamp * 1000)
      : undefined,
  }).where(eq(sourcesTable.id, wa.legacySourceId));
}

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
  return expired.length;
}

export async function migrateLegacySources(sessionId = SESSION_ID): Promise<number> {
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

export async function enqueuePendingInitialScans(sessionId = SESSION_ID): Promise<number> {
  const sources = await db.select({ id: whatsappSourcesTable.id })
    .from(whatsappSourcesTable)
    .where(and(
      eq(whatsappSourcesTable.sessionId, sessionId),
      eq(whatsappSourcesTable.isEnabled, true),
      inArray(whatsappSourcesTable.initialScanStatus, ["pending", "failed"]),
    ));
  for (const s of sources) await enqueueJob("WHATSAPP_INITIAL_SCAN", s.id);
  return sources.length;
}

export async function enqueueIncrementalScans(sessionId = SESSION_ID): Promise<number> {
  const sources = await db.select({ id: whatsappSourcesTable.id })
    .from(whatsappSourcesTable)
    .where(and(
      eq(whatsappSourcesTable.sessionId, sessionId),
      eq(whatsappSourcesTable.isEnabled, true),
      eq(whatsappSourcesTable.initialScanStatus, "completed"),
    ));
  for (const s of sources) await enqueueJob("WHATSAPP_INCREMENTAL_SCAN", s.id);
  return sources.length;
}
