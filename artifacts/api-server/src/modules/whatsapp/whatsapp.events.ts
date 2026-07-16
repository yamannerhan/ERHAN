import QRCode from "qrcode";
import { logger } from "../../lib/logger";
import { maskPhone } from "./whatsapp.client";
import type { ConnectionMode, WhatsAppSessionStatus } from "./whatsapp.types";

export type WaClientLike = {
  info?: { wid?: { user?: string } };
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeAllListeners?: (event?: string) => void;
  getChats: () => Promise<unknown[]>;
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
}

export type StatusWriter = (
  s: SessionRuntime,
  status: WhatsAppSessionStatus,
  error?: string | null,
) => void;

export type ReadyHook = (sessionId: string) => void;

/** Client event listener'larını bağla — Client oluşturma burada yok. */
export function attachWhatsAppEvents(
  sessionId: string,
  client: WaClientLike,
  getState: () => SessionRuntime,
  setStatus: StatusWriter,
  onReady: ReadyHook,
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
    logger.info({ sessionId, operation: "authenticated" }, "wa: authenticated");
  });

  client.on("ready", () => {
    const s = getState();
    s.qrDataUrl = null;
    s.pairingCode = null;
    s.starting = false;
    const wid = client.info?.wid?.user;
    if (wid) s.phoneMasked = maskPhone(wid.startsWith("90") ? wid : `90${wid}`);
    setStatus(s, "CONNECTED", null);
    setStatus(s, "SYNCING", null);
    logger.info({ sessionId, operation: "ready_event" }, "wa: ready → syncing");
    onReady(sessionId);
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
    setStatus(s, "DISCONNECTED", String(reason || "disconnected"));
    logger.warn({ sessionId, reason: String(reason) }, "wa: disconnected");
  });
}
