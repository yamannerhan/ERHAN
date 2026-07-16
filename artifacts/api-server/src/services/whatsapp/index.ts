/**
 * WhatsApp bot public API.
 * Bağlantı: manager · Tarama: scanner/jobs · Yayın: publisher · Admin uyumu: compat
 */
export * from "./types";
export * from "./phone";
export * from "./checkpoint";
export * from "./content-hash";
export * from "./classifier";
export * from "./mutex";
export {
  WhatsAppClientManager,
  WhatsAppClientError,
  initWhatsAppClient as initWhatsAppManager,
  stopWhatsAppClient as stopWhatsAppManager,
  isWhatsAppReady as isWhatsAppManagerReady,
  hasWhatsAppLocalSession as hasWhatsAppManagerSession,
  AUTH_PATH,
} from "./manager";
export { processWhatsAppMessage, ensureLegacySource, advanceCheckpoint } from "./publisher";
export { runInitialScan, runIncrementalScan } from "./scanner";
export { expireWhatsAppListings } from "./expiration";
export {
  processNextWhatsAppJob,
  drainWhatsAppJobs,
  enqueueIncrementalScans,
  enqueuePendingInitialScans,
  triggerWhatsAppScanNow,
  isWhatsAppJobWorkerBusy,
} from "./jobs";
export {
  upsertWhatsAppSource,
  enqueueScanJob,
  listWhatsAppSourcesForAdmin,
  disableWhatsAppSource,
  resetWhatsAppSource,
  resetAllWhatsAppSourcesNew,
  migrateLegacyWhatsAppSources,
} from "./sources-service";
export { startWhatsAppScheduler, stopWhatsAppScheduler } from "./scheduler";

// Route / scraper / bot-worker uyumluluk yüzeyi
export {
  WhatsAppStartError,
  getWhatsAppStatus,
  startWhatsAppClient,
  stopWhatsAppClient,
  initWhatsAppClient,
  isWhatsAppReady,
  hasWhatsAppLocalSession,
  isWhatsAppStarting,
  ensureWhatsAppAutoConnect,
  reloadWhatsAppChats,
  fetchWhatsAppGroups,
  getWhatsAppDiscoveryDiagnostics,
  addWhatsAppGroupSource,
  resetAllWhatsAppSources,
  resetSingleWhatsAppSource,
  triggerWhatsAppScan,
  kickWhatsAppDeepScan,
  fetchWhatsAppMessagesDetailed,
} from "./compat";
