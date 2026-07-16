import fs from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { logger } from "../../lib/logger";
import {
  WhatsAppModuleError,
  classifyWhatsAppError,
  clearSessionAndCache,
  ensureAuthDir,
  formatPairingCode,
  getPuppeteerVersion,
  getSessionLock,
  getWwebjsVersion,
  hasLocalAuth,
  maskPhone,
  normalizeTurkishPhone,
  resolveAuthPath,
  resolveCachePath,
  resolveChromiumPath,
  sessionAuthDir,
  volumeWarning,
} from "./whatsapp.client";
import { attachWhatsAppEvents, type SessionRuntime, type WaClientLike } from "./whatsapp.events";
import { persistSessionMeta } from "./whatsapp.repository";
import {
  GET_CHATS_TIMEOUT_MS,
  PAIRING_COOLDOWN_MS,
  PAIRING_WAIT_MS,
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

/** Global singleton key — farklı import/cache kopyalarına karşı korur. */
const MANAGER_KEY = Symbol.for("ozelguvenlik.whatsapp.manager");

const STATUS_LOG_INTERVAL_MS = 30_000;

type WaClient = WaClientLike & {
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  getState: () => Promise<string | null>;
  getChatById: (id: string) => Promise<unknown>;
  requestPairingCode?: (phone: string, showNotification?: boolean, intervalMs?: number) => Promise<string>;
  pupPage?: {
    isClosed?: () => boolean;
    on?: (event: string, cb: (...args: unknown[]) => void) => void;
  } | null;
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
    throw new WhatsAppModuleError("whatsapp-web.js yüklenemedi", 500, "UNKNOWN_ERROR");
  }
}

function uiStatusFor(s: SessionRuntime, connectionStatus: ConnectionStatus): string {
  if (s.status === "RATE_LIMITED" || connectionStatus === "RATE_LIMITED") return "Çok fazla deneme yapıldı";
  if (connectionStatus === "CONNECTED" || s.status === "CONNECTED") return "Bağlandı";
  if (s.status === "AUTHENTICATED" || connectionStatus === "AUTHENTICATED") return "Telefonda kodu girin";
  if (s.status === "PAIRING_CODE_READY" || s.status === "PAIRING_READY") return "Eşleştirme kodu hazır";
  if (s.status === "WAITING_FOR_PAIRING") return "Kod bekleniyor";
  if (s.status === "DISCONNECTED" || connectionStatus === "DISCONNECTED") return "Bağlantı kesildi";
  if (s.status === "ERROR" || s.status === "FAILED" || connectionStatus === "FAILED") {
    if (s.lastErrorCode === "PAIRING_RATE_LIMITED") return "Çok fazla deneme yapıldı";
    return "Bağlantı kesildi";
  }
  if (s.starting || s.status === "INITIALIZING" || s.status === "STARTING" || s.status === "QR_READY") {
    return "Bağlantı hazırlanıyor";
  }
  return "Bağlantı hazırlanıyor";
}

/** Tek Client — yalnızca bu sınıfta new Client(). */
class WhatsAppManagerClass {
  private client: WaClient | null = null;
  private initializePromise: Promise<void> | null = null;
  private pairingInFlight = false;
  private lastPairingAt = 0;
  private lastPairingPhone: string | null = null;
  private recoveryInFlight = false;
  /** Panel / diagnostics için görünür */
  readonly managerInstanceId = randomUUID();
  private lastStatusLogAt = 0;

  private state: SessionRuntime = {
    sessionId: SESSION_ID,
    status: "IDLE",
    mode: null,
    qrDataUrl: null,
    pairingCode: null,
    phoneMasked: null,
    lastError: null,
    lastErrorCode: null,
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
    pairingScreenReady: false,
    waitingForPairingResolve: null,
    codeReadyResolve: null,
    corruptionRecoveryUsed: false,
  };

  private authPath = resolveAuthPath();
  private cachePath = resolveCachePath();

  getAuthPath(): string {
    return this.authPath;
  }

