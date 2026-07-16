import fs from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { logger } from "../../lib/logger";
import {
  WhatsAppModuleError,
  ensureAuthDir,
  getPuppeteerVersion,
  getSessionLock,
  getWwebjsVersion,
  hasLocalAuth,
  maskPhone,
  normalizeTurkishPhone,
  resolveAuthPath,
  resolveChromiumPath,
  sessionAuthDir,
  volumeWarning,
} from "./whatsapp.client";
import { attachWhatsAppEvents, type SessionRuntime, type WaClientLike } from "./whatsapp.events";
import { persistSessionMeta } from "./whatsapp.repository";
import {
  GET_CHATS_TIMEOUT_MS,
  PROTOCOL_TIMEOUT_MS,
  SESSION_ID,
  type ConnectionMode,
  type WhatsAppGroup,
  type WhatsAppSessionStatus,
  type WhatsAppStatusDto,
} from "./whatsapp.types";

const require = createRequire(import.meta.url);

type WaClient = WaClientLike & {
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  getState: () => Promise<string | null>;
  getChatById: (id: string) => Promise<unknown>;
  requestPairingCode?: (phone: string) => Promise<string>;
  pupPage?: { isClosed?: () => boolean } | null;
};

let ClientCtor: (new (opts: unknown) => WaClient) | null = null;
let LocalAuthCtor: (new (opts: unknown) => unknown) | null = null;

function loadWwebjs(): void {
  if (ClientCtor && LocalAuthCtor) return;
  const mod = require("whatsapp-web.js") as {
    Client: new (opts: unknown) => WaClient;
    LocalAuth: new (opts: unknown) => unknown;
  };
  ClientCtor = mod.Client;
  LocalAuthCtor = mod.LocalAuth;
  if (!ClientCtor || !LocalAuthCtor) {
    throw new WhatsAppModuleError("whatsapp-web.js yüklenemedi", 500, "WWEBJS_LOAD");
  }
}

/** Tek Client — yalnızca bu sınıfta new Client(). */
export class WhatsAppManager {
  private static client: WaClient | null = null;
  private static state: SessionRuntime = {
    sessionId: SESSION_ID,
    status: "IDLE",
    mode: null,
    qrDataUrl: null,
    pairingCode: null,
    phoneMasked: null,
    lastError: null,
    readyAt: null,
    starting: false,
    updatedAt: new Date(),
    clientInstanceId: null,
    chromePath: null,
  };

  private static authPath = resolveAuthPath();

  static getAuthPath(): string {
    return this.authPath;
  }

  private static setStatus(s: SessionRuntime, status: WhatsAppSessionStatus, error?: string | null): void {
    s.status = status;
    s.updatedAt = new Date();
    if (error !== undefined) s.lastError = error;
    if (status === "READY") s.readyAt = new Date();
    void persistSessionMeta({
      sessionId: s.sessionId,
      status: s.status,
      connectionMode: s.mode,
      phoneMasked: s.phoneMasked,
      lastError: s.lastError,
      clientInstanceId: s.clientInstanceId,
      readyAt: s.readyAt,
    }).catch((err) => logger.warn({ err }, "wa: session persist failed"));
  }

