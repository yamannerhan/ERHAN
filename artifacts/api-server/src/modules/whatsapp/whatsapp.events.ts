import QRCode from "qrcode";
import { logger } from "../../lib/logger";
import { classifyWhatsAppError, formatPairingCode, maskPhone } from "./whatsapp.client";
import type {
  ConnectionMode,
  GroupDiscoveryStatus,
  ScanStatus,
  WhatsAppGroup,
  WhatsAppSessionStatus,
} from "./whatsapp.types";

export type WaClientLike = {
  info?: { wid?: { user?: string } };
  pupPage?: {
    isClosed?: () => boolean;
    on?: (event: string, cb: (...args: unknown[]) => void) => void;
    evaluate?: <T>(fn: (...args: never[]) => T | Promise<T>, ...args: unknown[]) => Promise<T>;
  } | null;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeAllListeners?: (event?: string) => void;
  getChats: () => Promise<unknown[]>;
  getState?: () => Promise<string | null>;
};

export interface SessionRuntime {
  sessionId: string;
  status: WhatsAppSessionStatus;
  mode: ConnectionMode | null;
  qrDataUrl: string | null;
  pairingCode: string | null;
  phoneMasked: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  readyAt: Date | null;
  starting: boolean;
  updatedAt: Date;
  clientInstanceId: string | null;
  chromePath: string | null;
  groupDiscoveryStatus: GroupDiscoveryStatus;
  groupDiscoveryMessage: string | null;
  groupDiscoveryAttempt: number;
  groupDiscoveryStartedAt: Date | null;
  groupDiscoveryPromise: Promise<WhatsAppGroup[]> | null;
  cachedGroups: WhatsAppGroup[];
  chatCount: number;
  groupCount: number;
  channelCount: number;
  scanStatus: ScanStatus;
  /** Pairing ekranı hazır (qr veya AuthStore UNPAIRED) */
  pairingScreenReady: boolean;
  waitingForPairingResolve: (() => void) | null;
  codeReadyResolve: ((code: string) => void) | null;
  corruptionRecoveryUsed: boolean;
}

export type StatusWriter = (
  s: SessionRuntime,
  status: WhatsAppSessionStatus,
  error?: string | null,
  errorCode?: string | null,
) => void;

export type ConnectedHook = (sessionId: string) => void;
export type CorruptionHook = (err: unknown) => void;
export type DisconnectedHook = (reason: unknown) => void;

/** Client event listener'larını bağla — Client oluşturma burada yok. */
export function attachWhatsAppEvents(
  sessionId: string,
  client: WaClientLike,
  getState: () => SessionRuntime,
  setStatus: StatusWriter,
  onConnected: ConnectedHook,
  onCorruption?: CorruptionHook,
  onDisconnected?: DisconnectedHook,
): void {
  const markPairingScreenReady = () => {
    const s = getState();
    if (s.mode !== "pairing_code") return;
    if (s.pairingScreenReady) return;
    s.pairingScreenReady = true;
    if (!s.pairingCode) {
      setStatus(s, "WAITING_FOR_PAIRING", null, null);
    }
    s.waitingForPairingResolve?.();
    s.waitingForPairingResolve = null;
    logger.info({ sessionId, operation: "waiting_for_pairing" }, "wa: pairing screen ready");
  };

  client.on("qr", (qr) => {
    void (async () => {
      const s = getState();
      if (s.mode === "pairing_code") {
        // Pairing modunda QR = AuthStore hazır; kod istemek için sinyal
        markPairingScreenReady();
        return;
      }
      try {
        s.qrDataUrl = await QRCode.toDataURL(String(qr), { margin: 1, width: 280 });
        s.pairingCode = null;
        setStatus(s, "QR_READY", null, null);
        logger.info({ sessionId, operation: "qr_ready" }, "wa: QR ready");
      } catch (err) {
        setStatus(s, "ERROR", err instanceof Error ? err.message : "QR üretilemedi", "UNKNOWN_ERROR");
      }
    })();
  });

  client.on("code", (code) => {
    const s = getState();
    const formatted = formatPairingCode(String(code));
    if (!formatted) return;
    s.pairingCode = formatted;
    s.qrDataUrl = null;
    s.starting = true;
    setStatus(s, "PAIRING_CODE_READY", null, null);
    s.codeReadyResolve?.(formatted);
    s.codeReadyResolve = null;
    logger.info({
      sessionId,
      pairingCode: formatted,
      phoneMasked: s.phoneMasked,
      operation: "pairing_code_ready",
    }, "wa: pairing code ready");
  });

  client.on("authenticated", () => {
    const s = getState();
    s.qrDataUrl = null;
    s.pairingCode = null;
    setStatus(s, "AUTHENTICATED", null, null);
    logger.info({
      sessionId,
      clientInstanceId: s.clientInstanceId,
      operation: "authenticated",
    }, "wa: authenticated — waiting for ready");
  });

  client.on("ready", () => {
    const s = getState();
    s.qrDataUrl = null;
    s.pairingCode = null;
    s.starting = false;
    const wid = client.info?.wid?.user;
    if (wid) s.phoneMasked = maskPhone(wid.startsWith("90") ? wid : `90${wid}`);
    setStatus(s, "CONNECTED", null, null);
    logger.info({
      sessionId,
      clientInstanceId: s.clientInstanceId,
      operation: "ready_connected",
    }, "wa: ready → CONNECTED; group discovery queued");
    queueMicrotask(() => onConnected(sessionId));
  });

  client.on("auth_failure", (msg) => {
    const s = getState();
    s.starting = false;
    const classified = classifyWhatsAppError(msg);
    setStatus(s, classified.corrupted ? "ERROR" : "ERROR", classified.message, classified.code);
    logger.error({ sessionId, error: String(msg), code: classified.code }, "wa: auth_failure");
    if (classified.corrupted) onCorruption?.(msg);
  });

  client.on("disconnected", (reason) => {
    const s = getState();
    s.starting = false;
    s.qrDataUrl = null;
    s.pairingCode = null;
    s.groupDiscoveryStatus = "NOT_STARTED";
    s.groupDiscoveryPromise = null;
    s.cachedGroups = [];
    const classified = classifyWhatsAppError(reason);
    setStatus(s, "DISCONNECTED", classified.message, classified.code === "UNKNOWN_ERROR" ? null : classified.code);
    logger.warn({ sessionId, reason: String(reason) }, "wa: disconnected");
    if (classified.corrupted) onCorruption?.(reason);
    else onDisconnected?.(reason);
  });

  // Chromium page error → cache corruption yakala
  try {
    client.pupPage?.on?.("pageerror", (err) => {
      const classified = classifyWhatsAppError(err);
      if (!classified.corrupted) return;
      logger.error({ err, sessionId, code: classified.code }, "wa: pageerror corrupted cache");
      const s = getState();
      setStatus(s, "ERROR", classified.message, classified.code);
      onCorruption?.(err);
    });
    client.pupPage?.on?.("error", (err) => {
      const classified = classifyWhatsAppError(err);
      if (!classified.corrupted) return;
      onCorruption?.(err);
    });
  } catch { /* pupPage henüz yok olabilir — initialize sonrası da bağlanır */ }
}
