import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { logger } from "../lib/logger";

export type ConnectionMode = "qr" | "pairing_code";
export type ConnectionStatus =
  | "IDLE"
  | "CONNECTING"
  | "AUTHENTICATED"
  | "CONNECTED"
  | "DISCONNECTED"
  | "FAILED";
export type SyncStatus =
  | "NOT_STARTED"
  | "WAITING"
  | "LOADING"
  | "READY"
  | "RETRYING"
  | "TIMED_OUT";
export type WhatsAppSessionState =
  | "IDLE"
  | "STARTING"
  | "QR_READY"
  | "PAIRING_CODE_REQUESTING"
  | "PAIRING_CODE_READY"
  | "AUTHENTICATED"
  | "SYNCING"
  | "READY"
  | "FAILED"
  | "DISCONNECTED"
  | "DESTROYING"
  | "SYNC_TIMEOUT"; // sync TIMED_OUT uyumluluk; bağlantı FAILED değildir

/** Tek session kuralı — tüm endpoint'ler aynı Map üzerinden activeClient kullanır */
const clients = new Map<string, any>();
const sessionStates = new Map<string, WhatsAppSessionState>();
const sessionLocks = new Map<string, Promise<void>>();

let client: any = null;
let isReady = false;
let qrDataUrl: string | null = null;
let pairingCode: string | null = null;
let pairingCodeReadyAt = 0;
let lastError: string | null = null;
let starting = false;
let pendingPhone: string | null = null;
/** true = kullanıcı onay kodu istedi; QR asla UI'ya gitmez */
let pairingIntent = false;
let pairingCodeRequested = false;
/** Telefon kodu/QR kabul etti; ready henüz gelmedi */
let authAccepted = false;
let ClientCtor: any = null;
let LocalAuthCtor: any = null;
/** Admin «Bağlantıyı Kes» — otomatik yeniden bağlanma yapma */
let manualStop = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let chatSyncPollTimer: ReturnType<typeof setTimeout> | null = null;
let chatSyncStartedAt = 0;
let chatSyncLoopActive = false;
let sessionSoftRestartTried = false;
let readySyncTriggerTried = false;
let initializePromise: Promise<void> | null = null;
let pairingRequestPromise: Promise<string> | null = null;
let chatSyncPromise: Promise<void> | null = null;
/** @deprecated clientPhase; yerine sessionState kullan */
let clientPhase: "IDLE" | "INITIALIZING" | "AUTHENTICATED" | "READY" | "DESTROYING" | "FAILED" = "IDLE";
let connectionMode: ConnectionMode = "qr";
let sessionState: WhatsAppSessionState = "IDLE";
let connectionStatus: ConnectionStatus = "IDLE";
let syncStatus: SyncStatus = "NOT_STARTED";
let syncAttempt = 0;
let syncStartedAt: string | null = null;
let lastSyncError: string | null = null;
let startingSince = 0;
let sessionLock: Promise<void> = Promise.resolve();
let chatCount = 0;
let groupCount = 0;
let lastWhatsAppState: string | null = null;
let statusUpdatedAt: string = new Date().toISOString();
let clientInstanceSeq = 0;

const WA_CLIENT_ID = "ozelguvenlik";
const WA_PAIR_CLIENT_ID = "ozelguvenlik-pair";
const WWEBJS_VERSION = "1.34.7";
const STALE_STARTING_MS = 60_000;
const PAIRING_CODE_TTL_SEC = 180;
/** Tek getChats çağrısı için üst süre */
const GET_CHATS_TIMEOUT_MS = 120_000;
/** Toplam sohbet senkron deneme penceresi (bağlantıyı FAILED yapmaz) */
const CHAT_SYNC_TOTAL_MS = 10 * 60_000;
const PROTOCOL_TIMEOUT_MS = 300_000;

/** Railway volume: WHATSAPP_AUTH_PATH veya WWEBJS_AUTH_PATH; ephemeral ./ .wwebjs_auth yalnızca local */
const AUTH_PATH =
  process.env.WHATSAPP_AUTH_PATH
  || process.env.WWEBJS_AUTH_PATH
  || (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? "/data/whatsapp-auth"
    : "./.wwebjs_auth");

function setActiveClient(next: any | null): void {
  client = next;
  if (next) clients.set(WA_CLIENT_ID, next);
  else clients.delete(WA_CLIENT_ID);
}

function getActiveClient(): any | null {
  return clients.get(WA_CLIENT_ID) ?? client ?? null;
}

function clientInstanceId(c: any): string {
  if (!c) return "null";
  if (typeof c.__waInstanceId !== "string") {
    clientInstanceSeq += 1;
    c.__waInstanceId = `wa-${WA_CLIENT_ID}-${clientInstanceSeq}`;
  }
  return c.__waInstanceId as string;
}

export class WhatsAppStartError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 409 | 503 | 500,
    public readonly code: string,
  ) {
    super(message);
    this.name = "WhatsAppStartError";
  }
}

export type WhatsAppStartResult = {
  success: true;
  mode: ConnectionMode;
  status: WhatsAppSessionState | "PAIRING_CODE_READY" | "QR_READY" | "READY" | "STARTING";
  phase: string;
  pairingCode: string | null;
  expiresInSeconds?: number;
  qr: string | null;
  message: string;
};

function setSessionState(next: WhatsAppSessionState, extra?: Record<string, unknown>): void {
  const previousState = sessionState;
  sessionState = next;
  sessionStates.set(WA_CLIENT_ID, next);
  statusUpdatedAt = new Date().toISOString();
  if (next === "STARTING" || next === "PAIRING_CODE_REQUESTING") {
    clientPhase = "INITIALIZING";
    if (connectionStatus === "IDLE" || connectionStatus === "FAILED" || connectionStatus === "DISCONNECTED") {
      connectionStatus = "CONNECTING";
    }
  } else if (next === "QR_READY" || next === "PAIRING_CODE_READY") {
    clientPhase = "IDLE";
    connectionStatus = "CONNECTING";
  } else if (next === "AUTHENTICATED") {
    clientPhase = "AUTHENTICATED";
    connectionStatus = "AUTHENTICATED";
  } else if (next === "SYNCING" || next === "SYNC_TIMEOUT") {
    clientPhase = "AUTHENTICATED";
    if (connectionStatus !== "FAILED" && connectionStatus !== "DISCONNECTED") {
      connectionStatus = "CONNECTED";
    }
  } else if (next === "READY") {
    clientPhase = "READY";
    connectionStatus = "CONNECTED";
    syncStatus = "READY";
  } else if (next === "DESTROYING") {
    clientPhase = "DESTROYING";
  } else if (next === "FAILED") {
    clientPhase = "FAILED";
    connectionStatus = "FAILED";
  } else if (next === "DISCONNECTED") {
    clientPhase = "FAILED";
    connectionStatus = "DISCONNECTED";
  } else if (next === "IDLE") {
    clientPhase = "IDLE";
    connectionStatus = "IDLE";
    syncStatus = "NOT_STARTED";
  }
  logger.info(
    {
      sessionId: WA_CLIENT_ID,
      previousState,
      sessionState: next,
      connectionStatus,
      syncStatus,
      connectionMode,
      ...extra,
    },
    "wa: session state",
  );
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
}

function formatPairingCodeDisplay(code: string): string {
  const plain = code.replace(/\s|-/g, "").toUpperCase();
  if (plain.length === 8) return `${plain.slice(0, 4)}-${plain.slice(4)}`;
  return plain;
}

function buildCurrentStartResult(message?: string): WhatsAppStartResult {
  const readyCode = pairingCode && connectionMode === "pairing_code" ? pairingCode : null;
  const readyQr = connectionMode === "qr" ? qrDataUrl : null;
  const status: WhatsAppStartResult["status"] = isReady
    ? "READY"
    : readyCode
      ? "PAIRING_CODE_READY"
      : readyQr
        ? "QR_READY"
        : sessionState === "STARTING" || sessionState === "PAIRING_CODE_REQUESTING"
          ? "STARTING"
          : sessionState;
  return {
    success: true,
    mode: connectionMode,
    status,
    phase: status.toLowerCase(),
    pairingCode: readyCode ? formatPairingCodeDisplay(readyCode) : null,
    expiresInSeconds: readyCode
      ? Math.max(0, PAIRING_CODE_TTL_SEC - Math.floor((Date.now() - pairingCodeReadyAt) / 1000))
      : undefined,
    qr: readyQr,
    message: message
      ?? (readyCode
        ? "Onay kodu hazır. WhatsApp uygulamanızdan girin."
        : readyQr
          ? "QR kodu hazır. WhatsApp → Bağlı Cihazlar → Cihaz bağla."
          : isReady
            ? "WhatsApp bağlantısı hazır."
            : "WhatsApp bağlantısı hazırlanıyor. Lütfen birkaç saniye bekleyin."),
  };
}

async function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = sessionLocks.get(WA_CLIENT_ID) ?? sessionLock;
  let release!: () => void;
  const nextLock = new Promise<void>((resolve) => { release = resolve; });
  sessionLocks.set(WA_CLIENT_ID, nextLock);
  sessionLock = nextLock;
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

async function collectClientDiagnostics(c: any): Promise<Record<string, unknown>> {
  let waState: string | null = null;
  try {
    waState = c?.getState ? String(await c.getState() ?? "") : null;
  } catch (error) {
    waState = `error:${error instanceof Error ? error.message : String(error)}`;
  }
  if (waState && !waState.startsWith("error:")) lastWhatsAppState = waState.toUpperCase();
  const page = c?.pupPage;
  return {
    sessionId: WA_CLIENT_ID,
    clientInstanceId: clientInstanceId(c),
    connectionMode,
    previousState: sessionState,
    clientInfoPresent: Boolean(c?.info),
    pupPagePresent: Boolean(page),
    pupPageOpen: Boolean(page && !page.isClosed?.()),
    whatsappState: waState,
    eventAt: new Date().toISOString(),
  };
}

function isBusyStarting(): boolean {
  return starting
    || Boolean(initializePromise)
    || sessionState === "STARTING"
    || sessionState === "PAIRING_CODE_REQUESTING"
    || clientPhase === "INITIALIZING";
}

async function clearStaleStartingIfNeeded(): Promise<boolean> {
  if (!isBusyStarting() || !startingSince) return false;
  if (Date.now() - startingSince < STALE_STARTING_MS) return false;
  logger.warn(
    { sessionId: WA_CLIENT_ID, startingSince, elapsedMs: Date.now() - startingSince },
    "wa: stale STARTING — client temizleniyor",
  );
  const old = getActiveClient();
  setActiveClient(null);
  starting = false;
  initializePromise = null;
  pairingRequestPromise = null;
  if (old) await destroyWhatsAppClientInstance(old, "stale_starting");
  isReady = false;
  chatCount = 0;
  groupCount = 0;
  setSessionState("FAILED", { reason: "stale_starting" });
  lastError = "WhatsApp bağlantısı zaman aşımına uğradı. Yeniden başlatın.";
  return true;
}

