import {
  db,
  sourcesTable,
  whatsappScanJobsTable,
  whatsappSourcesTable,
} from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { WhatsAppClientManager } from "./manager";
import { runInitialScan, runIncrementalScan } from "./scanner";
import { expireWhatsAppListings } from "./expiration";
import { enqueueScanJob } from "./sources-service";
import { DEFAULT_SESSION_ID } from "./types";

const MAX_ATTEMPTS = 3;
let processing = false;

export function isWhatsAppJobWorkerBusy(): boolean {
  return processing;
}

async function claimNextJob(): Promise<typeof whatsappScanJobsTable.$inferSelect | null> {
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

async function completeJob(id: number): Promise<void> {
  await db.update(whatsappScanJobsTable).set({
    status: "COMPLETED",
    completedAt: new Date(),
    error: null,
    updatedAt: new Date(),
  }).where(eq(whatsappScanJobsTable.id, id));
}

async function failJob(id: number, attempts: number, error: string): Promise<void> {
  const retry = attempts < MAX_ATTEMPTS;
  await db.update(whatsappScanJobsTable).set({
    status: retry ? "RETRYING" : "FAILED",
    error: error.slice(0, 500),
    completedAt: retry ? null : new Date(),
    updatedAt: new Date(),
  }).where(eq(whatsappScanJobsTable.id, id));
}

async function syncLegacyScanMeta(waSourceId: number, stats: {
  messagesRead: number;
  published: number;
  duplicates: number;
  errors: number;
}): Promise<void> {
  const [wa] = await db.select().from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.id, waSourceId))
    .limit(1);
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

async function processJob(job: typeof whatsappScanJobsTable.$inferSelect): Promise<void> {
  if (job.type === "WHATSAPP_AD_EXPIRATION") {
    const n = await expireWhatsAppListings();
    logger.info({ jobId: job.id, expired: n, operation: "ad_expiration" }, "wa: expiration job done");
    return;
  }

  if (!WhatsAppClientManager.isReady(DEFAULT_SESSION_ID)) {
    throw new Error("WhatsApp henüz hazır değil");
  }

  if (job.sourceId == null) {
    throw new Error("sourceId gerekli");
  }

  if (job.type === "WHATSAPP_INITIAL_SCAN") {
    const stats = await runInitialScan(job.sourceId);
    await syncLegacyScanMeta(job.sourceId, stats);
    return;
  }

  if (job.type === "WHATSAPP_INCREMENTAL_SCAN") {
    const stats = await runIncrementalScan(job.sourceId);
    await syncLegacyScanMeta(job.sourceId, stats);
    return;
  }

  throw new Error(`Bilinmeyen job tipi: ${job.type}`);
}

/** Tek tur: en fazla bir job işle. */
export async function processNextWhatsAppJob(): Promise<boolean> {
  if (processing) return false;
  processing = true;
  try {
    const job = await claimNextJob();
    if (!job) return false;
    try {
      await processJob(job);
      await completeJob(job.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failJob(job.id, job.attempts, msg);
      logger.warn({ err, jobId: job.id, type: job.type }, "wa: job failed");
    }
    return true;
  } finally {
    processing = false;
  }
}

/** Kuyruk boşalana veya limit'e kadar işle. */
export async function drainWhatsAppJobs(limit = 20): Promise<number> {
  let n = 0;
  while (n < limit) {
    const did = await processNextWhatsAppJob();
    if (!did) break;
    n += 1;
  }
  return n;
}

/** Tüm enabled kaynaklar için incremental job ekle. */
export async function enqueueIncrementalScans(sessionId = DEFAULT_SESSION_ID): Promise<number> {
  const sources = await db.select({ id: whatsappSourcesTable.id })
    .from(whatsappSourcesTable)
    .where(and(
      eq(whatsappSourcesTable.sessionId, sessionId),
      eq(whatsappSourcesTable.isEnabled, true),
      eq(whatsappSourcesTable.initialScanStatus, "completed"),
    ));
  for (const s of sources) {
    await enqueueScanJob("WHATSAPP_INCREMENTAL_SCAN", s.id);
  }
  return sources.length;
}

/** Pending initial scan'leri kuyruğa al. */
export async function enqueuePendingInitialScans(sessionId = DEFAULT_SESSION_ID): Promise<number> {
  const sources = await db.select({ id: whatsappSourcesTable.id })
    .from(whatsappSourcesTable)
    .where(and(
      eq(whatsappSourcesTable.sessionId, sessionId),
      eq(whatsappSourcesTable.isEnabled, true),
      inArray(whatsappSourcesTable.initialScanStatus, ["pending", "failed"]),
    ));
  for (const s of sources) {
    await enqueueScanJob("WHATSAPP_INITIAL_SCAN", s.id);
  }
  return sources.length;
}

export async function triggerWhatsAppScanNow(): Promise<{
  ready: boolean;
  queued: boolean;
  scanned: number;
  mode: "initial" | "incremental";
  pendingGroups: number;
  currentGroup: string | null;
  results: Array<{ id: number; name: string; added: number; duplicates: number; messagesRead: number; found: number }>;
}> {
  if (!WhatsAppClientManager.isReady()) {
    return {
      ready: false,
      queued: false,
      scanned: 0,
      mode: "incremental",
      pendingGroups: 0,
      currentGroup: null,
      results: [],
    };
  }

  const pendingInitial = await enqueuePendingInitialScans();
  let pendingGroups = pendingInitial;
  let mode: "initial" | "incremental" = "incremental";
  if (pendingInitial > 0) {
    mode = "initial";
  } else {
    pendingGroups = await enqueueIncrementalScans();
  }

  const scanned = await drainWhatsAppJobs(5);
  const [running] = await db.select()
    .from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.initialScanStatus, "running"))
    .limit(1);

  return {
    ready: true,
    queued: pendingGroups > 0,
    scanned,
    mode,
    pendingGroups,
    currentGroup: running?.chatName ?? null,
    results: [],
  };
}