  private setStatus(
    s: SessionRuntime,
    status: WhatsAppSessionStatus,
    error?: string | null,
    errorCode?: string | null,
  ): void {
    s.status = status;
    s.updatedAt = new Date();
    if (error !== undefined) s.lastError = error;
    if (errorCode !== undefined) s.lastErrorCode = errorCode;
    if (status === "CONNECTED" || status === "READY") s.readyAt = new Date();
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

  private logLifecycle(event: string, extra: Record<string, unknown> = {}): void {
    const now = Date.now();
    if (now - this.lastStatusLogAt < STATUS_LOG_INTERVAL_MS && event !== "ready") return;
    this.lastStatusLogAt = now;
    logger.info({
      event,
      managerInstanceId: this.managerInstanceId,
      clientInstanceId: this.state.clientInstanceId,
      pid: process.pid,
      hostname: process.env.HOSTNAME ?? process.env.RAILWAY_SERVICE_NAME ?? "local",
      connectionState: this.getConnectionStatus(),
      discoveryState: this.state.groupDiscoveryStatus,
      isReady: this.isReady(),
      starting: this.isStarting(),
      hasInitializePromise: Boolean(this.initializePromise),
      hasDiscoveryPromise: Boolean(this.state.groupDiscoveryPromise),
      chatCount: this.state.chatCount,
      groupCount: this.state.groupCount,
      channelCount: this.state.channelCount,
      discoveryAttempt: this.state.groupDiscoveryAttempt,
      ...extra,
    }, `[WA_LIFECYCLE] ${event}`);
  }

  getStatus(sessionId = SESSION_ID): WhatsAppStatusDto {
    const s = this.state;
    const mode: ConnectionMode = s.mode ?? "qr";
    const inPairing = mode === "pairing_code";

    let connectionStatus: ConnectionStatus = "IDLE";
    if (s.status === "CONNECTED" || s.status === "READY" || s.status === "SYNCING") {
      connectionStatus = "CONNECTED";
    } else if (s.status === "AUTHENTICATED") {
      connectionStatus = "AUTHENTICATED";
    } else if (s.status === "RATE_LIMITED") {
      connectionStatus = "RATE_LIMITED";
    } else if (s.status === "ERROR" || s.status === "FAILED") {
      connectionStatus = "FAILED";
    } else if (s.status === "DISCONNECTED") {
      connectionStatus = "DISCONNECTED";
    } else if (
      s.starting
      || [
        "STARTING",
        "INITIALIZING",
        "QR_READY",
        "PAIRING_READY",
        "PAIRING_CODE_READY",
        "WAITING_FOR_PAIRING",
      ].includes(s.status)
    ) {
      connectionStatus = "CONNECTING";
    }

    const groupDiscoveryStatus: GroupDiscoveryStatus = s.groupDiscoveryStatus;
    const connected = connectionStatus === "CONNECTED";
    const authAccepted = connected || s.status === "AUTHENTICATED";
    const pairingDisplay = formatPairingCode(s.pairingCode);
    const cooldownLeft = Math.max(0, PAIRING_COOLDOWN_MS - (Date.now() - this.lastPairingAt));

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
      errorCode: s.lastErrorCode,
      uiStatus: uiStatusFor(s, connectionStatus),
      updatedAt: s.updatedAt.toISOString(),
      starting: s.starting,
      pairing: inPairing && !connected && !authAccepted,
      authAccepted,
      phase: s.status.toLowerCase(),
      sessionState: s.status,
      connectionMode: mode,
      mode,
      hasSession: hasLocalAuth(this.authPath, sessionId) || hasLocalAuth(this.authPath, "main"),
      volumeWarning: volumeWarning(this.authPath),
      qr: (inPairing || connected || authAccepted) ? null : s.qrDataUrl,
      pairingCode: (!inPairing || connected || authAccepted) ? null : pairingDisplay,
      expiresInSeconds: pairingDisplay && inPairing && !connected && !authAccepted ? 180 : null,
      phone: s.phoneMasked,
      phoneMasked: s.phoneMasked,
      chromePath: s.chromePath,
      chromiumVersion: null,
      browserOpen: Boolean(this.client),
      pairingMethodAvailable: true,
      pairingCooldownSeconds: Math.ceil(cooldownLeft / 1000),
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

  private getConnectionStatus(): ConnectionStatus {
    return this.getStatus().connectionStatus;
  }

  isConnected(): boolean {
    return ["CONNECTED", "READY", "SYNCING", "AUTHENTICATED"].includes(this.state.status)
      && Boolean(this.client);
  }

  isReady(): boolean {
    return this.isConnected();
  }

  hasSession(): boolean {
    return hasLocalAuth(this.authPath, SESSION_ID) || hasLocalAuth(this.authPath, "main");
  }

  isStarting(): boolean {
    return this.state.starting || Boolean(this.initializePromise) || this.pairingInFlight;
  }

  getClient(): WaClient | null {
    return this.client;
  }

  getActiveClient(): WaClient | null {
    return this.client;
  }

  getCachedGroups(): WhatsAppGroup[] {
    return this.state.cachedGroups;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async destroyClient(): Promise<void> {
    const existing = this.client;
    this.initializePromise = null;
    if (!existing) return;
    this.logLifecycle("destroy_start", { reason: "explicit" });
    try { existing.removeAllListeners?.(); } catch { /* ignore */ }
    try {
      await Promise.race([
        existing.destroy(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("destroy timeout")), 15_000)),
      ]);
    } catch (err) {
      logger.warn({ err }, "wa: destroy warning");
    }
    // Chromium kapanması için kısa bekleme
    await this.sleep(800);
    this.client = null;
    this.state.clientInstanceId = null;
    this.state.groupDiscoveryStatus = "NOT_STARTED";
    this.state.groupDiscoveryPromise = null;
    this.state.groupDiscoveryMessage = null;
    this.state.cachedGroups = [];
    this.state.chatCount = 0;
    this.state.groupCount = 0;
    this.state.channelCount = 0;
    this.state.pairingScreenReady = false;
    this.state.waitingForPairingResolve = null;
    this.state.codeReadyResolve = null;
    this.logLifecycle("destroy_done");
  }

  private handleCorruption = (err: unknown): void => {
    void this.recoverFromCorruptedCache(err);
  };

  /** Invariant / prefs IDB — en fazla bir kez otomatik kurtarma. */
  private async recoverFromCorruptedCache(err: unknown): Promise<void> {
    const s = this.state;
    if (s.corruptionRecoveryUsed || this.recoveryInFlight) {
      logger.warn({ operation: "corruption_skip" }, "wa: corruption recovery already used");
      return;
    }
    this.recoveryInFlight = true;
    s.corruptionRecoveryUsed = true;
    const classified = classifyWhatsAppError(err);
    logger.error({
      err,
      code: classified.code,
      operation: "corruption_recovery_start",
    }, "wa: CACHE_PROFILE_CORRUPTED — one-shot recovery");

    try {
      await this.destroyClient();
      const cleared = clearSessionAndCache(this.authPath, SESSION_ID, this.cachePath);
      logger.info({ ...cleared, authPath: this.authPath, cachePath: this.cachePath }, "wa: cache/session cleared");
      s.starting = false;
      s.pairingCode = null;
      s.qrDataUrl = null;
      s.mode = "pairing_code";
      s.pairingScreenReady = false;
      this.setStatus(s, "WAITING_FOR_PAIRING", classified.message, "CACHE_PROFILE_CORRUPTED");
    } finally {
      this.recoveryInFlight = false;
      this.pairingInFlight = false;
    }
  }

  /** Tek yerde new Client() — webVersion / RemoteWebCache YOK */
  private async createClient(opts?: {
    pairWithPhoneNumber?: { phoneNumber: string; showNotification?: boolean; intervalMs?: number };
  }): Promise<WaClient> {
    loadWwebjs();
    this.authPath = resolveAuthPath();
    this.cachePath = resolveCachePath();
    ensureAuthDir(this.authPath);
    const { executablePath, source } = resolveChromiumPath();
    const instanceId = randomUUID();

    const clientOpts: Record<string, unknown> = {
      authStrategy: new LocalAuthCtor!({ clientId: SESSION_ID, dataPath: this.authPath }),
      authTimeoutMs: 120_000,
      qrMaxRetries: 0,
      // webVersion / webVersionCache sabitlemesi YOK — wwebjs varsayılanı
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
          "--no-zygote",
          "--disable-extensions",
        ],
      },
      restartOnAuthFail: false,
    };
    if (opts?.pairWithPhoneNumber) {
      clientOpts.pairWithPhoneNumber = {
        phoneNumber: opts.pairWithPhoneNumber.phoneNumber,
        showNotification: opts.pairWithPhoneNumber.showNotification ?? true,
        intervalMs: opts.pairWithPhoneNumber.intervalMs ?? 180_000,
      };
    }