export function hasWhatsAppLocalSession(): boolean {
  try {
    const sessionDir = path.join(AUTH_PATH, `session-${WA_CLIENT_ID}`);
    if (fs.existsSync(sessionDir)) return true;
    if (!fs.existsSync(AUTH_PATH)) return false;
    const entries = fs.readdirSync(AUTH_PATH);
    return entries.some((e) => e.startsWith("session-") && !e.includes("-pair"));
  } catch {
    return false;
  }
}

export function isWhatsAppStarting(): boolean {
  return starting
    || sessionState === "STARTING"
    || sessionState === "PAIRING_CODE_REQUESTING"
    || sessionState === "AUTHENTICATED"
    || sessionState === "SYNCING"
    || clientPhase === "INITIALIZING"
    || clientPhase === "AUTHENTICATED";
}

/** Kayıtlı oturum varsa arka planda yeniden bağlan (sıfırlama gerekmez) */
export function ensureWhatsAppAutoConnect(): void {
  if (manualStop || isReady || starting) return;
  if (process.env.WA_AUTO_CONNECT === "0") return;
  if (!hasWhatsAppLocalSession() && process.env.WA_AUTO_CONNECT !== "1") return;
  void startWhatsAppClient({ mode: "qr" }).catch((e) => {
    logger.warn({ err: e }, "wa: auto-connect failed");
  });
}

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/snap/bin/chromium",
].filter(Boolean) as string[];

export interface WhatsAppChannel {
  id: string;
  name: string;
  participants: number;
  kind: "group" | "channel";
}

export interface WhatsAppMessage {
  id: string;
  remoteJid: string;
  text: string;
  imageUrl?: string;
  timestamp: number;
}

function resolveExecutablePath(): string {
  for (const p of CHROME_CANDIDATES) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  throw new Error(
    "Chromium bulunamadı. Sunucu imajında chromium kurulu olmalı " +
    "(PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium). Deploy sonrası yeniden deneyin.",
  );
}

