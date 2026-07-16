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
  type ConnectionStatus,
  type GroupDiscoveryStatus,
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
    groupDiscoveryStatus: "NOT_STARTED",
    groupDiscoveryMessage: null,
    groupDiscoveryAttempt: 0,
    groupDiscoveryStartedAt: null,
    groupDiscoveryPromise: null,
    cachedGroups: [],
    chatCount: 0,
    groupCount: 0,
    channelCount: 0,
    scanStatus: "NOT_STARTED",
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
    const mode: ConnectionMode = s.mode ?? "qr";
    const inPairing = mode === "pairing_code";

    let connectionStatus: ConnectionStatus = "IDLE";
    if (s.status === "CONNECTED" || s.status === "READY" || s.status === "SYNCING") {
      connectionStatus = "CONNECTED";
    } else if (s.status === "AUTHENTICATED") {
      connectionStatus = "AUTHENTICATED";
    } else if (s.status === "FAILED") {
      connectionStatus = "FAILED";
    } else if (s.status === "DISCONNECTED") {
      connectionStatus = "DISCONNECTED";
    } else if (s.starting || ["STARTING", "QR_READY", "PAIRING_READY"].includes(s.status)) {
      connectionStatus = "CONNECTING";
    }

    const groupDiscoveryStatus: GroupDiscoveryStatus = s.groupDiscoveryStatus;
    const connected = connectionStatus === "CONNECTED" || connectionStatus === "AUTHENTICATED";
    const groupsReady = groupDiscoveryStatus === "READY";
    const authAccepted = connected || s.status === "AUTHENTICATED";

    const pairingDisplay = s.pairingCode
      ? (s.pairingCode.replace(/\D/g, "").length === 8
        ? `${s.pairingCode.replace(/\D/g, "").slice(0, 4)}-${s.pairingCode.replace(/\D/g, "").slice(4)}`
        : s.pairingCode)
      : null;

    return {
      status: s.status,
      connectionStatus,
      syncStatus: groupDiscoveryStatus,
      groupDiscoveryStatus,
      scanStatus: s.scanStatus,
      whatsappState: connectionStatus === "CONNECTED" ? "CONNECTED"
        : connectionStatus === "FAILED" ? "FAILED" : null,
      authenticated: authAccepted,
      ready: connectionStatus === "CONNECTED",
      connected: connectionStatus === "CONNECTED",
      chatCount: s.chatCount,
      groupCount: s.groupCount,
      channelCount: s.channelCount,
      syncAttempt: s.groupDiscoveryAttempt,
      syncStartedAt: s.groupDiscoveryStartedAt?.toISOString() ?? null,
      lastSyncError: groupDiscoveryStatus === "RETRYING" || groupDiscoveryStatus === "FAILED"
        ? s.groupDiscoveryMessage
        : null,
      groupDiscoveryMessage: s.groupDiscoveryMessage,
      error: s.lastError,
      updatedAt: s.updatedAt.toISOString(),
      starting: s.starting,
      pairing: inPairing && !connected && !authAccepted,
      authAccepted,
      phase: s.status.toLowerCase(),
      sessionState: s.status,
      connectionMode: mode,
      mode,
      hasSession: hasLocalAuth(this.authPath, sessionId),
      volumeWarning: volumeWarning(this.authPath),
      qr: (inPairing || connected || authAccepted) ? null : s.qrDataUrl,
      pairingCode: (!inPairing || connected || authAccepted) ? null : pairingDisplay,
      expiresInSeconds: s.pairingCode && inPairing && !connected && !authAccepted ? 180 : null,
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

  /** Bağlantı tamam — grup keşfi / tarama ayrı. */
  static isConnected(): boolean {
    return ["CONNECTED", "READY", "SYNCING", "AUTHENTICATED"].includes(this.state.status)
      && Boolean(this.client);
  }

  /** Tarama / mesaj için client kullanılabilir mi. */
  static isReady(): boolean {
    return this.isConnected();
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

  static getActiveClient(): WaClient | null {
    return this.client;
  }

  static getCachedGroups(): WhatsAppGroup[] {
    return this.state.cachedGroups;
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
    this.state.groupDiscoveryStatus = "NOT_STARTED";
    this.state.groupDiscoveryPromise = null;
    this.state.groupDiscoveryMessage = null;
    this.state.cachedGroups = [];
    this.state.chatCount = 0;
    this.state.groupCount = 0;
    this.state.channelCount = 0;
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
      (sid) => {
        // Bağlantı CONNECTED → grup keşfi; ilan taraması burada BAŞLAMAZ.
        queueMicrotask(() => { void this.refreshGroups(sid); });
      },
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

  private static clientUsableForGroups(client: WaClient): { ok: boolean; reason?: string } {
    if (!client) return { ok: false, reason: "CLIENT_NOT_AVAILABLE" };
    if (typeof client.getChats !== "function") return { ok: false, reason: "GET_CHATS_MISSING" };
    if (client.pupPage && typeof client.pupPage.isClosed === "function" && client.pupPage.isClosed()) {
      return { ok: false, reason: "PAGE_CLOSED" };
    }
    return { ok: true };
  }

  private static mapChatsToGroups(chats: Record<string, unknown>[]): WhatsAppGroup[] {
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
        kind: isChannel ? "channel" : "group",
        lastMessageAt: ts && Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
      });
    }
    return result;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * CONNECTED sonrası grup keşfi.
   * Bağlantıyı FAILED yapmaz. Aynı anda tek promise.
   * İlk 60 sn: 5 sn · sonraki 2 dk: 15 sn · max 3 dk.
   */
  static async refreshGroups(sessionId = SESSION_ID): Promise<WhatsAppGroup[]> {
    const s = this.state;
    if (s.groupDiscoveryPromise) return s.groupDiscoveryPromise;

    const promise = (async () => {
      const startedAt = Date.now();
      s.groupDiscoveryStartedAt = new Date();
      s.groupDiscoveryAttempt = 0;
      s.groupDiscoveryStatus = "LOADING";
      s.groupDiscoveryMessage = "WhatsApp bağlı. Gruplar yükleniyor.";

      const deadlines = [
        { untilMs: 60_000, intervalMs: 5_000 },
        { untilMs: 180_000, intervalMs: 15_000 },
      ];

      while (Date.now() - startedAt < 180_000) {
        if (!this.isConnected()) {
          s.groupDiscoveryStatus = "FAILED";
          s.groupDiscoveryMessage = "Bağlantı koptu — grup listesi alınamadı.";
          break;
        }

        const client = this.getActiveClient();
        const usable = client ? this.clientUsableForGroups(client) : { ok: false, reason: "CLIENT_NOT_AVAILABLE" };
        s.groupDiscoveryAttempt += 1;

        if (!usable.ok || !client) {
          s.groupDiscoveryStatus = "RETRYING";
          s.groupDiscoveryMessage = "WhatsApp bağlı. Grup listesi hazırlanıyor.";
          logger.info({
            sessionId,
            clientInstanceId: s.clientInstanceId,
            attempt: s.groupDiscoveryAttempt,
            reason: usable.reason,
            operation: "group_discovery_retry",
          }, "wa: group discovery wait");
        } else {
          try {
            let state: string | null = null;
            try { state = await client.getState(); } catch { /* ignore */ }
            if (state && state !== "CONNECTED") {
              s.groupDiscoveryStatus = "RETRYING";
              s.groupDiscoveryMessage = "WhatsApp bağlı. Grup listesi hazırlanıyor.";
            } else {
              const chats = await Promise.race([
                client.getChats(),
                new Promise<never>((_, rej) =>
                  setTimeout(() => rej(new Error("getChats timeout")), GET_CHATS_TIMEOUT_MS)),
              ]) as Record<string, unknown>[];

              const groups = this.mapChatsToGroups(chats);
              s.cachedGroups = groups;
              s.chatCount = chats.length;
              s.groupCount = groups.filter((g) => g.isGroup).length;
              s.channelCount = groups.filter((g) => g.isChannel).length;
              s.groupDiscoveryStatus = "READY";
              s.groupDiscoveryMessage = `${s.groupCount} grup, ${s.channelCount} kanal bulundu.`;
              // Bağlantı CONNECTED kalır; READY = keşif tamam (legacy status alanı)
              if (s.status === "CONNECTED" || s.status === "SYNCING") {
                this.setStatus(s, "CONNECTED", null);
              }
              logger.info({
                sessionId,
                clientInstanceId: s.clientInstanceId,
                chatCount: s.chatCount,
                groupCount: s.groupCount,
                channelCount: s.channelCount,
                attempt: s.groupDiscoveryAttempt,
                durationMs: Date.now() - startedAt,
                operation: "group_discovery_ready",
              }, "wa: groups ready");
              return groups;
            }
          } catch (err) {
            // Timeout / Store not ready → bağlantı FAILED olmaz
            s.groupDiscoveryStatus = "RETRYING";
            s.groupDiscoveryMessage = "WhatsApp bağlı. Grup listesi hazırlanıyor.";
            logger.warn({
              err,
              sessionId,
              clientInstanceId: s.clientInstanceId,
              attempt: s.groupDiscoveryAttempt,
              operation: "group_discovery_retry",
            }, "wa: getChats retry (connection stays CONNECTED)");
          }
        }

        const elapsed = Date.now() - startedAt;
        const phase = deadlines.find((d) => elapsed < d.untilMs) ?? deadlines[deadlines.length - 1];
        await this.sleep(phase.intervalMs);
      }

      // Buraya yalnızca READY olmadan çıkılır — bağlantı FAILED yapılmaz
      s.groupDiscoveryStatus = "FAILED";
      s.groupDiscoveryMessage = s.groupDiscoveryMessage
        || "Grup listesi 3 dakikada alınamadı. «Sohbetleri Yeniden Yükle» deneyin.";
      return s.cachedGroups;
    })();

    s.groupDiscoveryPromise = promise;
    try {
      return await promise;
    } finally {
      s.groupDiscoveryPromise = null;
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

  /** Grup listesi — READY şartı yok; CONNECTED + activeClient yeterli. HTTP'yi 3 dk bloklamaz. */
  static async getChats(): Promise<WhatsAppGroup[]> {
    const client = this.getActiveClient();
    if (!client) {
      throw new WhatsAppModuleError("WhatsApp client yok", 503, "CLIENT_NOT_AVAILABLE");
    }
    if (!this.isConnected()) {
      throw new WhatsAppModuleError("WhatsApp bağlı değil", 503, "NOT_CONNECTED");
    }
    const s = this.state;
    if (s.groupDiscoveryStatus === "READY") return s.cachedGroups;
    // Keşfi başlat / devam ettir; kısa bekle, yoksa cache + LOADING dön
    void this.refreshGroups();
    if (s.groupDiscoveryPromise) {
      await Promise.race([
        s.groupDiscoveryPromise,
        this.sleep(12_000),
      ]);
    }
    return s.cachedGroups;
  }

  static async getGroups(): Promise<WhatsAppGroup[]> {
    const groups = await this.getChats();
    return groups.filter((c) => c.isGroup || c.isChannel);
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