    const client = new ClientCtor!(clientOpts);

    this.state.chromePath = `${executablePath} (${source})`;
    this.state.clientInstanceId = instanceId;
    this.client = client;

    attachWhatsAppEvents(
      SESSION_ID,
      client,
      () => this.state,
      (s, status, error, errorCode) => this.setStatus(s, status, error, errorCode),
      (sid) => {
        this.logLifecycle("ready_hook", { sessionId: sid });
        queueMicrotask(() => { void this.refreshGroups(sid); });
      },
      this.handleCorruption,
    );

    this.logLifecycle("client_created", {
      authPath: this.authPath,
      cachePath: this.cachePath,
      executablePath,
      chromiumSource: source,
      wwebjsVersion: getWwebjsVersion(),
      pairing: Boolean(opts?.pairWithPhoneNumber),
    });
    return client;
  }

  private attachPageGuards(client: WaClient): void {
    const page = client.pupPage;
    if (!page?.on) return;
    const onErr = (err: unknown) => {
      const classified = classifyWhatsAppError(err);
      if (!classified.corrupted) return;
      this.setStatus(this.state, "ERROR", classified.message, classified.code);
      void this.recoverFromCorruptedCache(err);
    };
    try {
      page.on("pageerror", onErr);
      page.on("error", onErr);
    } catch { /* ignore */ }
  }

  private async runInitialize(client: WaClient): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = (async () => {
      // pupPage oluşunca corruption listener bağla
      const guard = (async () => {
        for (let i = 0; i < 120; i++) {
          if (client.pupPage) {
            this.attachPageGuards(client);
            return;
          }
          await this.sleep(250);
        }
      })();
      void guard;
      await client.initialize();
    })()
      .catch((err) => {
        const classified = classifyWhatsAppError(err);
        this.state.starting = false;
        this.setStatus(this.state, classified.code === "PAIRING_RATE_LIMITED" ? "RATE_LIMITED" : "ERROR", classified.message, classified.code);
        if (classified.corrupted) void this.recoverFromCorruptedCache(err);
        throw err;
      })
      .finally(() => {
        this.initializePromise = null;
      });
    return this.initializePromise;
  }

  private clientUsableForGroups(client: WaClient): { ok: boolean; reason?: string } {
    if (!client) return { ok: false, reason: "CLIENT_NOT_AVAILABLE" };
    if (typeof client.getChats !== "function") return { ok: false, reason: "GET_CHATS_MISSING" };
    if (client.pupPage && typeof client.pupPage.isClosed === "function" && client.pupPage.isClosed()) {
      return { ok: false, reason: "PAGE_CLOSED" };
    }
    return { ok: true };
  }

  private mapChatsToGroups(chats: Record<string, unknown>[]): WhatsAppGroup[] {
    const result: WhatsAppGroup[] = [];
    for (const chat of chats) {
      try {
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
      } catch (err) {
        logger.warn({ err, chatId: chat.id }, "wa: single chat normalize skipped");
      }
    }
    return result;
  }

  /**
   * CONNECTED (ready) sonrası grup keşfi — ilan taraması beklemez.
   */
  async refreshGroups(sessionId = SESSION_ID): Promise<WhatsAppGroup[]> {
    const s = this.state;
    if (s.groupDiscoveryPromise) return s.groupDiscoveryPromise;

    const promise = (async () => {
      const startedAt = Date.now();
      s.groupDiscoveryStartedAt = new Date();
      s.groupDiscoveryAttempt = 0;
      s.groupDiscoveryStatus = "LOADING";
      s.groupDiscoveryMessage = "WhatsApp bağlı. Gruplar yükleniyor.";
      this.logLifecycle("discovery_start");

      const deadlines = [
        { untilMs: 60_000, intervalMs: 5_000 },
        { untilMs: 180_000, intervalMs: 15_000 },
        { untilMs: 600_000, intervalMs: 30_000 },
      ];

      while (Date.now() - startedAt < 600_000) {
        if (!this.isConnected()) {
          s.groupDiscoveryStatus = "FAILED";
          s.groupDiscoveryMessage = "Bağlantı koptu — grup listesi alınamadı.";
          this.logLifecycle("discovery_failed", { reason: "not_connected" });
          break;
        }

        const client = this.getActiveClient();
        const usable = client ? this.clientUsableForGroups(client) : { ok: false, reason: "CLIENT_NOT_AVAILABLE" };
        s.groupDiscoveryAttempt += 1;

        if (!usable.ok || !client) {
          s.groupDiscoveryStatus = "RETRYING";
          s.groupDiscoveryMessage = "WhatsApp bağlı. Grup listesi hazırlanıyor.";
          this.logLifecycle("discovery_retry", { reason: usable.reason, attempt: s.groupDiscoveryAttempt });
        } else {
          try {
            let state: string | null = null;
            try { state = await client.getState(); } catch { /* ignore */ }
            if (state && state !== "CONNECTED") {
              s.groupDiscoveryStatus = "RETRYING";
              s.groupDiscoveryMessage = "WhatsApp bağlı. Grup listesi hazırlanıyor.";
              this.logLifecycle("discovery_retry", { reason: `state=${state}`, attempt: s.groupDiscoveryAttempt });
            } else {
              const chats = await Promise.race([
                client.getChats(),
                new Promise<never>((_, rej) =>
                  setTimeout(() => rej(new Error("getChats timeout")), GET_CHATS_TIMEOUT_MS)),
              ]) as Record<string, unknown>[];

              const groups = this.mapChatsToGroups(chats);
              // Tek sohbet bile gelse cache güncelle; boşsa retry planına devam et
              if (groups.length > 0 || chats.length > 0) {
                s.cachedGroups = groups;
                s.chatCount = chats.length;
                s.groupCount = groups.filter((g) => g.isGroup).length;
                s.channelCount = groups.filter((g) => g.isChannel).length;
              }

              if (groups.length > 0) {
                s.groupDiscoveryStatus = "READY";
                s.groupDiscoveryMessage = `${s.groupCount} grup, ${s.channelCount} kanal bulundu.`;
                if (s.status === "CONNECTED" || s.status === "SYNCING") {
                  this.setStatus(s, "CONNECTED", null, null);
                }
                this.logLifecycle("discovery_ready", {
                  chatCount: s.chatCount,
                  groupCount: s.groupCount,
                  channelCount: s.channelCount,
                  attempt: s.groupDiscoveryAttempt,
                  durationMs: Date.now() - startedAt,
                });
                return groups;
              }

              // WhatsApp Web henüz sohbet listesini doldurmamış; client'i kapatma
              s.groupDiscoveryStatus = "RETRYING";
              s.groupDiscoveryMessage = "WhatsApp bağlı. Grup listesi hazırlanıyor.";
              this.logLifecycle("discovery_empty", {
                chatCount: chats.length,
                attempt: s.groupDiscoveryAttempt,
              });
            }
          } catch (err) {
            s.groupDiscoveryStatus = "RETRYING";
            s.groupDiscoveryMessage = "WhatsApp bağlı. Grup listesi hazırlanıyor.";
            this.logLifecycle("discovery_error", {
              err: err instanceof Error ? err.message : String(err),
              attempt: s.groupDiscoveryAttempt,
            });
          }
        }

        const elapsed = Date.now() - startedAt;
        const phase = deadlines.find((d) => elapsed < d.untilMs) ?? deadlines[deadlines.length - 1];
        await this.sleep(phase.intervalMs);
      }

      s.groupDiscoveryStatus = "FAILED";
      s.groupDiscoveryMessage = s.groupDiscoveryMessage
        || "Grup listesi 10 dakikada alınamadı. «Sohbetleri Yeniden Yükle» deneyin.";
      this.logLifecycle("discovery_failed", { reason: "timeout", cachedGroups: s.cachedGroups.length });
      return s.cachedGroups;
    })();

    s.groupDiscoveryPromise = promise;
    try {
      return await promise;
    } finally {
      s.groupDiscoveryPromise = null;
    }
  }

  async init(): Promise<void> {
    this.logLifecycle("manager_init");
    // İlk deploy: bozuk HTML cache'i bir kez temizle (oturumu silmez)
    try {
      const marker = `${this.cachePath}/.cache-cleared-v1347`;
      if (!fs.existsSync(marker)) {
        if (fs.existsSync(this.cachePath)) {
          fs.rmSync(this.cachePath, { recursive: true, force: true });
          logger.info({ cachePath: this.cachePath }, "wa: one-time cache clear (v1.34.7)");
        }
        ensureAuthDir(this.cachePath);
        fs.writeFileSync(marker, new Date().toISOString());
      }
    } catch (err) {
      logger.warn({ err }, "wa: one-time cache clear skipped");
    }

    if (!this.hasSession()) {
      logger.info({ authPath: this.authPath, sessionId: SESSION_ID }, "wa: no local auth — waiting for panel");
      return;
    }
    try {
      await this.connectQr({ restore: true });
    } catch (err) {
      logger.warn({ err }, "wa: auto restore failed");
    }
  }

  async connectQr(opts?: { restore?: boolean }) {
    return getSessionLock(SESSION_ID).runExclusive(async () => {
      const s = this.state;
      if (this.pairingInFlight || (s.mode === "pairing_code" && s.starting)) {
        throw new WhatsAppModuleError(
          "Onay kodu bağlantısı devam ediyor. Önce iptal edin veya bekleyin.",
          409,
          "PAIRING_IN_PROGRESS",
        );
      }
      if (this.client && ["READY", "CONNECTED", "SYNCING", "AUTHENTICATED"].includes(s.status)) {
        return this.getStatus();
      }
      if (this.initializePromise) {
        throw new WhatsAppModuleError("WhatsApp client başlatılıyor.", 409, "CLIENT_INITIALIZING");
      }

      await this.destroyClient();
      s.sessionId = SESSION_ID;
      s.mode = "qr";
      s.pairingCode = null;
      s.qrDataUrl = null;
      s.phoneMasked = null;
      s.starting = true;
      s.lastError = null;
      s.lastErrorCode = null;
      s.pairingScreenReady = false;
      this.setStatus(s, "INITIALIZING", null, null);

      const client = await this.createClient();
      void this.runInitialize(client).catch((err) => {
        logger.error({ err, operation: "initialize" }, "wa: initialize failed");
      });

      this.logLifecycle("connect_qr", { restore: Boolean(opts?.restore) });
      return this.getStatus();
    });
  }

  /**
   * Pairing akışı:
   * 1) normalize phone
   * 2) singleton initialize (pairWithPhoneNumber veya qr→requestPairingCode)
   * 3) WAITING_FOR_PAIRING bekle (max 90s)
   * 4) kodu bir kez al → PAIRING_CODE_READY
   */
  async connectPairing(phoneNumber: string) {
    return getSessionLock(SESSION_ID).runExclusive(async () => {
      const normalized = normalizeTurkishPhone(phoneNumber);
      if (!normalized) {
        throw new WhatsAppModuleError(
          "Geçersiz telefon numarası. 05xx, 5xx veya 905xx formatını kullanın.",
          400,
          "INVALID_PHONE",
        );
      }

      const now = Date.now();
      if (this.pairingInFlight) {
        throw new WhatsAppModuleError(
          "Eşleştirme kodu isteği zaten devam ediyor.",
          409,
          "PAIRING_IN_PROGRESS",
        );
      }
      if (
        this.lastPairingAt
        && now - this.lastPairingAt < PAIRING_COOLDOWN_MS
        && this.lastPairingPhone === normalized
      ) {
        const waitSec = Math.ceil((PAIRING_COOLDOWN_MS - (now - this.lastPairingAt)) / 1000);
        this.setStatus(this.state, "RATE_LIMITED", "Çok fazla kod istendi. Bir süre bekleyip tekrar deneyin.", "PAIRING_RATE_LIMITED");
        throw new WhatsAppModuleError(
          `Çok fazla kod istendi. ${waitSec} saniye bekleyip tekrar deneyin.`,
          429,
          "PAIRING_RATE_LIMITED",
        );
      }
      if (this.initializePromise) {
        throw new WhatsAppModuleError("WhatsApp client başlatılıyor.", 409, "CLIENT_INITIALIZING");
      }

      const s = this.state;
      if (s.mode === "qr" && s.starting && this.client) {
        throw new WhatsAppModuleError(
          "QR bağlantısı devam ediyor. Önce iptal edin.",
          409,
          "PAIRING_IN_PROGRESS",
        );
      }

      this.pairingInFlight = true;
      this.lastPairingAt = now;
      this.lastPairingPhone = normalized;

      try {
        await this.destroyClient();
        s.sessionId = SESSION_ID;
        s.mode = "pairing_code";
        s.qrDataUrl = null;
        s.pairingCode = null;
        s.phoneMasked = maskPhone(normalized);
        s.starting = true;
        s.lastError = null;
        s.lastErrorCode = null;
        s.pairingScreenReady = false;
        this.setStatus(s, "INITIALIZING", null, null);

        // wwebjs: AuthStore hazır olunca otomatik requestPairingCode
        const client = await this.createClient({
          pairWithPhoneNumber: {
            phoneNumber: normalized,
            showNotification: true,
            intervalMs: 180_000,
          },
        });

        const codePromise = new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            s.codeReadyResolve = null;
            reject(new WhatsAppModuleError(
              "Eşleştirme kodu zaman aşımına uğradı. Tekrar deneyin.",
              504,
              "PAIRING_TIMEOUT",
            ));
          }, PAIRING_WAIT_MS);
          s.codeReadyResolve = (code) => {
            clearTimeout(timer);
            resolve(code);
          };
        });

        const waitScreen = new Promise<void>((resolve) => {
          if (s.pairingScreenReady) {
            resolve();
            return;
          }
          const timer = setTimeout(() => resolve(), PAIRING_WAIT_MS);
          s.waitingForPairingResolve = () => {
            clearTimeout(timer);
            resolve();
          };
        });

        void this.runInitialize(client).catch((err) => {
          const classified = classifyWhatsAppError(err);
          logger.error({
            err,
            code: classified.code,
            phoneMasked: s.phoneMasked,
            operation: "pairing_initialize",
          }, "wa: pairing initialize failed");
        });

        // Eşleştirme ekranı / kod için bekle
        await waitScreen;
        if (!s.pairingCode) this.setStatus(s, "WAITING_FOR_PAIRING", null, null);

        let code: string | null = s.pairingCode;
        if (!code) {
          // pairWithPhoneNumber kod üretmediyse — ekran hazırsa bir kez manuel iste
          if (s.pairingScreenReady && typeof client.requestPairingCode === "function") {
            try {
              const raw = await client.requestPairingCode(normalized, true, 180_000);
              const formatted = formatPairingCode(String(raw));
              if (formatted) {
                code = formatted;
                s.pairingCode = formatted;
                this.setStatus(s, "PAIRING_CODE_READY", null, null);
                logger.info({
                  pairingCode: formatted,
                  phoneMasked: s.phoneMasked,
                  operation: "pairing_code_manual",
                }, "wa: pairing code via requestPairingCode");
              }
            } catch (err) {
              const classified = classifyWhatsAppError(err);
              if (classified.corrupted) {
                await this.recoverFromCorruptedCache(err);
                throw new WhatsAppModuleError(classified.message, 503, classified.code);
              }
              if (classified.code === "PAIRING_RATE_LIMITED") {
                this.setStatus(s, "RATE_LIMITED", classified.message, classified.code);
                throw new WhatsAppModuleError(classified.message, 429, classified.code);
              }
              // code event'i beklemeye düş
              logger.warn({ err, code: classified.code }, "wa: requestPairingCode failed, waiting code event");
            }
          }
        }

        if (!code) {
          code = await codePromise;
        }

        s.pairingCode = formatPairingCode(code) ?? code;
        this.setStatus(s, "PAIRING_CODE_READY", null, null);
        this.logLifecycle("pairing_ready", { phoneMasked: s.phoneMasked });

        return this.getStatus();
      } catch (err) {
        const classified = classifyWhatsAppError(err);
        if (err instanceof WhatsAppModuleError) {
          this.setStatus(this.state, err.code === "PAIRING_RATE_LIMITED" ? "RATE_LIMITED" : "ERROR", err.message, err.code);
          throw err;
        }
        if (classified.corrupted) {
          await this.recoverFromCorruptedCache(err);
          throw new WhatsAppModuleError(classified.message, 503, "CACHE_PROFILE_CORRUPTED");
        }
        this.setStatus(this.state, "ERROR", classified.message, classified.code);
        throw new WhatsAppModuleError(classified.message, 500, classified.code);
      } finally {
        this.pairingInFlight = false;
      }
    });
  }

  async disconnect(): Promise<void> {
    return getSessionLock(SESSION_ID).runExclusive(async () => {
      await this.destroyClient();
      const s = this.state;
      s.starting = false;
      s.qrDataUrl = null;
      s.pairingCode = null;
      s.mode = null;
      this.setStatus(s, "DISCONNECTED", null, null);
    });
  }

  /**
   * Admin «Sıfırla»: destroy → chromium bekle → auth+cache sil → singleton sıfırla.
   * Her restart'ta çağrılmaz — sadece panel.
   */
  async resetSession(): Promise<void> {
    return getSessionLock(SESSION_ID).runExclusive(async () => {
      await this.destroyClient();
      const cleared = clearSessionAndCache(this.authPath, SESSION_ID, this.cachePath);
      // Eski session-main
      try {
        const legacy = sessionAuthDir(this.authPath, "main");
        if (fs.existsSync(legacy)) fs.rmSync(legacy, { recursive: true, force: true });
      } catch { /* ignore */ }

      const s = this.state;
      s.starting = false;
      s.qrDataUrl = null;
      s.pairingCode = null;
      s.mode = null;
      s.readyAt = null;
      s.phoneMasked = null;
      s.lastError = null;
      s.lastErrorCode = null;
      s.pairingScreenReady = false;
      s.corruptionRecoveryUsed = false;
      this.pairingInFlight = false;
      this.lastPairingAt = 0;
      this.lastPairingPhone = null;
      this.setStatus(s, "IDLE", null, null);
      logger.info({
        authPath: this.authPath,
        cachePath: this.cachePath,
        ...cleared,
        operation: "reset",
      }, "wa: session + cache reset");
    });
  }

  async getChats(): Promise<WhatsAppGroup[]> {
    const client = this.getActiveClient();
    if (!client) {
      throw new WhatsAppModuleError("WhatsApp client yok", 503, "CLIENT_NOT_READY");
    }
    if (!this.isConnected()) {
      throw new WhatsAppModuleError("WhatsApp bağlı değil", 503, "CLIENT_NOT_READY");
    }
    const s = this.state;
    if (s.groupDiscoveryStatus === "READY") return s.cachedGroups;
    void this.refreshGroups();
    if (s.groupDiscoveryPromise) {
      await Promise.race([
        s.groupDiscoveryPromise,
        this.sleep(12_000),
      ]);
    }
    return s.cachedGroups;
  }

  async getGroups(): Promise<WhatsAppGroup[]> {
    const groups = await this.getChats();
    return groups.filter((c) => c.isGroup || c.isChannel);
  }

  async getChatById(chatId: string) {
    const client = this.client;
    if (!client) throw new WhatsAppModuleError("WhatsApp bağlı değil", 409, "CLIENT_NOT_READY");
    return client.getChatById(chatId);
  }

  ensureAutoConnect(): void {
    if (this.isReady() || this.isStarting()) return;
    if (!this.hasSession()) return;
    void this.connectQr({ restore: true }).catch(() => undefined);
  }
}

/** Global singleton — farklı import/cache kopyalarına karşı korur. */
function getGlobalManager(): WhatsAppManagerClass {
  const g = globalThis as unknown as Record<symbol, WhatsAppManagerClass | undefined>;
  if (!g[MANAGER_KEY]) {
    g[MANAGER_KEY] = new WhatsAppManagerClass();
  }
  return g[MANAGER_KEY];
}

export const WhatsAppManager = getGlobalManager();

/** Eski API adı uyumu */
export class WhatsAppStartError extends WhatsAppModuleError {
  constructor(message: string, statusCode = 500, code = "UNKNOWN_ERROR") {
    super(message, statusCode, code);
    this.name = "WhatsAppStartError";
  }
}
