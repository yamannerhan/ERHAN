import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { logger } from "../lib/logger";

let client: any = null;
let isReady = false;
let qrDataUrl: string | null = null;
let pairingCode: string | null = null;
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
let readyFallbackTimer: ReturnType<typeof setInterval> | null = null;
let readyFallbackStartedAt = 0;
let sessionSoftRestartTried = false;
let readySyncTriggerTried = false;
let initializePromise: Promise<void> | null = null;
let pairingRequestPromise: Promise<string> | null = null;
let clientPhase: "IDLE" | "INITIALIZING" | "AUTHENTICATED" | "READY" | "DESTROYING" | "FAILED" = "IDLE";

const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || "./.wwebjs_auth";
const WA_CLIENT_ID = "ozelguvenlik";
const WA_PAIR_CLIENT_ID = "ozelguvenlik-pair";
const WWEBJS_VERSION = "1.34.7";

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
  phase: string;
  pairingCode: string | null;
  qr: string | null;
  message: string;
};

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
  return starting || clientPhase === "INITIALIZING" || clientPhase === "AUTHENTICATED";
}

/** Kayıtlı oturum varsa arka planda yeniden bağlan (sıfırlama gerekmez) */
export function ensureWhatsAppAutoConnect(): void {
  if (manualStop || isReady || starting) return;
  if (process.env.WA_AUTO_CONNECT === "0") return;
  if (!hasWhatsAppLocalSession() && process.env.WA_AUTO_CONNECT !== "1") return;
  void startWhatsAppClient().catch((e) => {
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
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // 05xxxxxxxxx → 905xxxxxxxxx
  if (d.length === 11 && d.startsWith("0")) d = "90" + d.slice(1);
  // 5xxxxxxxxx → 905xxxxxxxxx
  if (d.length === 10 && d.startsWith("5")) d = "90" + d;
  return d;
}

function isValidWaPhone(phone: string): boolean {
  // Türkiye: 90 + 10 haneli GSM numarası
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
  qrDataUrl = null;
  lastError = null;
  logger.info({ codeLen: raw.length }, "wa: pairing code set");
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
      `whatsapp-web.js ${WWEBJS_VERSION} içinde requestPairingCode metodu kullanılamıyor.`,
      503,
      "PAIRING_METHOD_UNAVAILABLE",
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
  pairingRequestPromise = requestPairingCodeWithRetry(c, phone)
    .finally(() => {
      pairingCodeRequested = false;
      pairingRequestPromise = null;
    });
  return pairingRequestPromise;
}

async function enableQrFallback(c: any, error: unknown): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error);
  pairingIntent = false;
  pendingPhone = null;
  lastError = `${detail} QR bağlantısı kullanıma açık bırakıldı.`;
  try {
    if (typeof c?.cancelPairingCode === "function") {
      await withTimeout(Promise.resolve(c.cancelPairingCode()), 8_000, "QR moduna geçiş zaman aşımına uğradı");
      logger.info({ sessionId: WA_CLIENT_ID }, "wa: pairing başarısız; QR moduna dönüldü");
    }
  } catch (fallbackError) {
    logger.error({ err: fallbackError, sessionId: WA_CLIENT_ID }, "wa: QR fallback başarısız");
  }
}

