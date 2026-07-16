import { logger } from "../../lib/logger";
import {
  drainWhatsAppJobs,
  enqueueIncrementalScans,
  enqueuePendingInitialScans,
} from "./jobs";
import { enqueueScanJob, migrateLegacyWhatsAppSources } from "./sources-service";
import { WhatsAppClientManager } from "./manager";
import { INCREMENTAL_CRON_MS } from "./types";

const handles = new Set<ReturnType<typeof setInterval>>();
let started = false;

const JOB_TICK_MS = 15_000;
const EXPIRATION_CRON_MS = 60 * 60 * 1000;

export function startWhatsAppScheduler(): void {
  if (started) return;
  started = true;

  void (async () => {
    try {
      const n = await migrateLegacyWhatsAppSources();
      if (n > 0) logger.info({ migrated: n }, "wa: legacy sources migrated");
    } catch (err) {
      logger.warn({ err }, "wa: legacy source migrate skipped");
    }
  })();

  // Job drain
  handles.add(setInterval(() => {
    if (!WhatsAppClientManager.isReady()) return;
    void drainWhatsAppJobs(3).catch((err) => {
      logger.warn({ err }, "wa: job drain error");
    });
  }, JOB_TICK_MS));

  // Incremental enqueue + pending initial
  handles.add(setInterval(() => {
    if (!WhatsAppClientManager.isReady()) return;
    void (async () => {
      try {
        await enqueuePendingInitialScans();
        await enqueueIncrementalScans();
      } catch (err) {
        logger.warn({ err }, "wa: incremental enqueue error");
      }
    })();
  }, INCREMENTAL_CRON_MS));

  // Ad expiration
  handles.add(setInterval(() => {
    void enqueueScanJob("WHATSAPP_AD_EXPIRATION").then(() => drainWhatsAppJobs(1));
  }, EXPIRATION_CRON_MS));

  logger.info({
    jobTickMs: JOB_TICK_MS,
    incrementalMs: INCREMENTAL_CRON_MS,
    expirationMs: EXPIRATION_CRON_MS,
  }, "wa: scheduler started");
}

export function stopWhatsAppScheduler(): void {
  for (const h of handles) clearInterval(h);
  handles.clear();
  started = false;
}
