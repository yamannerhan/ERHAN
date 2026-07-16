/**
 * Eski whatsapp-client API yüzeyi — routes / scraper / admin UI uyumu.
 * İçeride WhatsAppClientManager + yeni tarama kuyruğunu kullanır.
 */
import { WhatsAppClientError, WhatsAppClientManager, initWhatsAppClient as managerInit, stopWhatsAppClient as managerStop } from "./manager";
import { discoverWhatsAppSources } from "../whatsapp-core";
import { triggerWhatsAppScanNow } from "./jobs";
import {
  disableWhatsAppSource,
  listWhatsAppSourcesForAdmin,
  resetAllWhatsAppSourcesNew,
  resetWhatsAppSource,
  upsertWhatsAppSource,
} from "./sources-service";
import { startWhatsAppScheduler, stopWhatsAppScheduler } from "./scheduler";
import { DEFAULT_SESSION_ID } from "./types";
import { maskPhone } from "./phone";

export class WhatsAppStartError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
    public code = "WA_ERROR",
  ) {
    super(message);
    this.name = "WhatsAppStartError";
  }
}

function mapClientError(err: unknown): never {
  if (err instanceof WhatsAppClientError) {
    throw new WhatsAppStartError(err.message, err.statusCode, err.code);
  }
  throw err;
}

function formatPairingCodeDisplay(code: string | null): string | null {
  if (!code) return null;
  const digits = code.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return code;
}

export function getWhatsAppStatus() {
  const s = WhatsAppClientManager.getStatus(DEFAULT_SESSION_ID);
  const status = s.status;
  const connected = s.connected;
  const ready = s.ready;
  const mode = s.connectionMode === "PAIRING_CODE" ? "pairing_code" : "qr";
  const inPairing = mode === "pairing_code";
  const authAccepted = ["AUTHENTICATED", "CONNECTED", "SYNCING", "READY"].includes(status);

  let connectionStatus: string = "IDLE";
  if (ready || status === "READY") connectionStatus = "CONNECTED";
  else if (["CONNECTED", "SYNCING", "AUTHENTICATED"].includes(status)) connectionStatus = "CONNECTED";
  else if (status === "FAILED") connectionStatus = "FAILED";
  else if (status === "DISCONNECTED") connectionStatus = "DISCONNECTED";
  else if (s.starting || status === "STARTING" || status === "QR_READY" || status === "PAIRING_CODE_REQUESTING" || status === "PAIRING_CODE_READY") {
    connectionStatus = "CONNECTING";
  }

  let syncStatus: string = "NOT_STARTED";
  if (status === "SYNCING") syncStatus = "LOADING";
  else if (status === "READY") syncStatus = "READY";
  else if (status === "CONNECTED") syncStatus = "WAITING";
  else if (status === "FAILED") syncStatus = "TIMED_OUT";

  return {
    status,
    connectionStatus,
    syncStatus,
    whatsappState: connected || ready ? "CONNECTED" : status === "FAILED" ? "FAILED" : null,
    authenticated: authAccepted || ready || connected,
    ready,
    connected,
    chatCount: 0,
    groupCount: 0,
    syncAttempt: 0,
    syncStartedAt: null as string | null,
    lastSyncError: status === "CONNECTED" ? s.error : null,
    error: s.error,
    updatedAt: s.updatedAt,
    starting: s.starting,
    pairing: inPairing && !ready && !authAccepted && !connected,
    authAccepted,
    phase: status.toLowerCase(),
    sessionState: status,
    connectionMode: mode,
    mode,
    hasSession: s.hasLocalAuth,
    qr: (inPairing || authAccepted || ready || connected) ? null : s.qr,
    pairingCode: (!inPairing || authAccepted || ready || connected)
      ? null
      : formatPairingCodeDisplay(s.pairingCode),
    expiresInSeconds: s.pairingCode && inPairing && !authAccepted && !ready && !connected
      ? 180
      : null,
    phone: s.phoneMasked,
    phoneMasked: s.phoneMasked,
    chromePath: null as string | null,
    chromiumVersion: null as string | null,
    browserOpen: Boolean(WhatsAppClientManager.getClient()),
    pairingMethodAvailable: true,
    wwebjsVersion: s.wwebjsVersion,
    puppeteerVersion: s.puppeteerVersion,
    sessionId: s.sessionId,
    clientInstanceId: s.clientInstanceId,
    clientPhase: status,
    authPath: s.authPath,
    getChatsTimeoutMs: 120_000,
    protocolTimeoutMs: 300_000,
  };
}