function attachHandlers(c: any): void {
  c.on("qr", async (qr: string) => {
    if (client !== c) return;
    logger.info({ sessionId: WA_CLIENT_ID }, "wa: QR received");
    lastError = null;
    pairingCode = null;
    try {
      qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2, errorCorrectionLevel: "M" });
      logger.info({ sessionId: WA_CLIENT_ID }, "wa: QR data URL hazır");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    // Client her zaman QR modunda initialize edilir; kod isteği yalnız bir kez buradan/endpointten paylaşılır.
    if (pairingIntent && pendingPhone && !pairingCode) {
      const phone = pendingPhone;
      void beginPairingCodeRequest(c, phone).catch((error) => {
        void enableQrFallback(c, error);
      });
    }
  });

  c.on("code", (code: string) => {
    if (client !== c) return;
    logger.info({ sessionId: WA_CLIENT_ID, event: "code" }, "wa: pairing_code/code event alındı");
    setPairingCode(code);
  });

  c.on("authenticated", () => {
    if (client !== c) return;
    clientPhase = "AUTHENTICATED";
    logger.info({ sessionId: WA_CLIENT_ID, phase: clientPhase }, "wa: authenticated");
    authAccepted = true;
    pairingCode = null;
    qrDataUrl = null;
    lastError = "Telefon onayladı — uygulama senkron bekliyor…";
    startReadyFallbackWatcher();
  });

  c.on("ready", () => {
    if (client !== c) return;
    markWhatsAppReady("ready_event");
  });

  c.on("change_state", (state: string) => {
    logger.info({ state }, "wa: change_state");
    if (String(state).toUpperCase() === "CONNECTED" && authAccepted && !isReady) {
      lastError = "WhatsApp CONNECTED — hazırlık tamamlanıyor…";
      void tryPromoteConnectedToReady("change_state");
    }
  });

  c.on("loading_screen", (percent: string, message: string) => {
    logger.info(`wa: loading ${percent}% ${message}`);
    if (authAccepted && !isReady) {
      lastError = `WhatsApp yükleniyor… %${percent}`;
    }
    // %99'da takılı kalma: senkron yedeğini hızlandır
    const n = Number(percent);
    if (!Number.isNaN(n) && n >= 99 && authAccepted && !isReady) {
      void tryPromoteConnectedToReady("loading_99");
    }
  });

  c.on("disconnected", (reason: string) => {
    if (client !== c) return;
    clientPhase = "FAILED";
    logger.warn({ sessionId: WA_CLIENT_ID, reason, phase: clientPhase }, "wa: disconnected");
    isReady = false;
    authAccepted = false;
    readySyncTriggerTried = false;
    stopReadyFallbackWatcher();
    stopWhatsAppWatchdog();
    const old = client;
    client = null;
    qrDataUrl = null;
    pairingCode = null;
    lastError = `Bağlantı koptu: ${reason}`;
    void destroyWhatsAppClientInstance(old, `disconnected:${reason}`).finally(() => {
      clientPhase = "FAILED";
      scheduleWhatsAppReconnect(reason);
    });
  });

  c.on("auth_failure", (msg: string) => {
    if (client !== c) return;
    clientPhase = "FAILED";
    logger.error({ sessionId: WA_CLIENT_ID, message: msg, phase: clientPhase }, "wa: auth_failure");
    isReady = false;
    authAccepted = false;
    readySyncTriggerTried = false;
    stopReadyFallbackWatcher();
    stopWhatsAppWatchdog();
    const old = client;
    client = null;
    qrDataUrl = null;
    pairingCode = null;
    lastError = `Kimlik doğrulama hatası: ${msg}`;
    void destroyWhatsAppClientInstance(old, "auth_failure").finally(() => {
      clientPhase = "FAILED";
      if (!manualStop && reconnectAttempts < 2) scheduleWhatsAppReconnect(`auth_failure:${msg}`);
    });
  });
}

function markWhatsAppReady(reason: string): void {
  if (isReady && client) {
    stopReadyFallbackWatcher();
    return;
  }
  if (!client) return;
  clientPhase = "READY";
  logger.info({ reason, sessionId: WA_CLIENT_ID, phase: clientPhase }, "wa: ready");
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
  manualStop = false;
  stopReadyFallbackWatcher();
  startWhatsAppWatchdog();
  void import("../workers/scraper").then((m) => {
    if (typeof m.onWhatsAppReady === "function") m.onWhatsAppReady();
  }).catch(() => {});
}

function stopReadyFallbackWatcher(): void {
  if (readyFallbackTimer) {
    clearInterval(readyFallbackTimer);
    readyFallbackTimer = null;
  }
  readyFallbackStartedAt = 0;
}

/**
 * Telefon kodu kabul edilip ready gelmezse (wwebjs hasSynced takılması)
 * getState/Store ile bağlanmış say; gerekirse oturumu silmeden soft restart.
 */
