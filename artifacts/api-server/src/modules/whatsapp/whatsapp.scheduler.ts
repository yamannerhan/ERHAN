import { db, whatsappSourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { runInitialScan } from "./whatsapp.history.service";
import { runIncrementalScan } from "./whatsapp.incremental.service";
import { WhatsAppManager } from "./whatsapp.manager";
import {
  claimNextJob,
  completeJob,
  enqueueIncrementalScans,
  enqueueJob,
  enqueuePendingInitialScans,
  expireWhatsAppListings,
  failJob,
  migrateLegacySources,
  syncLegacyScanMeta,
} from "./whatsapp.repository";
import { SCAN_INTERVAL_MS } from "./whatsapp.types";

const JOB_TICK_MS = 15_000;
const EXPIRATION_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const handles = new Set<ReturnType<typeof setInterval>>();
let started = false;
let processing = false;

async function processJob(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>): Promise<void> {
  if (job.type === "WHATSAPP_AD_EXPIRATION") {
    const n = await expireWhatsAppListings();
    logger.info({ jobId: job.id, expired: n }, "wa: expiration done");
    return;
  }
  if (!WhatsAppManager.isReady()) throw new Error("WhatsApp henüz hazır değil");
  if (job.sourceId == null) throw new Error("sourceId gerekli");

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

export async function processNextJob(): Promise<boolean> {
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
      await failJob(job.id, job.attempts, msg, MAX_ATTEMPTS);
      logger.warn({ err, jobId: job.id, type: job.type }, "wa: job failed");
    }
    return true;
  } finally {
    processing = false;
  }
}

export async function drainJobs(limit = 20): Promise<number> {
  let n = 0;
  while (n < limit) {
    const did = await processNextJob();
    if (!did) break;
    n += 1;
  }
  return n;
}

export async function triggerScanNow() {
  if (!WhatsAppManager.isReady()) {
    return {
      ready: false as const,
      queued: false,
      scanned: 0,
      mode: "incremental" as const,
      pendingGroups: 0,
      currentGroup: null as string | null,
      results: [] as Array<{ id: number; name: string; added: number; duplicates: number; messagesRead: number; found: number }>,
    };
  }

  const pendingInitial = await enqueuePendingInitialScans();
  let pendingGroups = pendingInitial;
  let mode: "initial" | "incremental" = "incremental";
  if (pendingInitial > 0) mode = "initial";
  else pendingGroups = await enqueueIncrementalScans();

  const scanned = await drainJobs(5);
  const [running] = await db.select()
    .from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.initialScanStatus, "running"))
    .limit(1);

  return {
    ready: true as const,
    queued: pendingGroups > 0,
    scanned,
    mode,
    pendingGroups,
    currentGroup: running?.chatName ?? null,
    results: [] as Array<{ id: number; name: string; added: number; duplicates: number; messagesRead: number; found: number }>,
  };
}

export function kickDeepScan(): void {
  void (async () => {
    await enqueuePendingInitialScans();
    await drainJobs(2);
  })().catch(() => undefined);
}

/**
 * Bağlantı CONNECTED olduğunda çağrılmaz.
 * İlan taraması yalnızca grup kaydı / Şimdi Tara / zamanlayıcı ile başlar.
 */
export function onWhatsAppReady(): void {
  logger.info("wa: scan hook skipped on connect — wait for manual group selection");
}

export function startWhatsAppScheduler(): void {
  if (started) return;
  started = true;

  void migrateLegacySources()
    .then((n) => { if (n > 0) logger.info({ migrated: n }, "wa: legacy sources migrated"); })
    .catch((err) => logger.warn({ err }, "wa: legacy migrate skipped"));

  // Job drain — 15 sn
  handles.add(setInterval(() => {
    if (!WhatsAppManager.isReady()) return;
    void drainJobs(3).catch((err) => logger.warn({ err }, "wa: job drain error"));
  }, JOB_TICK_MS));

  // */10 — incremental + pending initial (10 dk)
  handles.add(setInterval(() => {
    if (!WhatsAppManager.isReady()) return;
    void (async () => {
      await enqueuePendingInitialScans();
      await enqueueIncrementalScans();
    })().catch((err) => logger.warn({ err }, "wa: incremental enqueue error"));
  }, SCAN_INTERVAL_MS));

  // Saatlik expire
  handles.add(setInterval(() => {
    void enqueueJob("WHATSAPP_AD_EXPIRATION").then(() => drainJobs(1));
  }, EXPIRATION_MS));

  logger.info({
    jobTickMs: JOB_TICK_MS,
    scanIntervalMs: SCAN_INTERVAL_MS,
    expirationMs: EXPIRATION_MS,
  }, "wa: scheduler started");
}

export function stopWhatsAppScheduler(): void {
  for (const h of handles) clearInterval(h);
  handles.clear();
  started = false;
}