export async function startWhatsAppClient(
  opts?: { phoneNumber?: string; force?: boolean; mode?: "qr" | "pairing_code" },
): Promise<{
  success: boolean;
  mode: "qr" | "pairing_code";
  status: string;
  message: string;
  phase: string;
  pairingCode: string | null;
  expiresInSeconds: number | null;
  qr: string | null;
}> {
  try {
    const mode = opts?.mode ?? (opts?.phoneNumber?.trim() ? "pairing_code" : "qr");
    if (mode === "pairing_code") {
      const st = await WhatsAppClientManager.connectPairingCode(opts?.phoneNumber ?? "");
      return {
        success: true,
        mode: "pairing_code",
        status: st.status,
        message: st.pairingCode
          ? "Onay kodu hazır. WhatsApp uygulamanızdan girin."
          : "WhatsApp bağlantısı hazırlanıyor. Lütfen birkaç saniye bekleyin.",
        phase: st.status.toLowerCase(),
        pairingCode: formatPairingCodeDisplay(st.pairingCode),
        expiresInSeconds: st.pairingCode ? 180 : null,
        qr: null,
      };
    }
    const st = await WhatsAppClientManager.connectQr();
    return {
      success: true,
      mode: "qr",
      status: st.status,
      message: st.qr
        ? "QR kodu hazır. WhatsApp → Bağlı Cihazlar → Cihaz bağla."
        : st.ready || st.connected
          ? "WhatsApp zaten bağlı."
          : "WhatsApp bağlantısı hazırlanıyor. Lütfen birkaç saniye bekleyin.",
      phase: st.status.toLowerCase(),
      pairingCode: null,
      expiresInSeconds: null,
      qr: st.qr,
    };
  } catch (err) {
    mapClientError(err);
  }
}

export async function stopWhatsAppClient(): Promise<void> {
  stopWhatsAppScheduler();
  await managerStop();
}

export async function initWhatsAppClient(): Promise<void> {
  await managerInit();
  startWhatsAppScheduler();
}

export function isWhatsAppReady(): boolean {
  return WhatsAppClientManager.isReady();
}

export function hasWhatsAppLocalSession(): boolean {
  return WhatsAppClientManager.getStatus().hasLocalAuth;
}

export function isWhatsAppStarting(): boolean {
  return WhatsAppClientManager.getStatus().starting;
}

export function ensureWhatsAppAutoConnect(): void {
  if (WhatsAppClientManager.isReady() || WhatsAppClientManager.getStatus().starting) return;
  if (!hasWhatsAppLocalSession()) return;
  void WhatsAppClientManager.connectQr(DEFAULT_SESSION_ID, { restore: true }).catch(() => undefined);
}

export async function reloadWhatsAppChats() {
  try {
    await WhatsAppClientManager.getChats();
    return getWhatsAppStatus();
  } catch (err) {
    mapClientError(err);
  }
}

export async function fetchWhatsAppGroups() {
  const groups = await WhatsAppClientManager.getGroups();
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    isGroup: g.isGroup,
    isChannel: g.isChannel,
    lastMessageAt: g.lastMessageAt,
  }));
}

export async function getWhatsAppDiscoveryDiagnostics() {
  const client = WhatsAppClientManager.getClient();
  if (!client) {
    return { steps: ["client yok"], sources: [], error: "not_connected" };
  }
  try {
    const result = await discoverWhatsAppSources(client as Parameters<typeof discoverWhatsAppSources>[0]);
    return result;
  } catch (err) {
    return {
      steps: [],
      sources: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function addWhatsAppGroupSource(params: {
  groupId: string;
  groupName: string;
  sourceName?: string;
}) {
  return upsertWhatsAppSource({
    chatId: params.groupId,
    chatName: (params.sourceName || params.groupName).slice(0, 120),
  });
}

export { listWhatsAppSourcesForAdmin, disableWhatsAppSource, resetWhatsAppSource };

export async function resetAllWhatsAppSources() {
  return resetAllWhatsAppSourcesNew();
}

export async function resetSingleWhatsAppSource(id: number) {
  return resetWhatsAppSource(id);
}

export async function triggerWhatsAppScan() {
  return triggerWhatsAppScanNow();
}

export function kickWhatsAppDeepScan(): void {
  void (async () => {
    const { enqueuePendingInitialScans } = await import("./jobs");
    const { drainWhatsAppJobs } = await import("./jobs");
    await enqueuePendingInitialScans();
    await drainWhatsAppJobs(2);
  })().catch(() => undefined);
}

/** Scraper uyumu — yeni yol mesajları job/scanner ile alır; bu stub boş döner. */
export async function fetchWhatsAppMessagesDetailed(): Promise<{
  messages: Array<{ id: string; text: string; timestamp: number }>;
  reachedEnd: boolean;
  error?: string;
}> {
  return { messages: [], reachedEnd: true };
}

export { WhatsAppClientManager, maskPhone, startWhatsAppScheduler, stopWhatsAppScheduler };