function startReadyFallbackWatcher(): void {
  if (readyFallbackTimer || isReady || manualStop) return;
  readyFallbackStartedAt = Date.now();
  logger.info("wa: ready fallback watcher başladı");
  readyFallbackTimer = setInterval(() => {
    void (async () => {
      if (manualStop || isReady || !client) {
        stopReadyFallbackWatcher();
        return;
      }
      const elapsed = Date.now() - readyFallbackStartedAt;
      await tryPromoteConnectedToReady("fallback_poll");

      // Oturumun diske yazılması için yeterli süre ver; erken destroy eşleşmeyi bozabilir.
      if (!isReady && elapsed >= 75_000 && !sessionSoftRestartTried && hasWhatsAppLocalSession()) {
        sessionSoftRestartTried = true;
        lastError = "Senkron takıldı — kayıtlı oturumla yeniden bağlanılıyor…";
        logger.warn("wa: ready gelmedi — soft session restart");
        stopReadyFallbackWatcher();
        const old = client;
        client = null;
        isReady = false;
        try { await old?.destroy?.(); } catch { /* ignore */ }
        clientPhase = "IDLE";
        await new Promise((r) => setTimeout(r, 1500));
        try {
          await startWhatsAppClient({ force: true });
        } catch (e) {
          logger.warn({ err: e }, "wa: soft restart failed");
          scheduleWhatsAppReconnect("soft_restart_failed");
        }
        return;
      }

      if (!isReady && elapsed >= 150_000) {
        lastError = "WhatsApp telefonda bağlandı ama uygulama hazır olamadı. Bir kez daha «Bağlan» deneyin.";
        logger.error("wa: ready fallback timeout (90s)");
        stopReadyFallbackWatcher();
      }
    })();
  }, 2500);
}