function readChromiumVersion(executablePath: string): string | null {
  try {
    return execFileSync(executablePath, ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

async function loadWhatsAppLib(): Promise<void> {
  if (ClientCtor && LocalAuthCtor) return;
  const pkg = await import("whatsapp-web.js");
  const mod = (pkg as any).default ?? pkg;
  ClientCtor = mod.Client;
  LocalAuthCtor = mod.LocalAuth;
  if (!ClientCtor || !LocalAuthCtor) {
    throw new Error("whatsapp-web.js yüklenemedi (Client/LocalAuth yok).");
  }
}

export function normalizeTurkishWhatsAppPhone(raw: string): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  while (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("90")) d = `90${d}`;
  return d;
}

function isValidWaPhone(phone: string): boolean {
  // Türkiye: 90 + 10 haneli GSM (5xxxxxxxxx)
  return /^905\d{9}$/.test(phone);
}

function clearWhatsAppLocalSession(clientId = WA_CLIENT_ID): void {
  try {
    const targets = [
      path.join(AUTH_PATH, `session-${clientId}`),
      path.join(AUTH_PATH, `session-${WA_PAIR_CLIENT_ID}`),
      path.join(AUTH_PATH, clientId),
    ];
    for (const sessionDir of targets) {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info({ sessionDir }, "wa: LocalAuth oturumu silindi");
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "wa: session temizlenemedi");
  }
}

function setPairingCode(code: string | null): void {
  if (!code) return;
  const raw = String(code).replace(/\s+/g, "").toUpperCase();
  if (raw.length < 6) return;
  pairingCode = raw;
  pairingCodeReadyAt = Date.now();
  qrDataUrl = null;
  lastError = null;
  setSessionState("PAIRING_CODE_READY", { codeLength: raw.length });
  logger.info({ sessionId: WA_CLIENT_ID, codeLen: raw.length }, "wa: pairing code received");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function requestPairingCodeWithRetry(c: any, phone: string): Promise<string> {
  const methodAvailable = Boolean(c && typeof c.requestPairingCode === "function");
  logger.info(
    { sessionId: WA_CLIENT_ID, methodAvailable, wwebjsVersion: WWEBJS_VERSION },
    "wa: pairing code metodu kontrol edildi",
  );
  if (!methodAvailable) {
    throw new WhatsAppStartError(
      `whatsapp-web.js ${WWEBJS_VERSION} içinde requestPairingCode metodu yok.`,
      503,
      "PAIRING_CODE_NOT_SUPPORTED",
    );
  }
  if (!c.pupPage || !c.pupBrowser?.isConnected?.()) {
    throw new WhatsAppStartError(
      "WhatsApp tarayıcısı henüz hazır değil. Chromium başlatılamadı veya bağlantı koptu.",
      503,
      "BROWSER_NOT_READY",
    );
  }

  let lastFailure: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      logger.info({ sessionId: WA_CLIENT_ID, attempt }, "wa: requestPairingCode çağrılıyor");
      const code = await withTimeout(
        Promise.resolve(c.requestPairingCode(phone, true, 180_000)),
        15_000,
        `requestPairingCode ${attempt}. denemede 15 saniye içinde yanıt vermedi`,
      );
      const normalizedCode = String(code ?? "").replace(/\s+/g, "").toUpperCase();
      if (normalizedCode.length < 6) {
        throw new Error("WhatsApp boş veya geçersiz pairing code döndürdü");
      }
      setPairingCode(normalizedCode);
      logger.info({ sessionId: WA_CLIENT_ID, attempt, codeLength: normalizedCode.length }, "wa: pairing code alındı");
      return normalizedCode;
    } catch (error) {
      lastFailure = error;
      logger.error({ err: error, sessionId: WA_CLIENT_ID, attempt }, "wa: requestPairingCode başarısız");
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  const detail = lastFailure instanceof Error ? lastFailure.message : String(lastFailure);
  throw new WhatsAppStartError(
    `Onay kodu alınamadı: ${detail}`,
    503,
    "PAIRING_CODE_FAILED",
  );
}

function beginPairingCodeRequest(c: any, phone: string): Promise<string> {
  if (pairingCode) return Promise.resolve(pairingCode);
  if (pairingRequestPromise) return pairingRequestPromise;
  pairingCodeRequested = true;
  setSessionState("PAIRING_CODE_REQUESTING", { phoneMasked: maskPhone(phone) });
  pairingRequestPromise = requestPairingCodeWithRetry(c, phone)
    .finally(() => {
      pairingCodeRequested = false;
      pairingRequestPromise = null;
    });
  return pairingRequestPromise;
}

async function enableQrFallback(c: any, error: unknown): Promise<void> {
  // Pairing modunda QR asla gösterilmez; sadece hata bırakılır.
  const detail = error instanceof Error ? error.message : String(error);
  lastError = detail;
  logger.warn(
    { sessionId: WA_CLIENT_ID, connectionMode, err: detail },
    "wa: pairing başarısız — QR fallback kapalı (pairing_code modu)",
  );
  void c;
}

function attachHandlers(c: any): void {
  if (c.__waHandlersAttached) {
    logger.warn(
      { sessionId: WA_CLIENT_ID, clientInstanceId: clientInstanceId(c) },
      "wa: handlers zaten bağlı — tekrar eklenmedi",
    );
    return;
  }
  c.__waHandlersAttached = true;

  c.on("qr", async (qr: string) => {
    if (getActiveClient() !== c) return;
    if (connectionMode === "pairing_code" || pairingIntent) {
      logger.info(
        { ...(await collectClientDiagnostics(c)), event: "QR_IGNORED_IN_PAIRING_MODE" },
        "wa: QR_IGNORED_IN_PAIRING_MODE",
      );
      if (pendingPhone && !pairingCode) {
        void beginPairingCodeRequest(c, pendingPhone).catch((error) => {
          void enableQrFallback(c, error);
        });
      }
      return;
    }

    logger.info({ ...(await collectClientDiagnostics(c)), event: "qr" }, "wa: QR received");
    lastError = null;
    pairingCode = null;
    try {
      qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2, errorCorrectionLevel: "M" });
      setSessionState("QR_READY");
      logger.info({ sessionId: WA_CLIENT_ID }, "wa: QR data URL hazır");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  });

  c.on("code", (code: string) => {
    if (getActiveClient() !== c) return;
    if (connectionMode !== "pairing_code" && !pairingIntent) {
      logger.info({ sessionId: WA_CLIENT_ID }, "wa: code event ignored (not pairing mode)");
      return;
    }
    logger.info({ sessionId: WA_CLIENT_ID, event: "code" }, "wa: pairing_code/code event alındı");
    setPairingCode(code);
  });

  c.on("authenticated", () => {
    void (async () => {
      if (getActiveClient() !== c) return;
      const previousState = sessionState;
      authAccepted = true;
      pairingCode = null;
      qrDataUrl = null;
      connectionStatus = "AUTHENTICATED";
      if (syncStatus === "NOT_STARTED") syncStatus = "WAITING";
      setSessionState("AUTHENTICATED", { event: "authenticated" });
      lastError = "Telefon doğrulandı. Sohbetler arka planda yükleniyor.";
      logger.info(
        {
          ...(await collectClientDiagnostics(c)),
          previousState,
          newState: "AUTHENTICATED",
          connectionStatus,
          syncStatus,
          event: "authenticated",
        },
        "wa: authenticated",
      );
      setSessionState("SYNCING", { event: "authenticated_to_syncing" });
      scheduleChatSyncLoop();
      queueMicrotask(() => { void runChatSyncAttempt("authenticated"); });
    })();
  });

  c.on("ready", () => {
    if (getActiveClient() !== c) return;
    authAccepted = true;
    logger.info(
      {
        sessionId: WA_CLIENT_ID,
        clientInstanceId: clientInstanceId(c),
        connectionMode,
        previousState: sessionState,
        connectionStatus,
        syncStatus,
        event: "ready",
        eventAt: new Date().toISOString(),
      },
      "wa: ready event",
    );
    markConnectionConnected("ready_event");
    queueMicrotask(() => { void runChatSyncAttempt("ready_event"); });
  });

  c.on("change_state", (state: string) => {
    void (async () => {
      if (getActiveClient() !== c) return;
      const waState = String(state ?? "").toUpperCase();
      lastWhatsAppState = waState;
      logger.info(
        {
          ...(await collectClientDiagnostics(c)),
          event: "change_state",
          changeState: waState,
          connectionStatus,
          syncStatus,
        },
        "wa: change_state",
      );
      if (waState === "CONNECTED") {
        markConnectionConnected("change_state");
        queueMicrotask(() => { void runChatSyncAttempt("change_state"); });
      }
    })();
  });

  c.on("loading_screen", (percent: string, message: string) => {
    void (async () => {
      if (getActiveClient() !== c) return;
      logger.info(
        { ...(await collectClientDiagnostics(c)), event: "loading_screen", percent, message, syncStatus },
        "wa: loading_screen",
      );
      if (authAccepted && !isReady) {
        lastError = `WhatsApp bağlantısı başarılı. Sohbetler yükleniyor… %${percent}`;
        if (syncStatus === "NOT_STARTED" || syncStatus === "WAITING") syncStatus = "LOADING";
      }
      const n = Number(percent);
      if (!Number.isNaN(n) && n >= 99 && authAccepted && !isReady) {
        queueMicrotask(() => { void runChatSyncAttempt("loading_99"); });
      }
    })();
  });

  c.on("disconnected", (reason: string) => {
    void (async () => {
      if (getActiveClient() !== c) return;
      logger.warn(
        { ...(await collectClientDiagnostics(c)), event: "disconnected", reason },
        "wa: disconnected",
      );
      connectionStatus = "DISCONNECTED";
      syncStatus = "NOT_STARTED";
      setSessionState("DISCONNECTED", { reason });
      isReady = false;
      authAccepted = false;
      readySyncTriggerTried = false;
      chatCount = 0;
      groupCount = 0;
      stopChatSyncLoop();
      stopWhatsAppWatchdog();
      setActiveClient(null);
      qrDataUrl = null;
      pairingCode = null;
      lastError = `Bağlantı koptu: ${reason}`;
      void destroyWhatsAppClientInstance(c, `disconnected:${reason}`).finally(() => {
        setSessionState("FAILED", { reason });
        scheduleWhatsAppReconnect(reason);
      });
    })();
  });

  c.on("auth_failure", (msg: string) => {
    void (async () => {
      if (getActiveClient() !== c) return;
      logger.error(
        { ...(await collectClientDiagnostics(c)), event: "auth_failure", message: msg },
        "wa: auth_failure",
      );
      connectionStatus = "FAILED";
      syncStatus = "NOT_STARTED";
      setSessionState("FAILED", { message: msg });
      isReady = false;
      authAccepted = false;
      readySyncTriggerTried = false;
      chatCount = 0;
      groupCount = 0;
      stopChatSyncLoop();
      stopWhatsAppWatchdog();
      setActiveClient(null);
      qrDataUrl = null;
      pairingCode = null;
      lastError = `Kimlik doğrulama hatası: ${msg}`;
      void destroyWhatsAppClientInstance(c, "auth_failure").finally(() => {
        setSessionState("FAILED");
        if (!manualStop && reconnectAttempts < 2) scheduleWhatsAppReconnect(`auth_failure:${msg}`);
      });
    })();
  });
}

function markConnectionConnected(reason: string): void {
  authAccepted = true;
  connectionStatus = "CONNECTED";
  pairingCode = null;
  qrDataUrl = null;
  if (sessionState !== "READY") {
    setSessionState("SYNCING", { event: reason, connectionStatus: "CONNECTED" });
  }
  if (syncStatus === "NOT_STARTED" || syncStatus === "WAITING" || syncStatus === "TIMED_OUT") {
    syncStatus = syncStatus === "TIMED_OUT" ? "RETRYING" : "LOADING";
  }
  if (!syncStartedAt) syncStartedAt = new Date().toISOString();
  if (!chatSyncStartedAt) chatSyncStartedAt = Date.now();
  lastError = "WhatsApp bağlantısı başarılı. Sohbetler arka planda yükleniyor. Telefonu yeniden bağlamayın.";
  scheduleChatSyncLoop();
}

function markWhatsAppReady(reason: string, opts?: { chatCount?: number; groupCount?: number }): void {
  if (isReady && getActiveClient()) {
    stopChatSyncLoop();
    return;
  }
  if (!getActiveClient()) return;
  if (typeof opts?.chatCount === "number") chatCount = opts.chatCount;
  if (typeof opts?.groupCount === "number") groupCount = opts.groupCount;
  connectionStatus = "CONNECTED";
  syncStatus = "READY";
  lastSyncError = null;
  setSessionState("READY", { reason, chatCount, groupCount });
  logger.info(
    {
      reason,
      sessionId: WA_CLIENT_ID,
      chatCount,
      groupCount,
      clientInstanceId: clientInstanceId(client),
      connectionStatus,
      syncStatus,
      syncAttempt,
    },
    "wa: ready",
  );
  isReady = true;
  authAccepted = true;
  qrDataUrl = null;
  pairingCode = null;
  pendingPhone = null;
  pairingIntent = false;
  pairingCodeRequested = false;
  lastError = null;
  reconnectAttempts = 0;
  sessionSoftRestartTried = false;
  readySyncTriggerTried = false;
  starting = false;
  startingSince = 0;
  manualStop = false;
  stopChatSyncLoop();
  startWhatsAppWatchdog();
  void import("../workers/scraper").then((m) => {
    if (typeof m.onWhatsAppReady === "function") m.onWhatsAppReady();
  }).catch(() => {});
}

function stopChatSyncLoop(): void {
  if (chatSyncPollTimer) {
    clearTimeout(chatSyncPollTimer);
    chatSyncPollTimer = null;
  }
  chatSyncLoopActive = false;
}

function nextChatSyncDelayMs(elapsedMs: number): number {
  if (elapsedMs < 2 * 60_000) return 5_000;
  if (elapsedMs < 5 * 60_000) return 15_000;
  return 30_000;
}

function scheduleChatSyncLoop(): void {
  if (isReady || manualStop || chatSyncLoopActive) return;
  if (!chatSyncStartedAt) {
    chatSyncStartedAt = Date.now();
    syncStartedAt = syncStartedAt ?? new Date().toISOString();
  }
  chatSyncLoopActive = true;
  logger.info(
    {
      sessionId: WA_CLIENT_ID,
      totalMs: CHAT_SYNC_TOTAL_MS,
      getChatsTimeoutMs: GET_CHATS_TIMEOUT_MS,
      connectionStatus,
      syncStatus,
    },
    "wa: chat sync loop başladı",
  );
  const tick = () => {
    chatSyncPollTimer = null;
    void (async () => {
      if (manualStop || isReady || !getActiveClient()) {
        chatSyncLoopActive = false;
        return;
      }
      const elapsed = Date.now() - chatSyncStartedAt;
      await runChatSyncAttempt("sync_poll");

      if (isReady || manualStop || !getActiveClient()) {
        chatSyncLoopActive = false;
        return;
      }

      const totalLimit = (globalThis as { __WA_CHAT_SYNC_TOTAL_OVERRIDE?: number }).__WA_CHAT_SYNC_TOTAL_OVERRIDE
        ?? CHAT_SYNC_TOTAL_MS;
      if (elapsed >= totalLimit) {
        connectionStatus = "CONNECTED";
        syncStatus = "TIMED_OUT";
        setSessionState("SYNC_TIMEOUT", { whatsappState: lastWhatsAppState, note: "sync_only" });
        lastError = "WhatsApp bağlı. Sohbetlerin yüklenmesi devam ediyor. «Sohbetleri Yeniden Yükle» deneyin.";
        logger.warn(
          {
            sessionId: WA_CLIENT_ID,
            elapsedMs: elapsed,
            whatsappState: lastWhatsAppState,
            connectionStatus,
            syncStatus,
            lastSyncError,
            clientInstanceId: clientInstanceId(getActiveClient()),
          },
          "wa: chat sync TIMED_OUT — bağlantı CONNECTED korunuyor",
        );
        chatSyncLoopActive = false;
        return;
      }

      if (syncStatus === "LOADING") syncStatus = "RETRYING";
      const delay = nextChatSyncDelayMs(elapsed);
      chatSyncPollTimer = setTimeout(tick, delay);
    })();
  };
  chatSyncPollTimer = setTimeout(tick, 0);
}

function classifySyncError(error: unknown): string {
  const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const lower = msg.toLowerCase();
  if (/get_chats_timeout|getchats.*timeout|smoke test .* tamamlanmadı/i.test(msg)) return "GET_CHATS_TIMEOUT";
  if (/protocolerror|protocol error/i.test(msg)) return "ProtocolError";
  if (/runtime\.callfunctionon|callfunctionon timed out/i.test(lower)) return "Runtime.callFunctionOn timed out";
  if (/execution context was destroyed|execution context destroyed/i.test(lower)) return "Execution context destroyed";
  if (/target closed|session closed/i.test(lower)) return "Target closed";
  if (/store not ready|wwebjs|store\./i.test(lower)) return "Store not ready";
  if (/client.*(undefined|null)|cannot read.*getchats/i.test(lower)) return "Client undefined";
  return msg.slice(0, 200);
}

async function getChatsWithTimeout(activeClient: any, timeoutMs = GET_CHATS_TIMEOUT_MS): Promise<any[]> {
  return withTimeout(
    Promise.resolve(activeClient.getChats()),
    timeoutMs,
    "GET_CHATS_TIMEOUT",
  ) as Promise<any[]>;
}

async function runChatSyncAttempt(reason: string): Promise<void> {
  if (isReady || manualStop) return;
  if (chatSyncPromise) return chatSyncPromise;

  chatSyncPromise = (async () => {
    const activeClient = getActiveClient();
    if (!activeClient) return;

    const started = Date.now();
    syncAttempt += 1;
    if (syncStatus !== "READY") {
      syncStatus = syncAttempt > 1 ? "RETRYING" : "LOADING";
    }

    try {
      const state = String(await activeClient.getState?.() ?? "").toUpperCase();
      if (getActiveClient() !== activeClient) return;
      lastWhatsAppState = state || lastWhatsAppState;

      const page = activeClient.pupPage;
      const pageOpen = Boolean(page && !page.isClosed?.());
      const hasInfo = Boolean(activeClient.info);
      const hasGetChats = typeof activeClient.getChats === "function";

      logger.info(
        {
          sessionId: WA_CLIENT_ID,
          reason,
          syncAttempt,
          clientInstanceId: clientInstanceId(activeClient),
          whatsappState: state,
          connectionStatus,
          syncStatus,
          hasInfo,
          hasGetChats,
          pageOpen,
          getChatsStarted: true,
        },
        "wa: getChats sync attempt",
      );

      if (state === "CONNECTED") {
        markConnectionConnected(reason);
      } else if (state && state !== "CONNECTED") {
        lastError = `WhatsApp durumu: ${state} — bağlantı bekleniyor…`;
        return;
      }

      if (!hasGetChats || !pageOpen) {
        lastSyncError = !pageOpen ? "Target closed" : "Client undefined";
        lastError = "WhatsApp bağlı. Sohbetler arka planda yükleniyor.";
        return;
      }
      if (!hasInfo && reason !== "ready_event") {
        lastError = "WhatsApp bağlı. Sohbetler arka planda yükleniyor.";
        return;
      }

      const chats = await getChatsWithTimeout(activeClient);
      if (getActiveClient() !== activeClient || isReady) return;

      const list = Array.isArray(chats) ? chats : [];
      const groups = list.filter((chat: any) => {
        const id = String(chat?.id?._serialized ?? chat?.id ?? "");
        return chat?.isGroup === true || id.endsWith("@g.us");
      }).length;
      const elapsedMs = Date.now() - started;

      logger.info(
        {
          sessionId: WA_CLIENT_ID,
          clientInstanceId: clientInstanceId(activeClient),
          syncAttempt,
          chatCount: list.length,
          groupCount: groups,
          elapsedMs,
          getChatsCompleted: true,
          connectionStatus,
          syncStatus: "READY",
        },
        "wa: getChats tamamlandı",
      );

      lastSyncError = null;
      markWhatsAppReady(reason, { chatCount: list.length, groupCount: groups });
    } catch (error) {
      const code = classifySyncError(error);
      lastSyncError = code;
      const stack = error instanceof Error ? error.stack ?? error.message : String(error);
      logger.error(
        {
          err: error,
          sessionId: WA_CLIENT_ID,
          clientInstanceId: clientInstanceId(getActiveClient()),
          syncAttempt,
          connectionStatus,
          syncStatus,
          lastSyncError: code,
          elapsedMs: Date.now() - started,
          stack,
        },
        "wa: getChats sync failed — bağlantı FAILED yapılmıyor",
      );
      if (connectionStatus === "CONNECTED" || lastWhatsAppState === "CONNECTED") {
        connectionStatus = "CONNECTED";
        syncStatus = "RETRYING";
        lastError = "WhatsApp bağlı. Sohbetlerin yüklenmesi devam ediyor.";
      }
    }
  })().finally(() => {
    chatSyncPromise = null;
  });

  return chatSyncPromise;
}

/** Manuel «Sohbetleri Yeniden Yükle» — pairing/QR yok, session destroy yok */
export async function reloadWhatsAppChats(): Promise<ReturnType<typeof getWhatsAppStatus>> {
  const active = getActiveClient();
  if (!active) {
    throw new WhatsAppStartError("WhatsApp client yok. Önce bağlanın.", 409, "NOT_CONNECTED");
  }
  const state = String(await active.getState?.() ?? lastWhatsAppState ?? "").toUpperCase();
  if (state && state !== "CONNECTED" && connectionStatus !== "CONNECTED" && !isReady) {
    throw new WhatsAppStartError(
      `WhatsApp henüz CONNECTED değil (${state || connectionStatus}).`,
      409,
      "NOT_CONNECTED",
    );
  }
  markConnectionConnected("manual_reload");
  isReady = false;
  syncStatus = "RETRYING";
  syncAttempt = 0;
  lastSyncError = null;
  chatSyncStartedAt = Date.now();
  syncStartedAt = new Date().toISOString();
  stopChatSyncLoop();
  scheduleChatSyncLoop();
  void runChatSyncAttempt("manual_reload");
  return getWhatsAppStatus();
}

function scheduleWhatsAppReconnect(reason: string): void {
  if (manualStop) return;
  if (reconnectTimer) return;
  reconnectAttempts++;
  if (reconnectAttempts > 20) {
    lastError = `WhatsApp tekrar bağlanamadı (${reason}). Admin panelinden QR/onay ile bağlanın.`;
    logger.error({ reason, reconnectAttempts }, "wa: reconnect vazgeçildi");
    reconnectAttempts = 0; // sonra tekrar denenebilsin
    return;
  }
  const delay = Math.min(45_000, 3_000 * Math.min(reconnectAttempts, 8));
  logger.info({ reason, delay, reconnectAttempts }, "wa: otomatik yeniden bağlanma planlandı");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (manualStop || isReady) return;
    void startWhatsAppClient({ mode: "qr" }).catch((e) => {
      logger.warn({ err: e }, "wa: auto-reconnect failed");
      scheduleWhatsAppReconnect("retry");
    });
  }, delay);
}