  static getStatus(sessionId = SESSION_ID): WhatsAppStatusDto {
    const s = this.state;
    const connected = ["AUTHENTICATED", "CONNECTED", "SYNCING", "READY"].includes(s.status);
    const ready = s.status === "READY" || s.status === "CONNECTED";
    const mode: ConnectionMode = s.mode ?? "qr";
    const inPairing = mode === "pairing_code";
    const authAccepted = connected;

    let connectionStatus = "IDLE";
    if (ready || s.status === "READY") connectionStatus = "CONNECTED";
    else if (["CONNECTED", "SYNCING", "AUTHENTICATED"].includes(s.status)) connectionStatus = "CONNECTED";
    else if (s.status === "FAILED") connectionStatus = "FAILED";
    else if (s.status === "DISCONNECTED") connectionStatus = "DISCONNECTED";
    else if (s.starting || ["STARTING", "QR_READY", "PAIRING_READY"].includes(s.status)) {
      connectionStatus = "CONNECTING";
    }

    let syncStatus = "NOT_STARTED";
    if (s.status === "SYNCING") syncStatus = "LOADING";
    else if (s.status === "READY") syncStatus = "READY";
    else if (s.status === "CONNECTED") syncStatus = "WAITING";
    else if (s.status === "FAILED") syncStatus = "TIMED_OUT";

    const pairingDisplay = s.pairingCode
      ? (s.pairingCode.replace(/\D/g, "").length === 8
        ? `${s.pairingCode.replace(/\D/g, "").slice(0, 4)}-${s.pairingCode.replace(/\D/g, "").slice(4)}`
        : s.pairingCode)
      : null;

    return {
      status: s.status,
      connectionStatus,
      syncStatus,
      whatsappState: connected || ready ? "CONNECTED" : s.status === "FAILED" ? "FAILED" : null,
      authenticated: authAccepted || ready,
      ready,
      connected,
      chatCount: 0,
      groupCount: 0,
      syncAttempt: 0,
      syncStartedAt: null,
      lastSyncError: s.status === "CONNECTED" ? s.lastError : null,
      error: s.lastError,
      updatedAt: s.updatedAt.toISOString(),
      starting: s.starting,
      pairing: inPairing && !ready && !authAccepted,
      authAccepted,
      phase: s.status.toLowerCase(),
      sessionState: s.status,
      connectionMode: mode,
      mode,
      hasSession: hasLocalAuth(this.authPath, sessionId),
      volumeWarning: volumeWarning(this.authPath),
      qr: (inPairing || authAccepted || ready) ? null : s.qrDataUrl,
      pairingCode: (!inPairing || authAccepted || ready) ? null : pairingDisplay,
      expiresInSeconds: s.pairingCode && inPairing && !authAccepted && !ready ? 180 : null,
      phone: s.phoneMasked,
      phoneMasked: s.phoneMasked,
      chromePath: s.chromePath,
      chromiumVersion: null,
      browserOpen: Boolean(this.client),
      pairingMethodAvailable: true,
      wwebjsVersion: getWwebjsVersion(),
      puppeteerVersion: getPuppeteerVersion(),
      sessionId,
      clientInstanceId: s.clientInstanceId,
      clientPhase: s.status,
      authPath: this.authPath,
      getChatsTimeoutMs: GET_CHATS_TIMEOUT_MS,
      protocolTimeoutMs: PROTOCOL_TIMEOUT_MS,
    };
  }

  static isReady(): boolean {
    return this.state.status === "READY" || this.state.status === "CONNECTED";
  }

  static hasSession(): boolean {
    return hasLocalAuth(this.authPath, SESSION_ID);
  }

  static isStarting(): boolean {
    return this.state.starting;
  }

  static getClient(): WaClient | null {
    return this.client;
  }