async function tryPromoteConnectedToReady(reason: string): Promise<void> {
  if (isReady || !client || manualStop) return;
  const activeClient = client;
  try {
    const state = String(await activeClient.getState?.() ?? "").toUpperCase();
    if (client !== activeClient) return;
    if (state && state !== "CONNECTED") {
      if (authAccepted) lastError = `WhatsApp durumu: ${state} — bekleniyor…`;
      return;
    }

    const page = (activeClient as any).pupPage;
    let webState = { apiReady: false, hasSynced: false, canTriggerSync: false };
    if (page?.evaluate) {
      webState = await page.evaluate(() => {
        const w = window as any;
        let hasSynced = false;
        try {
          const sock = w.require?.("WAWebSocketModel")?.Socket;
          hasSynced = sock?.hasSynced === true;
        } catch { /* ignore */ }
        return {
          // getChats çağrısı ancak inject edilen gerçek API hazırsa güvenlidir.
          apiReady: Boolean(
            typeof w.WWebJS?.getChats === "function"
            && typeof w.WWebJS?.getContacts === "function"
            && w.Store?.Chat,
          ),
          hasSynced,
          canTriggerSync: typeof w.onAppStateHasSyncedEvent === "function",
        };
      });
    }
    if (client !== activeClient) return;

    const elapsed = readyFallbackStartedAt > 0 ? Date.now() - readyFallbackStartedAt : 0;
    if (
      state === "CONNECTED"
      && webState.hasSynced
      && !webState.apiReady
      && webState.canTriggerSync
      && elapsed >= 8_000
      && !readySyncTriggerTried
    ) {
      readySyncTriggerTried = true;
      lastError = "WhatsApp senkronlandı — Web API hazırlanıyor…";
      logger.warn({ reason }, "wa: hasSynced callback yedekten tetikleniyor");
      await page.evaluate(() => {
        const w = window as any;
        Promise.resolve(w.onAppStateHasSyncedEvent?.()).catch(() => undefined);
      });
      return;
    }

    // Yalnız WWebJS.getChats gerçekten hazırsa ready olayı kaçmış kabul edilir.
    if (
      state === "CONNECTED"
      && webState.apiReady
      && typeof activeClient.getChats === "function"
    ) {
      await new Promise((r) => setTimeout(r, 800));
      if (!isReady && client === activeClient) markWhatsAppReady(reason);
    } else if (authAccepted) {
      lastError = "Telefon onayladı — WhatsApp Web API hazırlanıyor…";
    }
  } catch (e) {
    logger.warn({ err: e, reason }, "wa: ready promote kontrolü başarısız");
  }
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
    void startWhatsAppClient().catch((e) => {
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
        const old = client;
        client = null;
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
  clientPhase = "DESTROYING";
  logger.info({ sessionId: WA_CLIENT_ID, reason }, "wa: eski client temizleniyor");
  try {
    c.removeAllListeners?.();
  } catch { /* ignore */ }
  try {
    await withTimeout(Promise.resolve(c.destroy?.()), 10_000, "WhatsApp client destroy zaman aşımı");
  } catch (error) {
    logger.warn({ err: error, sessionId: WA_CLIENT_ID, reason }, "wa: client destroy tamamlanamadı");
  }
  if (client === c) client = null;
}

async function createWhatsAppClient(): Promise<any> {
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
      clientCreated: false,
    },
    "wa: merkezi client factory başlıyor",
  );

  const created = new ClientCtor({
    authStrategy: new LocalAuthCtor({ dataPath: AUTH_PATH, clientId: WA_CLIENT_ID }),
    puppeteer: {
      headless: true,
      executablePath,
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
  opts?: { phoneNumber?: string; force?: boolean },
): Promise<WhatsAppStartResult> {
  const pairingMode = !!(opts?.phoneNumber?.trim());
  const normalizedPhone = pairingMode
    ? normalizeTurkishWhatsAppPhone(opts!.phoneNumber!)
    : null;
  if (pairingMode && (!normalizedPhone || !isValidWaPhone(normalizedPhone))) {
    throw new WhatsAppStartError(
      `Geçersiz Türkiye telefon numarası. 0532..., 532... veya 90532... formatını kullanın.`,
      400,
      "INVALID_PHONE",
    );
  }

  if (starting || initializePromise || clientPhase === "INITIALIZING" || clientPhase === "AUTHENTICATED") {
    throw new WhatsAppStartError(
      `WhatsApp session ${WA_CLIENT_ID} zaten başlatılıyor (${clientPhase}). Mevcut işlemin tamamlanmasını bekleyin.`,
      409,
      "SESSION_STARTING",
    );
  }
  if (client && (isReady || clientPhase === "READY")) {
    throw new WhatsAppStartError(
      `WhatsApp session ${WA_CLIENT_ID} zaten bağlı.`,
      409,
      "SESSION_READY",
    );
  }

  // Kilit await öncesinde alınır; iki HTTP isteği aynı anda ikinci client oluşturamaz.
  starting = true;

  // Yalnız bozuk/eski client temizlenir; aktif client üstüne ikinci initialize asla yapılmaz.
  if (client) {
    const stale = client;
    await destroyWhatsAppClientInstance(stale, opts?.force ? "forced_stale_restart" : "stale_before_start");
    isReady = false;
  }

  clientPhase = "INITIALIZING";
  manualStop = false;
  qrDataUrl = null;
  pairingCode = null;
  pairingRequestPromise = null;
  pairingCodeRequested = false;
  pairingIntent = pairingMode;
  if (pairingMode || !hasWhatsAppLocalSession()) {
    authAccepted = false;
    sessionSoftRestartTried = false;
    readySyncTriggerTried = false;
  }
  stopReadyFallbackWatcher();
  lastError = pairingMode
    ? "WhatsApp client başlatılıyor; onay kodu hazırlanacak…"
    : (hasWhatsAppLocalSession() ? "Kayıtlı oturumla bağlanılıyor…" : null);
  pendingPhone = normalizedPhone;
  if (!pairingMode) pairingIntent = false;

  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pairingMode) {
      // Yeni telefon eşleşmesi, aktif client olmadığı doğrulandıktan sonra temiz session ile başlar.
      clearWhatsAppLocalSession(WA_CLIENT_ID);
      clearWhatsAppLocalSession(WA_PAIR_CLIENT_ID);
    }

    const created = await createWhatsAppClient();
    client = created;
    logger.info({ sessionId: WA_CLIENT_ID, initializeStarted: true, phase: clientPhase }, "wa: initialize başladı");
    try {
      initializePromise = withTimeout(
        Promise.resolve(created.initialize()),
        45_000,
        "WhatsApp client.initialize 45 saniye içinde tamamlanmadı",
      );
      await initializePromise;
    } catch (error) {
      throw new WhatsAppStartError(
        `WhatsApp client.initialize başarısız: ${error instanceof Error ? error.message : String(error)}`,
        503,
        "INITIALIZE_FAILED",
      );
    }
    if (client !== created) {
      throw new WhatsAppStartError("WhatsApp client başlatma sırasında değişti.", 503, "CLIENT_REPLACED");
    }

    const browserOpen = Boolean(created.pupBrowser?.isConnected?.());
    const pageOpen = Boolean(created.pupPage && !created.pupPage.isClosed?.());
    logger.info(
      { sessionId: WA_CLIENT_ID, initializeCompleted: true, browserOpen, pageOpen },
      "wa: initialize tamamlandı; browser kontrol edildi",
    );
    if (!browserOpen || !pageOpen) {
      throw new WhatsAppStartError(
        `Chromium hazır değil (browserOpen=${browserOpen}, pageOpen=${pageOpen}).`,
        503,
        "BROWSER_NOT_READY",
      );
    }

    if (pairingMode && pendingPhone && !isReady) {
      lastError = "Onay kodu isteniyor…";
      try {
        const code = pairingCode ?? await beginPairingCodeRequest(created, pendingPhone);
        return {
          phase: "pairing",
          pairingCode: code,
          qr: null,
          message: "Onay kodu başarıyla oluşturuldu.",
        };
      } catch (error) {
        await enableQrFallback(created, error);
        throw error;
      }
    }

    return {
      phase: isReady ? "ready" : "qr",
      pairingCode: null,
      qr: qrDataUrl,
      message: isReady ? "WhatsApp zaten bağlandı." : "QR bağlantısı başlatıldı.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lastError = msg.includes("ENOENT") || msg.includes("Chromium")
      ? `Chrome/Chromium bulunamadı. Deploy'da chromium kurulu olmalı. (${msg.slice(0, 200)})`
      : msg.slice(0, 500);
    const keepQrFallback = pairingMode
      && Boolean(client?.pupBrowser?.isConnected?.());
    if (!keepQrFallback) {
      const failedClient = client;
      if (failedClient) await destroyWhatsAppClientInstance(failedClient, "start_failed");
      isReady = false;
      clientPhase = "FAILED";
    }
    logger.error(
      {
        err: e,
        sessionId: WA_CLIENT_ID,
        phase: clientPhase,
        browserOpen: Boolean(client?.pupBrowser?.isConnected?.()),
        pairingMethodAvailable: typeof client?.requestPairingCode === "function",
      },
      "wa: start failed",
    );
    throw e;
  } finally {
    starting = false;
    initializePromise = null;
  }
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
    await startWhatsAppClient();
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
  return isReady && !!client;
}

export function getWhatsAppStatus() {
  let chromePath: string | null = null;
  try { chromePath = resolveExecutablePath(); } catch { chromePath = null; }
  const phase = isWhatsAppReady()
    ? "ready"
    : authAccepted
      ? "authenticating"
      : (pairingIntent || !!pairingCode)
        ? "pairing"
        : starting
          ? "starting"
          : "idle";
  return {
    ready: isWhatsAppReady(),
    connected: isWhatsAppReady(),
    starting,
    pairing: pairingIntent,
    authAccepted,
    phase,
    hasSession: hasWhatsAppLocalSession(),
    // Onay kodu modunda QR asla dönmesin
    qr: pairingIntent && !authAccepted ? null : (pairingIntent ? null : qrDataUrl),
    pairingCode: authAccepted ? null : pairingCode,
    phone: pendingPhone,
    error: lastError,
    chromePath,
    chromiumVersion: chromePath ? readChromiumVersion(chromePath) : null,
    browserOpen: Boolean(client?.pupBrowser?.isConnected?.()),
    pairingMethodAvailable: typeof client?.requestPairingCode === "function",
    wwebjsVersion: WWEBJS_VERSION,
    sessionId: WA_CLIENT_ID,
    clientPhase,
  };
}

export async function stopWhatsAppClient(): Promise<void> {
  manualStop = true;
  pairingIntent = false;
  authAccepted = false;
  sessionSoftRestartTried = false;
  readySyncTriggerTried = false;
  stopReadyFallbackWatcher();
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
  if (!client) {
    isReady = false;
    clientPhase = "IDLE";
    return;
  }
  const current = client;
  await destroyWhatsAppClientInstance(current, "manual_stop");
  isReady = false;
  clientPhase = "IDLE";
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