function startWhatsAppWatchdog(): void {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    if (manualStop || !client) return;
    try {
      const browser = (client as { pupBrowser?: { isConnected?: () => boolean } }).pupBrowser;
      if (browser && typeof browser.isConnected === "function" && !browser.isConnected()) {
        logger.warn("wa: Chromium bağlantısı koptu — yeniden bağlanılıyor");
        isReady = false;
        stopWhatsAppWatchdog();
        const old = getActiveClient();
        setActiveClient(null);
        try { void old?.destroy?.(); } catch { /* ignore */ }
        scheduleWhatsAppReconnect("browser_disconnected");
        return;
      }
      // Canlı tutma — oturumu uyutma / düşürme
      const page = (client as { pupPage?: { evaluate?: (fn: () => unknown) => Promise<unknown> } }).pupPage;
      if (page?.evaluate) {
        void page.evaluate(() => {
          try {
            const w = window as unknown as { Store?: { AppState?: { presence?: string } }; WhatsApp?: unknown };
            if (w.Store?.AppState) return true;
            return typeof w.Store !== "undefined";
          } catch {
            return false;
          }
        }).catch(() => { /* ignore transient */ });
      }
    } catch (e) {
      logger.warn({ err: e }, "wa: watchdog kontrolü başarısız");
    }
  }, 30_000);
}

function stopWhatsAppWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

async function destroyWhatsAppClientInstance(c: any, reason: string): Promise<void> {
  if (!c) return;
  setSessionState("DESTROYING", { reason });
  logger.info({ sessionId: WA_CLIENT_ID, reason }, "wa: destroy started");
  try {
    c.removeAllListeners?.();
  } catch { /* ignore */ }
  try {
    await withTimeout(Promise.resolve(c.destroy?.()), 10_000, "WhatsApp client destroy zaman aşımı");
  } catch (error) {
    logger.warn({ err: error, sessionId: WA_CLIENT_ID, reason }, "wa: client destroy tamamlanamadı");
  }
  if (getActiveClient() === c) setActiveClient(null);
  logger.info({ sessionId: WA_CLIENT_ID, reason }, "wa: destroy completed");
}

type TestClientFactory = () => Promise<any>;
let testClientFactory: TestClientFactory | null = null;

