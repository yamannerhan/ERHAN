import QRCode from "qrcode";
import { logger } from "../../lib/logger";
import { maskPhone } from "./whatsapp.client";
import type {
  ConnectionMode,
  GroupDiscoveryStatus,
  ScanStatus,
  WhatsAppGroup,
  WhatsAppSessionStatus,
} from "./whatsapp.types";

export type WaClientLike = {
  info?: { wid?: { user?: string } };
  pupPage?: { isClosed?: () => boolean } | null;
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
}

export type StatusWriter = (
  s: SessionRuntime,
  status: WhatsAppSessionStatus,
  error?: string | null,
) => void;

export type ConnectedHook = (sessionId: string) => void;

/** Client event listener'larını bağla — Client oluşturma burada yok. */
export function attachWhatsAppEvents(
  sessionId: string,
  client: WaClientLike,
  getState: () => SessionRuntime,
  setStatus: StatusWriter,
  onConnected: ConnectedHook,
): void {
  client.on("qr", (qr) => {
    void (async () => {
      const s = getState();
      if (s.mode === "pairing_code") {
        logger.info({ sessionId, operation: "qr_ignored" }, "wa: QR ignored in pairing mode");
        return;
      }
      try {
        s.qrDataUrl = await QRCode.toDataURL(String(qr), { margin: 1, width: 280 });
        s.pairingCode = null;
        setStatus(s, "QR_READY", null);
        logger.info({ sessionId, operation: "qr_ready" }, "wa: QR ready");
      } catch (err) {
        setStatus(s, "FAILED", err instanceof Error ? err.message : "QR üretilemedi");
      }
    })();
  });

  client.on("authenticated", () => {
    const s = getState();
    s.qrDataUrl = null;
    s.pairingCode = null;
    setStatus(s, "AUTHENTICATED", null);
    logger.info({
      sessionId,
      clientInstanceId: s.clientInstanceId,
      operation: "authenticated",
    }, "wa: authenticated — waiting for ready");
    // ready gecikirse getState CONNECTED ile bağlanmış say
    setTimeout(() => {
      void (async () => {
        const st = getState();
        if (st.status !== "AUTHENTICATED") return;
        try {
          const state = typeof client.getState === "function" ? await client.getState() : null;
          if (state === "CONNECTED") {
            st.starting = false;
            setStatus(st, "CONNECTED", null);
            queueMicrotask(() => onConnected(sessionId));
            logger.info({ sessionId, operation: "authenticated_promoted" }, "wa: AUTHENTICATED → CONNECTED via getState");
          }
        } catch { /* ignore */ }
      })();
    }, 8_000);
  });

  client.on("ready", () => {
    const s = getState();
    s.qrDataUrl = null;
    s.pairingCode = null;
    s.starting = false;
    const wid = client.info?.wid?.user;
    if (wid) s.phoneMasked = maskPhone(wid.startsWith("90") ? wid : `90${wid}`);
    // CONNECTED = bağlantı tamam. SYNCING'e düşürme — grup keşfi ayrı.
    setStatus(s, "CONNECTED", null);
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
    setStatus(s, "FAILED", String(msg || "auth_failure"));
    logger.error({ sessionId, error: String(msg) }, "wa: auth_failure");
  });

  client.on("disconnected", (reason) => {
    const s = getState();
    s.starting = false;
    s.qrDataUrl = null;
    s.pairingCode = null;
    s.groupDiscoveryStatus = "NOT_STARTED";
    s.groupDiscoveryPromise = null;
    s.cachedGroups = [];
    setStatus(s, "DISCONNECTED", String(reason || "disconnected"));
    logger.warn({ sessionId, reason: String(reason) }, "wa: disconnected");
  });
}
