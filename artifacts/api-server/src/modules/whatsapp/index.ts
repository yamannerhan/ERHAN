/**
 * WhatsApp modülü — public API.
 * Client yalnızca WhatsAppManager içinde oluşturulur.
 */
import { WhatsAppManager, WhatsAppStartError } from "./whatsapp.manager";
import {
  startWhatsAppScheduler,
  stopWhatsAppScheduler,
  triggerScanNow,
  kickDeepScan,
  onWhatsAppReady,
  drainJobs,
} from "./whatsapp.scheduler";
import {
  addWhatsAppGroupSource,
  listWhatsAppGroups,
  listWhatsAppSourcesForAdmin,
  disableWhatsAppSource,
  resetWhatsAppSource,
  resetAllWhatsAppSources,
  getDiscoveryDiagnostics,
} from "./whatsapp.group.service";
import { expireWhatsAppListings } from "./whatsapp.repository";
import whatsappRouter from "./whatsapp.routes";

export {
  WhatsAppManager,
  WhatsAppStartError,
  startWhatsAppScheduler,
  stopWhatsAppScheduler,
  triggerScanNow,
  kickDeepScan,
  onWhatsAppReady,
  drainJobs,
  addWhatsAppGroupSource,
  listWhatsAppGroups,
  listWhatsAppSourcesForAdmin,
  disableWhatsAppSource,
  resetWhatsAppSource,
  resetAllWhatsAppSources,
  getDiscoveryDiagnostics,
  expireWhatsAppListings,
  whatsappRouter,
};

export { WhatsAppModuleError, normalizeTurkishPhone, contentHash, isNewerThanCheckpoint } from "./whatsapp.client";
export { classifySecurityJob } from "./whatsapp.classifier.service";
export { SESSION_ID, HISTORY_DAYS, SCAN_INTERVAL_MS, EXPIRE_DAYS } from "./whatsapp.types";

export async function initWhatsAppClient(): Promise<void> {
  await WhatsAppManager.init();
  startWhatsAppScheduler();
}

export async function stopWhatsAppClient(): Promise<void> {
  stopWhatsAppScheduler();
  await WhatsAppManager.disconnect();
}

export function isWhatsAppReady(): boolean {
  return WhatsAppManager.isReady();
}

export function hasWhatsAppLocalSession(): boolean {
  return WhatsAppManager.hasSession();
}

export function isWhatsAppStarting(): boolean {
  return WhatsAppManager.isStarting();
}

export function ensureWhatsAppAutoConnect(): void {
  WhatsAppManager.ensureAutoConnect();
}

export function getWhatsAppStatus() {
  return WhatsAppManager.getStatus();
}

export async function startWhatsAppClient(opts?: {
  phoneNumber?: string;
  mode?: "qr" | "pairing_code";
}) {
  const mode = opts?.mode ?? (opts?.phoneNumber?.trim() ? "pairing_code" : "qr");
  if (mode === "pairing_code") {
    const st = await WhatsAppManager.connectPairing(opts?.phoneNumber ?? "");
    return {
      success: true,
      mode: "pairing_code" as const,
      status: st.status,
      message: st.pairingCode
        ? "Onay kodu hazır. WhatsApp uygulamanızdan girin."
        : "WhatsApp bağlantısı hazırlanıyor.",
      phase: st.status.toLowerCase(),
      pairingCode: st.pairingCode,
      expiresInSeconds: st.pairingCode ? 180 : null,
      qr: null as string | null,
    };
  }
  const st = await WhatsAppManager.connectQr();
  return {
    success: true,
    mode: "qr" as const,
    status: st.status,
    message: st.qr
      ? "QR kodu hazır. WhatsApp → Bağlı Cihazlar → Cihaz bağla."
      : st.ready || st.connected
        ? "WhatsApp zaten bağlı."
        : "WhatsApp bağlantısı hazırlanıyor.",
    phase: st.status.toLowerCase(),
    pairingCode: null as string | null,
    expiresInSeconds: null as number | null,
    qr: st.qr,
  };
}

export async function reloadWhatsAppChats() {
  await WhatsAppManager.getChats();
  return WhatsAppManager.getStatus();
}

export async function fetchWhatsAppGroups() {
  return listWhatsAppGroups();
}

export async function getWhatsAppDiscoveryDiagnostics() {
  return getDiscoveryDiagnostics();
}

export async function triggerWhatsAppScan() {
  return triggerScanNow();
}

export function kickWhatsAppDeepScan(): void {
  kickDeepScan();
}

export async function resetSingleWhatsAppSource(id: number) {
  return resetWhatsAppSource(id);
}