async function createWhatsAppClient(): Promise<any> {
  if (testClientFactory) {
    const created = await testClientFactory();
    attachHandlers(created);
    logger.info({ sessionId: WA_CLIENT_ID, clientCreated: true, testFactory: true }, "wa: client oluşturuldu (test)");
    return created;
  }
  try {
    await loadWhatsAppLib();
  } catch (error) {
    throw new WhatsAppStartError(
      `whatsapp-web.js yüklenemedi: ${error instanceof Error ? error.message : String(error)}`,
      503,
      "CLIENT_LIBRARY_UNAVAILABLE",
    );
  }
  let executablePath: string;
  try {
    executablePath = resolveExecutablePath();
  } catch (error) {
    throw new WhatsAppStartError(
      error instanceof Error ? error.message : String(error),
      503,
      "CHROMIUM_UNAVAILABLE",
    );
  }
  logger.info(
    {
      sessionId: WA_CLIENT_ID,
      executablePath,
      chromiumVersion: readChromiumVersion(executablePath),
      wwebjsVersion: WWEBJS_VERSION,
      authPath: AUTH_PATH,
      clientCreated: false,
    },
    "wa: merkezi client factory başlıyor",
  );

  try {
    fs.mkdirSync(AUTH_PATH, { recursive: true });
  } catch (error) {
    logger.warn({ err: error, authPath: AUTH_PATH }, "wa: auth path oluşturulamadı");
  }

  const created = new ClientCtor({
    authStrategy: new LocalAuthCtor({ dataPath: AUTH_PATH, clientId: WA_CLIENT_ID }),
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
  attachHandlers(created);
  logger.info(
    { sessionId: WA_CLIENT_ID, clientCreated: true, pairingMethodAvailable: typeof created.requestPairingCode === "function" },
    "wa: client oluşturuldu",
  );
  return created;
}

export async function startWhatsAppClient(
  opts?: { phoneNumber?: string; force?: boolean; mode?: ConnectionMode },
): Promise<WhatsAppStartResult> {
  return withSessionLock(async () => {
    const requestedMode: ConnectionMode = opts?.mode
      ?? (opts?.phoneNumber?.trim() ? "pairing_code" : "qr");
    const pairingMode = requestedMode === "pairing_code";
    const previousMode = connectionMode;
    const previousState = sessionState;

    const normalizedPhone = pairingMode
      ? normalizeTurkishWhatsAppPhone(opts?.phoneNumber ?? "")
      : null;
    if (pairingMode && (!normalizedPhone || !isValidWaPhone(normalizedPhone))) {
      throw new WhatsAppStartError(
        "Geçersiz Türkiye telefon numarası. 0532..., 532... veya 90532... formatını kullanın.",
        400,
        "INVALID_PHONE",
      );
    }

    await clearStaleStartingIfNeeded();

    logger.info(
      {
        sessionId: WA_CLIENT_ID,
        requestedMode,
        previousMode,
        previousState,
        phoneMasked: maskPhone(normalizedPhone),
        connectionStatus,
        syncStatus,
      },
      "wa: startWhatsAppSession",
    );

    // Telefon zaten bağlıysa yeni pairing/QR başlatma (session silme yok)
    if (!opts?.force && getActiveClient() && (connectionStatus === "CONNECTED" || isReady || lastWhatsAppState === "CONNECTED")) {
      if (!isReady) {
        scheduleChatSyncLoop();
        void runChatSyncAttempt("already_connected_start");
      }
      const result = buildCurrentStartResult(
        isReady
          ? "WhatsApp zaten bağlı."
          : "WhatsApp zaten bağlı. Sohbetler arka planda yükleniyor. Telefonu yeniden bağlamayın.",
      );
      return { ...result, status: isReady ? "READY" : "SYNCING" };
    }

    // Aynı mod + zaten bağlı → idempotent
    if (client && (isReady || sessionState === "READY") && connectionMode === requestedMode) {
      return buildCurrentStartResult("WhatsApp bağlantısı hazır.");
    }

    // Aynı mod + başlatılıyor / kod veya QR hazır / sync devam → mevcut durumu dön
    if (
      connectionMode === requestedMode
      && (
        isBusyStarting()
        || (requestedMode === "pairing_code" && pairingCode)
        || (requestedMode === "qr" && qrDataUrl)
        || sessionState === "AUTHENTICATED"
        || sessionState === "SYNCING"
        || sessionState === "SYNC_TIMEOUT"
        || sessionState === "PAIRING_CODE_READY"
        || sessionState === "QR_READY"
        || connectionStatus === "CONNECTED"
      )
    ) {
      if (
        requestedMode === "pairing_code"
        && !pairingCode
        && client?.pupPage
        && pendingPhone
        && !pairingRequestPromise
      ) {
        // Initialize bitmiş, kod henüz yok — tek seferlik istek
        try {
          await beginPairingCodeRequest(client, pendingPhone);
          return buildCurrentStartResult("Onay kodu hazır. WhatsApp uygulamanızdan girin.");
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          return buildCurrentStartResult("WhatsApp bağlantısı hazırlanıyor. Lütfen birkaç saniye bekleyin.");
        }
      }
      return buildCurrentStartResult();
    }

    // Farklı mod veya force → eski client'ı kontrollü durdur
    // CONNECTED iken force olmadan destroy etme
    if (!opts?.force && connectionStatus === "CONNECTED" && getActiveClient()) {
      return buildCurrentStartResult("WhatsApp zaten bağlı. Sohbetler arka planda yükleniyor.");
    }
    if (getActiveClient() || isBusyStarting() || isReady) {
      logger.info(
        { sessionId: WA_CLIENT_ID, previousMode, requestedMode, previousState },
        "wa: mode switch — destroy previous client",
      );
      stopChatSyncLoop();
      stopWhatsAppWatchdog();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const stale = getActiveClient();
      setActiveClient(null);
      starting = false;
      initializePromise = null;
      pairingRequestPromise = null;
      isReady = false;
      authAccepted = false;
      chatCount = 0;
      groupCount = 0;
      if (stale) await destroyWhatsAppClientInstance(stale, `mode_switch:${previousMode}->${requestedMode}`);
      await new Promise((r) => setTimeout(r, 800));
    }

    starting = true;
    startingSince = Date.now();
    connectionMode = requestedMode;
    setSessionState("STARTING", { requestedMode, previousMode });
    manualStop = false;
    qrDataUrl = null;
    pairingCode = null;
    pairingCodeReadyAt = 0;
    pairingRequestPromise = null;
    pairingCodeRequested = false;
    pairingIntent = pairingMode;
    authAccepted = false;
    sessionSoftRestartTried = false;
    readySyncTriggerTried = false;
    stopChatSyncLoop();
    lastError = pairingMode
      ? "WhatsApp bağlantısı hazırlanıyor. Lütfen birkaç saniye bekleyin."
      : (hasWhatsAppLocalSession() ? "Kayıtlı oturumla bağlanılıyor…" : "WhatsApp bağlantısı hazırlanıyor. Lütfen birkaç saniye bekleyin.");
    pendingPhone = normalizedPhone;

    try {
      if (pairingMode) {
        clearWhatsAppLocalSession(WA_CLIENT_ID);
        clearWhatsAppLocalSession(WA_PAIR_CLIENT_ID);
      }

      const created = await createWhatsAppClient();
      setActiveClient(created);
      logger.info(
        {
          sessionId: WA_CLIENT_ID,
          initializeStarted: true,
          requestedMode,
          phoneMasked: maskPhone(normalizedPhone),
          clientInstanceId: clientInstanceId(created),
          authPath: AUTH_PATH,
        },
        "wa: initialize started",
      );
      try {
        initializePromise = withTimeout(
          Promise.resolve(created.initialize()),
          90_000,
          "WhatsApp client.initialize 90 saniye içinde tamamlanmadı",
        );
        await initializePromise;
      } catch (error) {
        throw new WhatsAppStartError(
          `WhatsApp client.initialize başarısız: ${error instanceof Error ? error.message : String(error)}`,
          503,
          "INITIALIZE_FAILED",
        );
      } finally {
        initializePromise = null;
      }

      if (getActiveClient() !== created) {
        throw new WhatsAppStartError("WhatsApp client başlatma sırasında değişti.", 503, "CLIENT_REPLACED");
      }

      const browserOpen = Boolean(created.pupBrowser?.isConnected?.());
      const pageOpen = Boolean(created.pupPage && !created.pupPage.isClosed?.());
      logger.info(
        { sessionId: WA_CLIENT_ID, initializeCompleted: true, browserOpen, pageOpen },
        "wa: initialize completed",
      );
      if (!browserOpen || !pageOpen) {
        throw new WhatsAppStartError(
          `Chromium hazır değil (browserOpen=${browserOpen}, pageOpen=${pageOpen}).`,
          503,
          "BROWSER_NOT_READY",
        );
      }

      if (isReady) {
        starting = false;
        startingSince = 0;
        return buildCurrentStartResult("WhatsApp bağlantısı hazır.");
      }

      if (pairingMode && pendingPhone) {
        // QR event pairing isteğini de tetikler; burada da bekle — race yok, beginPairing tekil
        lastError = "Onay kodu hazırlanıyor…";
        try {
          // Sayfa UNPAIRED olana kadar kısa bekle (QR handler da tetikleyebilir)
          for (let i = 0; i < 30 && !pairingCode && !isReady; i++) {
            if (!pairingRequestPromise && created.pupPage) {
              void beginPairingCodeRequest(created, pendingPhone).catch(() => undefined);
            }
            if (pairingCode) break;
            await new Promise((r) => setTimeout(r, 500));
          }
          const code = pairingCode ?? await beginPairingCodeRequest(created, pendingPhone);
          starting = false;
          startingSince = 0;
          return {
            success: true,
            mode: "pairing_code",
            status: "PAIRING_CODE_READY",
            phase: "pairing_code_ready",
            pairingCode: formatPairingCodeDisplay(code),
            expiresInSeconds: PAIRING_CODE_TTL_SEC,
            qr: null,
            message: "Onay kodu hazır. WhatsApp uygulamanızdan girin.",
          };
        } catch (error) {
          await enableQrFallback(created, error);
          throw error instanceof WhatsAppStartError
            ? error
            : new WhatsAppStartError(
              error instanceof Error ? error.message : String(error),
              503,
              "PAIRING_CODE_FAILED",
            );
        }
      }

      // QR modu — QR event'i beklenir
      const qrWaitLoops = testClientFactory ? 4 : 40;
      for (let i = 0; i < qrWaitLoops && !qrDataUrl && !isReady; i++) {
        await new Promise((r) => setTimeout(r, testClientFactory ? 50 : 500));
      }
      starting = false;
      startingSince = 0;
      return buildCurrentStartResult(
        qrDataUrl
          ? "QR kodu hazır. WhatsApp → Bağlı Cihazlar → Cihaz bağla."
          : "WhatsApp bağlantısı hazırlanıyor. Lütfen birkaç saniye bekleyin.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = msg.includes("ENOENT") || msg.includes("Chromium")
        ? `Chrome/Chromium bulunamadı. Deploy'da chromium kurulu olmalı. (${msg.slice(0, 200)})`
        : msg.slice(0, 500);
      const failedClient = getActiveClient();
      if (failedClient) await destroyWhatsAppClientInstance(failedClient, "start_failed");
      setActiveClient(null);
      isReady = false;
      chatCount = 0;
      groupCount = 0;
      setSessionState("FAILED", { err: msg });
      logger.error(
        {
          err: e,
          sessionId: WA_CLIENT_ID,
          sessionState,
          connectionMode,
          browserOpen: Boolean(getActiveClient()?.pupBrowser?.isConnected?.()),
          pairingMethodAvailable: typeof getActiveClient()?.requestPairingCode === "function",
        },
        "wa: start failed",
      );
      throw e;
    } finally {
      starting = false;
      initializePromise = null;
      if (sessionState === "STARTING") startingSince = startingSince || Date.now();
      else startingSince = 0;
    }
  });
}

/**
 * Boot'ta: kayıtlı oturum varsa otomatik bağlan (Sıfırla gerekmez).
 * WA_AUTO_CONNECT=0 ile tamamen kapatılabilir.
 */
export async function initWhatsAppClient(): Promise<void> {
  if (process.env.WA_AUTO_CONNECT === "0") {
    logger.info("wa: boot auto-connect kapalı (WA_AUTO_CONNECT=0)");
    return;
  }
  const force = process.env.WA_AUTO_CONNECT === "1";
  const hasSession = hasWhatsAppLocalSession();
  if (!force && !hasSession) {
    logger.info("wa: kayıtlı oturum yok — admin panelden bağlanın");
    return;
  }
  try {
    resolveExecutablePath();
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, "wa: init atlandı — chromium yok");
    return;
  }
  try {
    lastError = hasSession
      ? "WhatsApp yeniden bağlanıyor… (imleçler korunuyor)"
      : null;
    await startWhatsAppClient({ mode: "qr" });
    logger.info(`wa: init ${isReady ? "hazır" : "oturum/QR bekleniyor"}`);
  } catch (e) {
    logger.warn({ err: e }, "wa: init başarısız — admin panelinden bağlanın");
  }
}

export function getWhatsAppQR(): string | null {
  return qrDataUrl;
}

export function getWhatsAppPairingCode(): string | null {
  return pairingCode;
}

export function getWhatsAppError(): string | null {
  return lastError;
}

export function isWhatsAppReady(): boolean {
  return isReady && !!getActiveClient();
}

export function getWhatsAppStatus() {
  let chromePath: string | null = null;
  try { chromePath = resolveExecutablePath(); } catch { chromePath = null; }
  void clearStaleStartingIfNeeded().catch(() => undefined);
  const active = getActiveClient();
  const inPairing = connectionMode === "pairing_code";
  const ready = isWhatsAppReady();
  const connected = connectionStatus === "CONNECTED" || ready || lastWhatsAppState === "CONNECTED";
  return {
    status: sessionState,
    connectionStatus,
    syncStatus,
    whatsappState: lastWhatsAppState,
    authenticated: authAccepted || ready || connected,
    ready,
    connected,
    chatCount,
    groupCount,
    syncAttempt,
    syncStartedAt,
    lastSyncError,
    error: lastError,
    updatedAt: statusUpdatedAt,
    starting: isBusyStarting(),
    pairing: inPairing && !ready && !authAccepted && !connected,
    authAccepted,
    phase: sessionState.toLowerCase(),
    sessionState,
    connectionMode,
    mode: connectionMode,
    hasSession: hasWhatsAppLocalSession(),
    qr: (inPairing || authAccepted || ready || connected) ? null : qrDataUrl,
    pairingCode: (!inPairing || authAccepted || ready || connected)
      ? null
      : (pairingCode ? formatPairingCodeDisplay(pairingCode) : null),
    expiresInSeconds: pairingCode && inPairing && !authAccepted && !ready && !connected
      ? Math.max(0, PAIRING_CODE_TTL_SEC - Math.floor((Date.now() - pairingCodeReadyAt) / 1000))
      : null,
    phone: pendingPhone ? maskPhone(pendingPhone) : null,
    chromePath,
    chromiumVersion: chromePath ? readChromiumVersion(chromePath) : null,
    browserOpen: Boolean(active?.pupBrowser?.isConnected?.()),
    pairingMethodAvailable: typeof active?.requestPairingCode === "function",
    wwebjsVersion: WWEBJS_VERSION,
    sessionId: WA_CLIENT_ID,
    clientInstanceId: active ? clientInstanceId(active) : null,
    clientPhase,
    authPath: AUTH_PATH,
    getChatsTimeoutMs: GET_CHATS_TIMEOUT_MS,
    protocolTimeoutMs: PROTOCOL_TIMEOUT_MS,
  };
}

export async function stopWhatsAppClient(): Promise<void> {
  manualStop = true;
  pairingIntent = false;
  authAccepted = false;
  sessionSoftRestartTried = false;
  readySyncTriggerTried = false;
  stopChatSyncLoop();
  pairingCodeRequested = false;
  pairingRequestPromise = null;
  initializePromise = null;
  pendingPhone = null;
  stopWhatsAppWatchdog();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  starting = false;
  startingSince = 0;
  chatCount = 0;
  groupCount = 0;
  lastWhatsAppState = null;
  if (!getActiveClient()) {
    isReady = false;
    connectionMode = "qr";
    setSessionState("IDLE");
    qrDataUrl = null;
    pairingCode = null;
    return;
  }
  const current = getActiveClient();
  setActiveClient(null);
  await destroyWhatsAppClientInstance(current, "manual_stop");
  isReady = false;
  connectionMode = "qr";
  setSessionState("IDLE");
  qrDataUrl = null;
  pairingCode = null;
}

function upsertWhatsAppChannel(
  byId: Map<string, WhatsAppChannel>,
  raw: {
    id?: unknown;
    name?: unknown;
    participants?: unknown;
    kind?: "group" | "channel";
    isGroup?: unknown;
    isChannel?: unknown;
  },
): void {
  const id = String(raw.id ?? "").trim();
  if (!id) return;
  const isChannel = raw.kind === "channel"
    || Boolean(raw.isChannel)
    || id.endsWith("@newsletter");
  const isGroup = raw.kind === "group"
    || Boolean(raw.isGroup)
    || id.endsWith("@g.us");
  if (!isChannel && !isGroup) return;
  const prev = byId.get(id);
  const name = String(raw.name ?? "").trim() || prev?.name || id;
  const participants = Number(raw.participants ?? 0) || prev?.participants || 0;
  byId.set(id, {
    id,
    name,
    participants,
    kind: isChannel ? "channel" : "group",
  });
}

/** Store koleksiyonlarından grup/kanal oku — Chat index boş olsa bile GroupMetadata dolu olabilir. */
async function discoverFromWhatsAppStore(page: {
  evaluate: (fn: () => unknown) => Promise<unknown>;
}): Promise<Array<{
  id: string;
  name: string;
  isGroup: boolean;
  isChannel: boolean;
  participants: number;
}>> {
  return await page.evaluate(() => {
    const w = window as any;
    const collect = (collection: any) => {
      if (!collection) return [];
      if (typeof collection.getModelsArray === "function") return collection.getModelsArray();
      if (Array.isArray(collection.models)) return collection.models;
      if (Array.isArray(collection)) return collection;
      return [];
    };
    const out: Array<{
      id: string;
      name: string;
      isGroup: boolean;
      isChannel: boolean;
      participants: number;
    }> = [];
    const push = (item: any, forced?: "group" | "channel") => {
      const id = String(item?.id?._serialized ?? item?.id ?? "").trim();
      if (!id) return;
      const isChannel = forced === "channel"
        || Boolean(item?.isChannel || item?.isNewsletter)
        || id.endsWith("@newsletter");
      const isGroup = forced === "group"
        || Boolean(item?.isGroup)
        || id.endsWith("@g.us");
      if (!isChannel && !isGroup) return;
      out.push({
        id,
        name: String(
          item?.name
          ?? item?.formattedTitle
          ?? item?.subject
          ?? item?.title
          ?? item?.groupMetadata?.subject
          ?? "",
        ).trim(),
        isGroup,
        isChannel,
        participants: Number(
          item?.participants?.length
          ?? item?.groupMetadata?.participants?.length
          ?? item?.subscribersCount
          ?? 0,
        ) || 0,
      });
    };

    for (const item of collect(w.Store?.Chat)) push(item);
    for (const item of collect(w.Store?.Newsletter)) push(item, "channel");
    // Chat index gecikmeli dolarken gruplar çoğu zaman burada hazırdır
    for (const item of collect(w.Store?.GroupMetadata)) push(item, "group");
    return out;
  }) as Array<{
    id: string;
    name: string;
    isGroup: boolean;
    isChannel: boolean;
    participants: number;
  }>;
}

async function collectWhatsAppGroupsOnce(activeClient: any): Promise<Map<string, WhatsAppChannel>> {
  const byId = new Map<string, WhatsAppChannel>();
  if (!activeClient || !isReady || client !== activeClient) return byId;

  // 1) getChats ana kaynağı
  try {
    if (typeof activeClient.getChats !== "function") {
      throw new Error("WhatsApp Web getChats API henüz hazır değil");
    }
    const chats = await activeClient.getChats();
    if (client !== activeClient) return byId;
    for (const c of chats as any[]) {
      const id = String(c?.id?._serialized ?? "");
      upsertWhatsAppChannel(byId, {
        id,
        name: c.name || c.formattedTitle || id,
        participants: c.participants?.length ?? c.groupMetadata?.participants?.length ?? 0,
        isChannel: !!(c.isChannel || c.isNewsletter || id.endsWith("@newsletter")),
        isGroup: !!(c.isGroup || id.endsWith("@g.us")),
      });
    }
  } catch (e) {
    logger.warn({ err: e }, "wa: getChats failed");
  }

  // 1b) getAllGroups — bazı wwebjs sürümlerinde ayrı API
  try {
    if (typeof activeClient.getAllGroups === "function") {
      const groups = await activeClient.getAllGroups();
      if (client !== activeClient) return byId;
      for (const c of groups as any[]) {
        const id = String(c?.id?._serialized ?? "");
        upsertWhatsAppChannel(byId, {
          id,
          name: c.name || c.formattedTitle || c.subject || id,
          participants: c.participants?.length ?? c.groupMetadata?.participants?.length ?? 0,
          kind: "group",
        });
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "wa: getAllGroups failed");
  }

  // 2) getChannels ile kanalları ekle
  try {
    if (typeof activeClient.getChannels === "function") {
      const channels = await activeClient.getChannels();
      if (client !== activeClient) return byId;
      for (const c of channels as any[]) {
        const id = String(c?.id?._serialized ?? "");
        upsertWhatsAppChannel(byId, {
          id,
          name: c.name || c.formattedTitle || id,
          participants: c.subscribersCount ?? c.participants?.length ?? 0,
          kind: "channel",
        });
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "wa: getChannels failed");
  }

  // 3) getContacts ile kişi listesindeki grupları da ekle
  try {
    if (typeof activeClient.getContacts === "function") {
      const contacts = await activeClient.getContacts();
      if (client !== activeClient) return byId;
      for (const c of contacts as any[]) {
        const id = String(c?.id?._serialized ?? "");
        upsertWhatsAppChannel(byId, {
          id,
          name: c.name || c.formattedTitle || c.pushname || id,
          participants: c.participants?.length ?? c.groupMetadata?.participants?.length ?? 0,
          isChannel: !!(c.isChannel || c.isNewsletter || id.endsWith("@newsletter")),
          isGroup: !!(c.isGroup || id.endsWith("@g.us")),
        });
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "wa: getContacts (groups) failed");
  }

  // 4) WhatsApp Web Store yedeği — Chat + Newsletter + GroupMetadata
  try {
    const page = activeClient.pupPage;
    if (page) {
      const storeSources = await discoverFromWhatsAppStore(page);
      if (client !== activeClient) return byId;
      for (const s of storeSources) {
        upsertWhatsAppChannel(byId, s);
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "wa: Store group/channel discovery failed");
  }

  return byId;
}

export async function fetchWhatsAppGroups(): Promise<WhatsAppChannel[]> {
  if (!client || !isReady) return [];
  const activeClient = client;

  // ready sonrası Chat index boş kalabiliyor — kısa yeniden deneme
  let byId = await collectWhatsAppGroupsOnce(activeClient);
  for (let attempt = 0; attempt < 3 && byId.size === 0; attempt++) {
    if (!isReady || client !== activeClient) return [];
    logger.info({ attempt: attempt + 1 }, "wa: grup listesi boş — senkron bekleniyor");
    await new Promise((r) => setTimeout(r, 2500));
    byId = await collectWhatsAppGroupsOnce(activeClient);
  }

  return [...byId.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "group" ? -1 : 1;
    return a.name.localeCompare(b.name, "tr");
  });
}

export type WhatsAppDiscoveryDiagnostics = {
  ready: boolean;
  state: string | null;
  wwebVersion: string | null;
  chatCount: number;
  groupCount: number;
  channelCount: number;
  contactGroupCount: number | null;
  storeChatCount: number | null;
  storeGroupMetadataCount: number | null;
  errors: string[];
  steps: string[];
};

export async function getWhatsAppDiscoveryDiagnostics(): Promise<WhatsAppDiscoveryDiagnostics> {
  const diagnostic: WhatsAppDiscoveryDiagnostics = {
    ready: isWhatsAppReady(),
    state: null,
    wwebVersion: null,
    chatCount: 0,
    groupCount: 0,
    channelCount: 0,
    contactGroupCount: null,
    storeChatCount: null,
    storeGroupMetadataCount: null,
    errors: [],
    steps: [],
  };
  if (!client || !isReady) {
    diagnostic.errors.push("WhatsApp istemcisi hazır değil.");
    return diagnostic;
  }
  const activeClient = client;

  try {
    const state = String(await activeClient.getState?.() ?? "") || null;
    diagnostic.state = state;
  } catch { /* ignore */ }
  try {
    const wwebVersion = String(await activeClient.getWWebVersion?.() ?? "") || null;
    diagnostic.wwebVersion = wwebVersion;
  } catch { /* ignore */ }

  try {
    if (client !== activeClient) {
      diagnostic.errors.push("WhatsApp bağlantısı tanı sırasında yenilendi; liste tekrar yüklenecek.");
      return diagnostic;
    }
    if (typeof activeClient.getChats !== "function") {
      throw new Error("WhatsApp Web getChats API henüz hazır değil");
    }
    const chats = await activeClient.getChats();
    diagnostic.chatCount = chats.length;
    diagnostic.groupCount = chats.filter((chat: any) => {
      const id = String(chat?.id?._serialized ?? chat?.id ?? "");
      return Boolean(chat?.isGroup || id.endsWith("@g.us"));
    }).length;
    diagnostic.channelCount = chats.filter((chat: any) => {
      const id = String(chat?.id?._serialized ?? chat?.id ?? "");
      return Boolean(chat?.isChannel || chat?.isNewsletter || id.endsWith("@newsletter"));
    }).length;
    diagnostic.steps.push(`getChats: ${diagnostic.chatCount} sohbet, ${diagnostic.groupCount} grup, ${diagnostic.channelCount} kanal`);
  } catch (e) {
    diagnostic.errors.push(`getChats hatası: ${e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : String(e).slice(0, 300)}`);
  }

  try {
    if (client !== activeClient) return diagnostic;
    if (typeof activeClient.getContacts === "function") {
      const contacts = await activeClient.getContacts();
      diagnostic.contactGroupCount = contacts.filter((contact: any) => {
        const id = String(contact?.id?._serialized ?? contact?.id ?? "");
        return Boolean(contact?.isGroup || id.endsWith("@g.us"));
      }).length;
      diagnostic.steps.push(`getContacts: ${diagnostic.contactGroupCount} grup kimliği`);
    }
  } catch (e) {
    diagnostic.errors.push(`getContacts hatası: ${e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : String(e).slice(0, 300)}`);
  }

  try {
    if (client !== activeClient) return diagnostic;
    const page = activeClient.pupPage;
    if (page) {
      const store = await page.evaluate(() => {
        const w = window as any;
        const sizeOf = (collection: any) => {
          if (!collection) return null;
          if (typeof collection.getModelsArray === "function") return collection.getModelsArray().length;
          if (Array.isArray(collection.models)) return collection.models.length;
          return null;
        };
        return {
          chats: sizeOf(w.Store?.Chat),
          groups: sizeOf(w.Store?.GroupMetadata),
        };
      });
      diagnostic.storeChatCount = store.chats;
      diagnostic.storeGroupMetadataCount = store.groups;
      diagnostic.steps.push(`WA Store: Chat=${store.chats ?? "yok"}, GroupMetadata=${store.groups ?? "yok"}`);
      if ((store.groups ?? 0) > 0 && diagnostic.groupCount === 0) {
        diagnostic.steps.push("GroupMetadata dolu ama getChats grup döndürmedi — Store yedeği kullanılacak");
      }
    }
  } catch (e) {
    diagnostic.errors.push(`WhatsApp Web Store hatası: ${e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300)}`);
  }

  return diagnostic;
}

/** Store'daki metin mesajlarını cutoff sonrası oku (WA bellek penceresi kaydığı için tur tur biriktirilir). */
async function harvestStoreMessages(
  page: { evaluate: (fn: (...args: any[]) => any, ...args: any[]) => Promise<any> },
  chatId: string,
  groupJid: string,
  cutoff: number,
  byId: Map<string, WhatsAppMessage>,
): Promise<{ count: number; oldest: number }> {
  const storeMsgs: Array<{ id: string; text: string; timestamp: number }> = await page.evaluate(
    (id: string, cut: number) => {
      const w = window as any;
      const resolveStoreChat = (chatId: string) => {
        let chat =
          w.Store?.Chat?.get?.(chatId)
          || null;
        if (!chat) {
          try {
            const found = w.Store?.Chat?.find?.(chatId);
            if (found && typeof (found as any).then !== "function") chat = found;
          } catch { /* ignore */ }
        }
        if (!chat) {
          try {
            const wid = w.Store?.WidFactory?.createWid?.(chatId);
            if (wid) {
              chat = w.Store?.Chat?.get?.(wid) || null;
              if (!chat) {
                const found = w.Store?.Chat?.find?.(wid);
                if (found && typeof (found as any).then !== "function") chat = found;
              }
            }
          } catch { /* ignore */ }
        }
        if (!chat) {
          const models = w.Store?.Chat?.getModelsArray?.() ?? w.Store?.Chat?.models ?? [];
          chat = models.find((c: any) => c?.id?._serialized === chatId) || null;
        }
        return chat;
      };
      const storeChat = resolveStoreChat(id);
      if (!storeChat) return [];
      const arr = storeChat.msgs?.getModelsArray?.() ?? storeChat.msgs?.models ?? [];
      const out: Array<{ id: string; text: string; timestamp: number }> = [];
      for (const m of arr) {
        const mid = m.id?._serialized;
        const ts = (m.t ?? m.timestamp ?? 0) * 1000;
        if (!mid || !ts || ts <= cut) continue;
        // body, caption, veya medya açıklaması
        const text = String(
          m.body
          ?? m.caption
          ?? m.list?.description
          ?? m.hydratedButtonsMessage?.contentText
          ?? "",
        ).trim();
        if (!text || text.length < 8) continue;
        out.push({ id: mid, text, timestamp: ts });
      }
      return out;
    },
    chatId,
    cutoff,
  );
  let oldest = Date.now();
  for (const m of storeMsgs) {
    byId.set(m.id, { id: m.id, remoteJid: groupJid, text: m.text, timestamp: m.timestamp });
    if (m.timestamp < oldest) oldest = m.timestamp;
  }
  return { count: storeMsgs.length, oldest: storeMsgs.length ? oldest : Date.now() };
}

export type WhatsAppFetchResult = {
  messages: WhatsAppMessage[];
  oldestTs: number;
  /** Hedef güne (örn. 30g) ulaşıldı */
  reachedCutoff: boolean;
  /** Chromium/WA daha eski yükleyemiyor — gidebildiği kadar bitti */
  historyExhausted: boolean;
  rounds: number;
  /** Boş taramanın nedeni için yönetim ekranına iletilen kısa teknik tanı */
  diagnostic: string | null;
};

/**
 * Grup mesajlarını çek — hedef güne (varsayılan 30) veya WA’nın verdiği en eskiye kadar.
 * historyExhausted=true: daha geriye gidilemiyor → ilk tarama bu noktadan tamamlanmalı.
 */
export async function fetchWhatsAppMessages(
  groupJid: string,
  opts: {
    afterTimestampMs?: number;
    limit?: number;
    maxAgeDays?: number;
    deep?: boolean;
  } = {},
): Promise<WhatsAppMessage[]> {
  const result = await fetchWhatsAppMessagesDetailed(groupJid, opts);
  return result.messages;
}

export async function fetchWhatsAppMessagesDetailed(
  groupJid: string,
  opts: {
    afterTimestampMs?: number;
    limit?: number;
    maxAgeDays?: number;
    deep?: boolean;
    onProgress?: (progress: { round: number; maxRounds: number; messages: number; oldestTs: number }) => void | Promise<void>;
  } = {},
): Promise<WhatsAppFetchResult> {
  if (!client || !isReady) {
    return {
      messages: [],
      oldestTs: Date.now(),
      reachedCutoff: false,
      historyExhausted: false,
      rounds: 0,
      diagnostic: "WhatsApp istemcisi hazır değil; oturum veya bağlantı bekleniyor.",
    };
  }

  const page = (client as any).pupPage;
  try {
    // Sohbeti aç — geçmiş senkronu için şart
    await (client as any).interface?.openChatWindow?.(groupJid);
    await new Promise((r) => setTimeout(r, 2500));
    if (page) {
      try {
        await page.evaluate(async (jid: string) => {
          const w = window as any;
          let chat: any = null;
          try {
            const wid = w.Store?.WidFactory?.createWid?.(jid);
            if (wid && typeof w.Store?.Chat?.find === "function") {
              const found = w.Store.Chat.find(wid);
              chat = found && typeof found.then === "function" ? await found : found;
            }
          } catch { /* ignore */ }
          if (!chat) {
            chat = w.Store?.Chat?.get?.(jid) || null;
          }
          if (chat?.presence?.subscribe) {
            try { chat.presence.subscribe(); } catch { /* ignore */ }
          }
          if (typeof chat?.syncHistory === "function") {
            try { chat.syncHistory(); } catch { /* ignore */ }
          }
        }, groupJid);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  let chat: any;
  try {
    chat = await client.getChatById(groupJid);
  } catch (e) {
    logger.warn({ err: e, groupJid }, "wa: getChatById failed — Store üzerinden deneniyor");
  }
  if (!chat && page) {
    try {
      const loaded = await page.evaluate(async (jid: string) => {
        const w = window as any;
        try {
          const wid = w.Store?.WidFactory?.createWid?.(jid);
          if (wid && typeof w.Store?.Chat?.find === "function") {
            const found = w.Store.Chat.find(wid);
            const chat = found && typeof found.then === "function" ? await found : found;
            return Boolean(chat?.id?._serialized);
          }
        } catch { /* ignore */ }
        return false;
      }, groupJid);
      if (loaded) {
        try { chat = await client.getChatById(groupJid); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
  if (!chat) {
    return {
      messages: [],
      oldestTs: Date.now(),
      reachedCutoff: false,
      historyExhausted: false,
      rounds: 0,
      diagnostic: "Grup/kanal istemcide bulunamadı. Grup listesini yenileyip kaynağı yeniden kaydedin.",
    };
  }

  // syncHistory (wwebjs) — sunucudan geçmiş çekmeye zorla
  try {
    if (typeof chat.syncHistory === "function") {
      const synced = await chat.syncHistory();
      logger.info({ groupJid, synced }, "wa: syncHistory");
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (e) {
    logger.warn({ err: e, groupJid }, "wa: syncHistory failed");
  }

  const cutoff = opts.afterTimestampMs != null
    ? opts.afterTimestampMs
    : (Date.now() - (opts.maxAgeDays ?? 730) * 24 * 60 * 60 * 1000);

  const chatId = (chat as any).id?._serialized ?? groupJid;
  const byId = new Map<string, WhatsAppMessage>();
  let rounds = 0;
  let reachedCutoff = false;
  let historyExhausted = false;

  const reportProgress = async (round: number, maxRounds: number, oldestTs: number) => {
    if (!opts.onProgress) return;
    try {
      await opts.onProgress({ round, maxRounds, messages: byId.size, oldestTs });
    } catch (e) {
      logger.warn({ err: e, groupJid }, "wa: tarama ilerlemesi yazılamadı");
    }
  };

  const pullFetchMessages = async (limit: number) => {
    try {
      const batch = (await chat.fetchMessages({ limit })) ?? [];
      for (const m of batch) {
        const id = m.id?._serialized;
        if (!id || byId.has(id)) continue;
        const ts = (m.timestamp ?? 0) * 1000;
        if (!ts || ts <= cutoff) continue;
        const text = String(m.body ?? (m as any).caption ?? "").trim();
        if (!text || text.length < 8) continue;
        byId.set(id, { id, remoteJid: groupJid, text, timestamp: ts });
      }
      return batch.length;
    } catch (e) {
      logger.warn({ err: e, groupJid }, "wa: fetchMessages failed");
      return 0;
    }
  };

  if (opts.deep && page) {
    await harvestStoreMessages(page, chatId, groupJid, cutoff, byId);
    await pullFetchMessages(500);

    let stagnant = 0;
    let lastHarvested = byId.size;
    let lastOldest = Date.now();
    // QR/Chromium genelde 30 güne inemez — uzun tur boşa zaman kaybettirir
    const maxRounds = 120;
    /** İlerleme yoksa bu kadar tur sonra “gidebildiği kadar” kabul et */
    const STAGNANT_LIMIT = 12;

    for (let i = 0; i < maxRounds; i++) {
      rounds = i + 1;
      let info: { ok?: boolean; count?: number; oldest?: number; done?: boolean; loaded?: number } = {};

      try {
        // 1) Store API ile daha eski mesajları yükle
        info = await page.evaluate(async (id: string) => {
          const w = window as any;
          let storeChat: any =
            w.Store?.Chat?.get?.(id) || null;
          if (!storeChat) {
            try {
              const found = w.Store?.Chat?.find?.(id);
              if (found && typeof found.then !== "function") storeChat = found;
              else if (found && typeof found.then === "function") storeChat = await found;
            } catch { /* ignore */ }
          }
          if (!storeChat) {
            try {
              const wid = w.Store?.WidFactory?.createWid?.(id);
              if (wid) {
                storeChat = w.Store?.Chat?.get?.(wid) || null;
                if (!storeChat && typeof w.Store?.Chat?.find === "function") {
                  const found = w.Store.Chat.find(wid);
                  storeChat = found && typeof found.then === "function" ? await found : found;
                }
              }
            } catch { /* ignore */ }
          }
          if (!storeChat) {
            const models = w.Store?.Chat?.getModelsArray?.() ?? w.Store?.Chat?.models ?? [];
            storeChat = models.find((c: any) => c?.id?._serialized === id) || null;
          }
          if (!storeChat) return { ok: false, count: 0, oldest: Date.now(), done: true, loaded: 0 };

          const msgsBefore = storeChat.msgs?.getModelsArray?.()?.length
            ?? storeChat.msgs?.models?.length
            ?? storeChat.msgs?.length
            ?? 0;

          let loaded = 0;
          const tryLoad = async () => {
            if (w.Store?.ConversationMsgs?.loadEarlierMsgs) {
              const r = await w.Store.ConversationMsgs.loadEarlierMsgs(storeChat);
              return r;
            }
            if (typeof storeChat.loadEarlierMsgs === "function") {
              return await storeChat.loadEarlierMsgs();
            }
            if (w.Store?.Msg?.loadEarlierMsgs) {
              return await w.Store.Msg.loadEarlierMsgs(storeChat);
            }
            if (w.Store?.Chat?.loadEarlierMsgs) {
              return await w.Store.Chat.loadEarlierMsgs(storeChat);
            }
            return null;
          };

          try {
            const r = await tryLoad();
            loaded = Array.isArray(r) ? r.length : (r ? 1 : 0);
          } catch {
            return { ok: true, count: msgsBefore, oldest: Date.now(), done: true, loaded: 0 };
          }

          await new Promise((r) => setTimeout(r, 450));

          const arr = storeChat.msgs?.getModelsArray?.() ?? storeChat.msgs?.models ?? [];
          const count = arr.length || msgsBefore;
          let oldest = Date.now();
          for (const m of arr) {
            const t = (m.t ?? m.timestamp ?? 0) * 1000;
            if (t > 0 && t < oldest) oldest = t;
          }
          const noGrowth = count <= msgsBefore && loaded === 0;
          return { ok: true, count, oldest, done: noGrowth, loaded };
        }, chatId);
      } catch (e) {
        logger.warn({ err: e, groupJid }, "wa: loadEarlierMsgs evaluate failed");
        historyExhausted = true;
        break;
      }

      // 2) DOM scroll — UI da geçmişi tetikler
      try {
        await page.evaluate(() => {
          const selectors = [
            '[data-testid="conversation-panel-messages"]',
            "#main div[role=\"application\"]",
            "div.copyable-area div[tabindex=\"0\"]",
            "#main .copyable-area",
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (el) {
              el.scrollTop = 0;
              el.dispatchEvent(new Event("scroll", { bubbles: true }));
              break;
            }
          }
        });
      } catch { /* ignore */ }

      await new Promise((r) => setTimeout(r, 500));

      // 3) Her tur harvest + ara ara fetchMessages
      const harvested = await harvestStoreMessages(page, chatId, groupJid, cutoff, byId);
      if (i % 5 === 0) await pullFetchMessages(Math.min(2000, 300 + i * 20));

      const oldest = Math.min(info.oldest ?? Date.now(), harvested.oldest);
      const count = info.count ?? 0;
      await reportProgress(i + 1, maxRounds, oldest);

      if (i % 5 === 0 || oldest <= cutoff || byId.size !== lastHarvested) {
        logger.info(
          {
            groupJid,
            round: i + 1,
            storeCount: count,
            harvested: byId.size,
            loaded: info.loaded ?? 0,
            oldest: new Date(oldest).toISOString(),
            cutoff: new Date(cutoff).toISOString(),
          },
          "wa: geçmiş yükleniyor",
        );
      }

      if (oldest <= cutoff) {
        reachedCutoff = true;
        break;
      }

      const progressed = byId.size > lastHarvested || oldest < lastOldest - 30_000 || (info.loaded ?? 0) > 0;
      if (!progressed || info.done) {
        if (!progressed) stagnant++;
        // WA QR oturumu daha eski yükleyemiyor — gidebildiği kadar kabul et
        if (stagnant >= STAGNANT_LIMIT) {
          historyExhausted = true;
          logger.warn(
            { groupJid, rounds: i + 1, harvested: byId.size, oldest: new Date(oldest).toISOString(), stagnant },
            "wa: geçmiş tükendi (Chromium daha eski yüklemiyor)",
          );
          break;
        }
        await new Promise((r) => setTimeout(r, 900));
      } else {
        stagnant = 0;
      }
      lastHarvested = byId.size;
      lastOldest = oldest;
      await new Promise((r) => setTimeout(r, 350));
    }

    if (!reachedCutoff && rounds >= maxRounds) {
      historyExhausted = true;
    }

    // Son bir syncHistory + büyük fetch
    try {
      if (typeof chat.syncHistory === "function") await chat.syncHistory();
    } catch { /* ignore */ }
    await pullFetchMessages(5000);
    await harvestStoreMessages(page, chatId, groupJid, cutoff, byId);

    const finalOldest = [...byId.values()].reduce((min, m) => Math.min(min, m.timestamp), Date.now());
    if (finalOldest <= cutoff) {
      reachedCutoff = true;
      historyExhausted = false;
    } else if (!reachedCutoff && byId.size > 0) {
      // Hedefe inilemedi ama mesaj var → mevcut geçmiş tükendi sayılır
      historyExhausted = true;
    }
  } else {
    if (page) await harvestStoreMessages(page, chatId, groupJid, cutoff, byId);
    await pullFetchMessages(Math.min(opts.limit ?? 200, 500));
    const finalOldest = [...byId.values()].reduce((min, m) => Math.min(min, m.timestamp), Date.now());
    await reportProgress(1, 1, finalOldest);
    reachedCutoff = byId.size === 0 || finalOldest <= cutoff;
    historyExhausted = !reachedCutoff && byId.size > 0;
    rounds = 1;
  }

  const out = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
  const oldestTs = out.length ? out[0]!.timestamp : Date.now();
  logger.info(
    {
      groupJid,
      inRange: out.length,
      deep: !!opts.deep,
      reachedCutoff,
      historyExhausted,
      rounds,
      oldest: new Date(oldestTs).toISOString(),
      cutoff: new Date(cutoff).toISOString(),
    },
    "wa: mesajlar hazır (eski→yeni)",
  );
  const diagnostics: string[] = [];
  if (out.length === 0 && !reachedCutoff && !historyExhausted) {
    diagnostics.push("Bu turda mesaj çekilemedi; grup geçmişi henüz senkronize olmamış olabilir.");
  }
  return {
    messages: out,
    oldestTs,
    reachedCutoff,
    historyExhausted,
    rounds,
    diagnostic: diagnostics.length ? diagnostics.join(" | ").slice(0, 700) : null,
  };
}

export async function sendWhatsAppMessage(jid: string, text: string): Promise<void> {
  if (!client || !isReady) throw new Error("WhatsApp not connected");
  await client.sendMessage(jid, text);
}

/** Test-only: mock client factory (Chromium yok). */
export function __testOnly_setClientFactory(factory: TestClientFactory | null): void {
  testClientFactory = factory;
}

/** Test-only: session state enjekte et. */
export function __testOnly_setSessionForTests(partial: {
  connectionMode?: ConnectionMode;
  sessionState?: WhatsAppSessionState;
  starting?: boolean;
  startingSince?: number;
  qrDataUrl?: string | null;
  pairingCode?: string | null;
  pendingPhone?: string | null;
  pairingIntent?: boolean;
  isReady?: boolean;
  authAccepted?: boolean;
  client?: any;
}): void {
  if (partial.connectionMode !== undefined) connectionMode = partial.connectionMode;
  if (partial.sessionState !== undefined) setSessionState(partial.sessionState);
  if (partial.starting !== undefined) starting = partial.starting;
  if (partial.startingSince !== undefined) startingSince = partial.startingSince;
  if (partial.qrDataUrl !== undefined) qrDataUrl = partial.qrDataUrl;
  if (partial.pairingCode !== undefined) {
    pairingCode = partial.pairingCode;
    if (partial.pairingCode) pairingCodeReadyAt = Date.now();
  }
  if (partial.pendingPhone !== undefined) pendingPhone = partial.pendingPhone;
  if (partial.pairingIntent !== undefined) pairingIntent = partial.pairingIntent;
  if (partial.isReady !== undefined) isReady = partial.isReady;
  if (partial.authAccepted !== undefined) authAccepted = partial.authAccepted;
  if (partial.client !== undefined) setActiveClient(partial.client);
}

/** Test-only: tam sıfırlama. */
export async function __testOnly_resetWhatsAppClient(): Promise<void> {
  testClientFactory = null;
  const current = getActiveClient();
  if (current) {
    try { await current.destroy?.(); } catch { /* ignore */ }
  }
  setActiveClient(null);
  clients.clear();
  sessionStates.clear();
  isReady = false;
  qrDataUrl = null;
  pairingCode = null;
  pairingCodeReadyAt = 0;
  lastError = null;
  starting = false;
  pendingPhone = null;
  pairingIntent = false;
  pairingCodeRequested = false;
  authAccepted = false;
  initializePromise = null;
  pairingRequestPromise = null;
  clientPhase = "IDLE";
  connectionMode = "qr";
  sessionState = "IDLE";
  connectionStatus = "IDLE";
  syncStatus = "NOT_STARTED";
  syncAttempt = 0;
  syncStartedAt = null;
  lastSyncError = null;
  chatSyncPromise = null;
  chatSyncStartedAt = 0;
  chatSyncLoopActive = false;
  startingSince = 0;
  manualStop = false;
  chatCount = 0;
  groupCount = 0;
  lastWhatsAppState = null;
  stopChatSyncLoop();
  stopWhatsAppWatchdog();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** Test-only: chat sync toplam süresini kısalt (ms). */
export function __testOnly_setSyncTimeoutMs(ms: number | null): void {
  if (ms == null) delete (globalThis as { __WA_CHAT_SYNC_TOTAL_OVERRIDE?: number }).__WA_CHAT_SYNC_TOTAL_OVERRIDE;
  else (globalThis as { __WA_CHAT_SYNC_TOTAL_OVERRIDE?: number }).__WA_CHAT_SYNC_TOTAL_OVERRIDE = ms;
}

/** Test-only: chat sync denemesini tetikle */
export async function __testOnly_tryPromoteConnectedToReady(reason = "test"): Promise<void> {
  await runChatSyncAttempt(reason);
}

export function __testOnly_getAuthPath(): string {
  return AUTH_PATH;
}

export function __testOnly_getConnectionSync(): { connectionStatus: ConnectionStatus; syncStatus: SyncStatus; lastSyncError: string | null } {
  return { connectionStatus, syncStatus, lastSyncError };
}