  private static async destroyClient(): Promise<void> {
    const existing = this.client;
    if (!existing) return;
    try { existing.removeAllListeners?.(); } catch { /* ignore */ }
    try {
      await Promise.race([
        existing.destroy(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("destroy timeout")), 15_000)),
      ]);
    } catch (err) {
      logger.warn({ err }, "wa: destroy warning");
    }
    this.client = null;
    this.state.clientInstanceId = null;
  }

  /** Tek yerde new Client() */
  private static async createClient(): Promise<WaClient> {
    loadWwebjs();
    this.authPath = resolveAuthPath();
    ensureAuthDir(this.authPath);
    const { executablePath, source } = resolveChromiumPath();
    const instanceId = randomUUID();
    const client = new ClientCtor!({
      authStrategy: new LocalAuthCtor!({ clientId: SESSION_ID, dataPath: this.authPath }),
      puppeteer: {
        headless: true,
        executablePath,
        protocolTimeout: PROTOCOL_TIMEOUT_MS,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          "--mute-audio",
        ],
      },
      restartOnAuthFail: false,
    });

    this.state.chromePath = `${executablePath} (${source})`;
    this.state.clientInstanceId = instanceId;
    this.client = client;

    attachWhatsAppEvents(
      SESSION_ID,
      client,
      () => this.state,
      (s, status, error) => this.setStatus(s, status, error),
      (sid) => { void this.markReadyAfterChats(sid); },
    );

    logger.info({
      sessionId: SESSION_ID,
      clientInstanceId: instanceId,
      authPath: this.authPath,
      executablePath,
      chromiumSource: source,
      wwebjsVersion: getWwebjsVersion(),
      operation: "client_created",
    }, "wa: client created");
    return client;
  }

  private static async markReadyAfterChats(sessionId: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    const started = Date.now();
    try {
      await Promise.race([
        client.getChats(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("getChats timeout")), GET_CHATS_TIMEOUT_MS)),
      ]);
      this.setStatus(this.state, "READY", null);
      logger.info({ sessionId, durationMs: Date.now() - started, operation: "sync_ready" }, "wa: READY");
      void import("./whatsapp.scheduler").then((m) => m.onWhatsAppReady()).catch(() => undefined);
    } catch (err) {
      this.setStatus(this.state, "CONNECTED", err instanceof Error ? err.message : "Sohbet senkronu gecikti");
      logger.warn({ err, sessionId, operation: "sync_deferred" }, "wa: getChats delayed; stays CONNECTED");
      setTimeout(() => {
        void (async () => {
          try {
            const c = this.client;
            if (!c) return;
            await c.getChats();
            if (this.state.status === "CONNECTED" || this.state.status === "SYNCING") {
              this.setStatus(this.state, "READY", null);
              void import("./whatsapp.scheduler").then((m) => m.onWhatsAppReady()).catch(() => undefined);
            }
          } catch { /* ignore */ }
        })();
      }, 30_000);
    }
  }

  static async init(): Promise<void> {
    if (!hasLocalAuth(this.authPath, SESSION_ID)) {
      logger.info({ authPath: this.authPath, sessionId: SESSION_ID }, "wa: no local auth — waiting for panel");
      return;
    }
    try {
      await this.connectQr({ restore: true });
    } catch (err) {
      logger.warn({ err }, "wa: auto restore failed");
    }
  }

  static async connectQr(opts?: { restore?: boolean }) {
    return getSessionLock(SESSION_ID).runExclusive(async () => {
      const s = this.state;
      if (s.mode === "pairing_code" && s.starting) {
        throw new WhatsAppModuleError(
          "Onay kodu bağlantısı devam ediyor. Önce iptal edin.",
          409,
          "MODE_CONFLICT",
        );
      }
      if (this.client && ["READY", "CONNECTED", "SYNCING", "AUTHENTICATED"].includes(s.status)) {
        return this.getStatus();
      }

      await this.destroyClient();
      s.sessionId = SESSION_ID;
      s.mode = "qr";
      s.pairingCode = null;
      s.qrDataUrl = null;
      s.phoneMasked = null;
      s.starting = true;
      s.lastError = null;
      this.setStatus(s, "STARTING", null);

      const client = await this.createClient();
      void client.initialize().catch((err) => {
        s.starting = false;
        this.setStatus(s, "FAILED", err instanceof Error ? err.message : String(err));
        logger.error({ err, operation: "initialize" }, "wa: initialize failed");
      });

      logger.info({ operation: "connect_qr", restore: Boolean(opts?.restore) }, "wa: QR connect started");
      return this.getStatus();
    });
  }

  static async connectPairing(phoneNumber: string) {
    return getSessionLock(SESSION_ID).runExclusive(async () => {
      const normalized = normalizeTurkishPhone(phoneNumber);
      if (!normalized) {
        throw new WhatsAppModuleError(
          "Geçersiz Türkiye telefon numarası. 0532..., 532... veya 90532... formatını kullanın.",
          400,
          "INVALID_PHONE",
        );
      }

      const s = this.state;
      if (s.mode === "qr" && s.starting) {
        throw new WhatsAppModuleError(
          "QR bağlantısı devam ediyor. Önce iptal edin.",
          409,
          "MODE_CONFLICT",
        );
      }

      await this.destroyClient();
      s.sessionId = SESSION_ID;
      s.mode = "pairing_code";
      s.qrDataUrl = null;
      s.pairingCode = null;
      s.phoneMasked = maskPhone(normalized);
      s.starting = true;
      s.lastError = null;
      this.setStatus(s, "STARTING", null);

      const client = await this.createClient();
      const initPromise = client.initialize().catch((err) => {
        s.starting = false;
        this.setStatus(s, "FAILED", err instanceof Error ? err.message : String(err));
        throw err;
      });

      await new Promise((r) => setTimeout(r, 1500));
      if (typeof client.requestPairingCode !== "function") {
        await this.destroyClient();
        throw new WhatsAppModuleError(
          "Bu whatsapp-web.js sürümünde requestPairingCode yok.",
          500,
          "PAIRING_UNSUPPORTED",
        );
      }

      try {
        const code = await client.requestPairingCode(normalized);
        s.pairingCode = String(code).replace(/\s+/g, "");
        s.qrDataUrl = null;
        this.setStatus(s, "PAIRING_READY", null);
        logger.info({ operation: "pairing_ready", phoneMasked: s.phoneMasked }, "wa: pairing code ready");
      } catch (err) {
        s.starting = false;
        this.setStatus(s, "FAILED", err instanceof Error ? err.message : String(err));
        throw new WhatsAppModuleError(
          err instanceof Error ? err.message : "Onay kodu alınamadı",
          500,
          "PAIRING_FAILED",
        );
      }

      void initPromise;
      return this.getStatus();
    });
  }

  static async disconnect(): Promise<void> {
    return getSessionLock(SESSION_ID).runExclusive(async () => {
      await this.destroyClient();
      const s = this.state;
      s.starting = false;
      s.qrDataUrl = null;
      s.pairingCode = null;
      s.mode = null;
      this.setStatus(s, "DISCONNECTED", null);
    });
  }

  /** Auth sil — yalnızca admin sıfırlama. */
  static async resetSession(): Promise<void> {
    return getSessionLock(SESSION_ID).runExclusive(async () => {
      await this.destroyClient();
      const dir = sessionAuthDir(this.authPath, SESSION_ID);
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        logger.warn({ err, dir }, "wa: auth dir delete failed");
      }
      const s = this.state;
      s.starting = false;
      s.qrDataUrl = null;
      s.pairingCode = null;
      s.mode = null;
      s.readyAt = null;
      this.setStatus(s, "IDLE", null);
      logger.info({ authPath: this.authPath, operation: "reset" }, "wa: session reset");
    });
  }

  static async getChats(): Promise<WhatsAppGroup[]> {
    const client = this.client;
    const s = this.state;
    if (!client) throw new WhatsAppModuleError("WhatsApp bağlı değil", 409, "NOT_CONNECTED");
    if (!["READY", "CONNECTED", "SYNCING"].includes(s.status)) {
      throw new WhatsAppModuleError("WhatsApp henüz hazır değil", 409, "NOT_READY");
    }

    const chats = await Promise.race([
      client.getChats(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("getChats timeout")), GET_CHATS_TIMEOUT_MS)),
    ]) as Record<string, unknown>[];

    if (s.status === "CONNECTED" || s.status === "SYNCING") this.setStatus(s, "READY", null);

    const result: WhatsAppGroup[] = [];
    for (const chat of chats) {
      const id = chat.id && typeof chat.id === "object"
        ? String((chat.id as { _serialized?: string })._serialized ?? "")
        : String(chat.id ?? "");
      if (!id) continue;
      const isChannel = id.includes("@newsletter") || Boolean(chat.isChannel) || Boolean(chat.isNewsletter);
      const isGroup = (Boolean(chat.isGroup) || id.endsWith("@g.us")) && !isChannel;
      if (!isGroup && !isChannel) continue;
      const ts = (chat.timestamp as number | undefined)
        ?? (chat.lastMessage && typeof chat.lastMessage === "object"
          ? (chat.lastMessage as { timestamp?: number }).timestamp
          : undefined);
      result.push({
        id,
        name: String(chat.name || chat.formattedTitle || chat.pushname || "İsimsiz grup"),
        isGroup,
        isChannel,
        lastMessageAt: ts && Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
      });
    }
    return result;
  }

  static async getGroups(): Promise<WhatsAppGroup[]> {
    const chats = await this.getChats();
    return chats.filter((c) => c.isGroup || c.isChannel);
  }

  static async getChatById(chatId: string) {
    const client = this.client;
    if (!client) throw new WhatsAppModuleError("WhatsApp bağlı değil", 409, "NOT_CONNECTED");
    return client.getChatById(chatId);
  }

  static ensureAutoConnect(): void {
    if (this.isReady() || this.isStarting()) return;
    if (!this.hasSession()) return;
    void this.connectQr({ restore: true }).catch(() => undefined);
  }
}

/** Eski API adı uyumu */
export class WhatsAppStartError extends WhatsAppModuleError {
  constructor(message: string, statusCode = 500, code = "WA_ERROR") {
    super(message, statusCode, code);
    this.name = "WhatsAppStartError";
  }
}
