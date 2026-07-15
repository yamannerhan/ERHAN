import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
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
/** Onay kodu alındığı an — UI'da tutmak için */
let pairingCodeAt = 0;
let ClientCtor: any = null;
let LocalAuthCtor: any = null;
/** Admin «Bağlantıyı Kes» — otomatik yeniden bağlanma yapma */
let manualStop = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
/** Pairing sırasında geçici kopmada yeniden başlatmayı sınırla */
let pairingReconnectScheduled = false;
/** Puppeteer sayfasını aynı anda getChats + deep fetch paylaşmasın */
let pageBusy: Promise<void> = Promise.resolve();

async function withWhatsAppPageLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = pageBusy;
  pageBusy = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || "./.wwebjs_auth";
const WA_CLIENT_ID = "ozelguvenlik";
const WA_PAIR_CLIENT_ID = "ozelguvenlik-pair";

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
  return starting;
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

function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // 05xxxxxxxxx → 905xxxxxxxxx
  if (d.length === 11 && d.startsWith("0")) d = "90" + d.slice(1);
  // 5xxxxxxxxx → 905xxxxxxxxx
  if (d.length === 10 && d.startsWith("5")) d = "90" + d;
  return d;
}

function isValidWaPhone(phone: string): boolean {
  // Uluslararası, sembolsüz (TR: 905xxxxxxxxx)
  return /^\d{10,15}$/.test(phone) && !phone.startsWith("0");
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

function isPairingCodeFresh(maxMs = 180_000): boolean {
  return !!(pairingCode && pairingCodeAt && Date.now() - pairingCodeAt < maxMs);
}

/** Kod geldikten sonra yenileme/yeniden istek handshake'i bozmasın */
async function lockPairingAfterCode(c: any): Promise<void> {
  try {
    if (c?.options?.pairWithPhoneNumber) {
      // framenavigated → inject() tekrar requestPairingCode çağırmasın
      c.options.pairWithPhoneNumber.phoneNumber = "";
    }
  } catch { /* ignore */ }
  try {
    await c?.pupPage?.evaluate?.(() => {
      const w = window as unknown as { codeInterval?: ReturnType<typeof setInterval> };
      if (w.codeInterval) {
        clearInterval(w.codeInterval);
        w.codeInterval = undefined;
      }
    });
  } catch { /* ignore */ }
}

function setPairingCode(code: string | null): void {
  if (!code) return;
  const raw = String(code).replace(/\s+/g, "").toUpperCase();
  if (raw.length < 6) return;
  // Aynı oturumda yeni kod gelirse (nadir) güncelle; kısa sürede spam'i yut
  if (pairingCode === raw) return;
  pairingCode = raw;
  pairingCodeAt = Date.now();
  qrDataUrl = null;
  lastError = "Telefonda kodu girin — bu ekranı kapatmayın, tekrar basmayın…";
  logger.info({ codeLen: raw.length, codePreview: `${raw.slice(0, 2)}**${raw.slice(-2)}` }, "wa: pairing code set");
  if (client) void lockPairingAfterCode(client);
}

function clearPairingCode(reason: string): void {
  if (!pairingCode) return;
  logger.info({ reason }, "wa: pairing code cleared");
  pairingCode = null;
  pairingCodeAt = 0;
}

function pairingErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  if (
    low.includes("rate") ||
    low.includes("overlimit") ||
    low.includes("429") ||
    /\bevaluation failed:\s*[ab]\b/i.test(msg)
  ) {
    return "WhatsApp geçici olarak engelledi (çok deneme). 15–30 dk bekleyin veya «QR ile Bağlan» kullanın.";
  }
  return `Onay kodu alınamadı: ${msg.slice(0, 180)}`;
}

function scheduleWhatsAppPairingReconnect(phone: string, reason: string): void {
  if (manualStop || pairingReconnectScheduled || isReady) return;
  // Kod beklenirken yeniden başlatma = telefonda «cihaz bağlanılamadı»
  if (isPairingCodeFresh()) {
    lastError = "Telefonda kodu girin — sunucu bekliyor. Tekrar basmayın.";
    logger.info({ reason, phone }, "wa: pairing reconnect atlandı (kod bekleniyor)");
    return;
  }
  pairingReconnectScheduled = true;
  const delay = 25_000;
  logger.info({ reason, delay, phone }, "wa: pairing ile yeniden bağlanma");
  lastError = "Bağlantı koptu — 25 sn sonra onay kodu yenilenecek…";
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    pairingReconnectScheduled = false;
    if (manualStop || isReady || isPairingCodeFresh()) return;
    void startWhatsAppClient({ phoneNumber: phone, force: true }).catch((e) => {
      logger.warn({ err: e }, "wa: pairing reconnect failed");
      lastError = pairingErrorMessage(e);
    });
  }, delay);
}

function attachHandlers(c: any): void {
  c.on("qr", async (qr: string) => {
    // Onay kodu modunda QR gösterme — pairWithPhoneNumber zaten kod üretir;
    // QR handler'dan requestPairingCode çağırmak kodu düşürür / hata verir.
    if (pairingIntent && pendingPhone) {
      logger.info("wa: QR yoksayıldı (onay kodu modu — pairWithPhoneNumber)");
      qrDataUrl = null;
      if (pairingCode) {
        lastError = "Telefonda kodu girin — bağlantı bekleniyor…";
      } else {
        lastError = "Onay kodu hazırlanıyor… QR kullanılmayacak.";
      }
      return;
    }

    logger.info("wa: QR received");
    lastError = null;
    clearPairingCode("qr_mode");
    try {
      qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2, errorCorrectionLevel: "M" });
      logger.info("wa: QR data URL hazır");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  });

  c.on("loading_screen", (percent: string, message: string) => {
    logger.info(`wa: loading ${percent}% ${message}`);
    if (pairingIntent) {
      lastError = `Oturum yükleniyor… %${percent}`;
    }
  });

  c.on("code", (code: string) => {
    setPairingCode(code);
    void lockPairingAfterCode(c);
  });

  c.on("change_state", (state: string) => {
    logger.info({ state }, "wa: state");
    if (pairingIntent && /PAIRING|OPENING|CONNECTED|TIMEOUT/i.test(String(state))) {
      lastError = `Telefon bağlanıyor (${state}) — bekleyin, tekrar basmayın…`;
    }
  });

  c.on("authenticated", () => {
    logger.info("wa: authenticated");
    // Auth oldu — artık yeni pairing kodu isteme / session silme
    void lockPairingAfterCode(c);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    pairingReconnectScheduled = false;
    lastError = pairingIntent
      ? "Telefon doğrulandı — oturum açılıyor, 1–2 dk bekleyin…"
      : null;
  });

  c.on("ready", () => {
    logger.info("wa: connected");
    isReady = true;
    qrDataUrl = null;
    clearPairingCode("ready");
    pendingPhone = null;
    pairingIntent = false;
    pairingCodeRequested = false;
    pairingReconnectScheduled = false;
    lastError = null;
    reconnectAttempts = 0;
    manualStop = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    startWhatsAppWatchdog();
    void import("../workers/scraper").then((m) => {
      if (typeof m.onWhatsAppReady === "function") m.onWhatsAppReady();
    }).catch(() => {});
  });

  c.on("disconnected", (reason: string) => {
    const reasonStr = String(reason ?? "unknown");
    logger.warn(`wa: disconnected - ${reasonStr}`);
    const wasReady = isReady;
    isReady = false;
    stopWhatsAppWatchdog();
    const wasPairing = pairingIntent && !!pendingPhone;
    const savedPhone = pendingPhone;
    qrDataUrl = null;

    // KRİTİK: Kod girilirken client.destroy = telefonda «cihaz bağlanılamadı»
    if (wasPairing && savedPhone && isPairingCodeFresh()) {
      pairingIntent = true;
      pendingPhone = savedPhone;
      lastError = "Doğrulama sürüyor — kodu girdiyseniz bekleyin. Tekrar basmayın / sayfayı yenilemeyin…";
      logger.info({ reason: reasonStr }, "wa: pairing disconnect — client YOK EDİLMEDİ");
      const kept = client;
      setTimeout(() => {
        if (isReady || manualStop) return;
        if (!pairingIntent || !pendingPhone) return;
        const browser = kept?.pupBrowser as { isConnected?: () => boolean } | undefined;
        const pageAlive = !!kept?.pupPage;
        const browserAlive = !browser || browser.isConnected?.() !== false;
        if (client === kept && pageAlive && browserAlive) {
          lastError = "Hâlâ bekleniyor — WhatsApp’ta kodu girin veya «Bağlandı» olana kadar bekleyin…";
          return;
        }
        logger.warn({ reason: reasonStr }, "wa: pairing client gerçekten öldü");
        clearPairingCode(`pairing_dead:${reasonStr}`);
        try { if (client === kept) client = null; void kept?.destroy?.(); } catch { /* ignore */ }
        scheduleWhatsAppPairingReconnect(savedPhone, `dead:${reasonStr}`);
      }, 30_000);
      return;
    }

    // Auth sonrası ready öncesi kısa kopma — session ile toparlanabilir
    if (wasPairing && savedPhone && !wasReady && !isPairingCodeFresh()) {
      const old = client;
      client = null;
      lastError = `Bağlantı koptu (${reasonStr}) — onay kodu yenilenecek…`;
      try { void old?.destroy?.(); } catch { /* ignore */ }
      scheduleWhatsAppPairingReconnect(savedPhone, reasonStr);
      return;
    }

    const old = client;
    client = null;
    clearPairingCode(`disconnect:${reasonStr}`);
    lastError = `Bağlantı koptu: ${reasonStr}`;
    try { void old?.destroy?.(); } catch { /* ignore */ }
    scheduleWhatsAppReconnect(reasonStr);
  });

  c.on("auth_failure", (msg: string) => {
    logger.error(`wa: auth failure - ${msg}`);
    isReady = false;
    stopWhatsAppWatchdog();
    const wasPairing = pairingIntent && !!pendingPhone;
    const savedPhone = pendingPhone;
    const old = client;
    client = null;
    qrDataUrl = null;
    clearPairingCode("auth_failure");
    pairingCodeRequested = false;
    lastError = `Kimlik doğrulama hatası: ${msg}. «QR ile Bağlan» deneyin.`;
    try { void old?.destroy?.(); } catch { /* ignore */ }
    // Auth fail'de hemen tekrar pairing = rate-limit; kullanıcıya bırak
    if (wasPairing && savedPhone) {
      lastError = `Doğrulama başarısız (${msg}). 2 dk bekleyip tekrar deneyin veya QR kullanın.`;
      return;
    }
    if (!manualStop && reconnectAttempts < 2) scheduleWhatsAppReconnect(`auth_failure:${msg}`);
  });
}

function scheduleWhatsAppReconnect(reason: string): void {
  if (manualStop) return;
  // Pairing modundayken QR'sız reconnect yapma
  if (pairingIntent && pendingPhone) {
    scheduleWhatsAppPairingReconnect(pendingPhone, reason);
    return;
  }
  if (reconnectTimer) return;
  reconnectAttempts++;
  if (reconnectAttempts > 20) {
    lastError = `WhatsApp tekrar bağlanamadı (${reason}). Admin panelinden QR/onay ile bağlanın.`;
    logger.error({ reason, reconnectAttempts }, "wa: reconnect vazgeçildi");
    reconnectAttempts = 0;
    return;
  }
  const delay = Math.min(45_000, 3_000 * Math.min(reconnectAttempts, 8));
  logger.info({ reason, delay, reconnectAttempts }, "wa: otomatik yeniden bağlanma planlandı");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (manualStop || isReady) return;
    if (pairingIntent && pendingPhone) {
      void startWhatsAppClient({ phoneNumber: pendingPhone, force: true }).catch((e) => {
        logger.warn({ err: e }, "wa: pairing auto-reconnect failed");
        scheduleWhatsAppPairingReconnect(pendingPhone!, "retry");
      });
      return;
    }
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

export async function startWhatsAppClient(opts?: { phoneNumber?: string; force?: boolean }): Promise<void> {
  const pairingMode = !!(opts?.phoneNumber?.trim());
  const force = opts?.force === true || pairingMode;

  if (isReady && client && !force) return;
  if (starting && !force) return;

  if (force && (client || isReady || starting)) {
    stopWhatsAppWatchdog();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const old = client;
    client = null;
    isReady = false;
    starting = false;
    try { await old?.destroy?.(); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (starting) return;
  starting = true;
  manualStop = false;
  qrDataUrl = null;
  pairingCodeRequested = false;
  pairingIntent = pairingMode;
  pairingReconnectScheduled = false;

  if (pairingMode) {
    pendingPhone = normalizePhone(opts!.phoneNumber!);
    if (!isValidWaPhone(pendingPhone)) {
      starting = false;
      pairingIntent = false;
      lastError = `Geçersiz numara: ${pendingPhone}. Örn: 905xxxxxxxxx (ülke kodu ile)`;
      throw new Error(lastError);
    }
    // Yeniden bağlanırken eski kodu hemen silme — yenisi gelene kadar ekranda kalsın
    if (!pairingCode || Date.now() - pairingCodeAt > 120_000) {
      clearPairingCode("pairing_start");
    }
    lastError = pairingCode
      ? "Telefonda kodu girin — oturum yenileniyor…"
      : "Onay kodu hazırlanıyor… QR kullanılmayacak.";
    // Eski oturum QR'a düşürüyor — pairing için temiz oturum
    clearWhatsAppLocalSession(WA_CLIENT_ID);
    clearWhatsAppLocalSession(WA_PAIR_CLIENT_ID);
  } else {
    pendingPhone = null;
    pairingIntent = false;
    clearPairingCode("qr_start");
    lastError = null;
  }

  try {
    await loadWhatsAppLib();

    if (client) {
      try { await client.destroy(); } catch { /* ignore */ }
      client = null;
      isReady = false;
    }

    const executablePath = resolveExecutablePath();
    logger.info({ executablePath, pairingMode, phone: pendingPhone }, "wa: Chromium yolu");

    const clientOpts: Record<string, unknown> = {
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
      authTimeoutMs: 180_000,
      deviceName: "Ozel Guvenlik",
      browserName: "Chrome",
      // Başka sekme çakışmasında oturumu al
      takeoverOnConflict: true,
      takeoverTimeoutMs: 5_000,
    };

    // Resmi yol: SADECE pairWithPhoneNumber.
    // intervalMs yüksek: kod yenilenince telefonda «cihaz bağlanılamadı» olur.
    if (pairingMode && pendingPhone) {
      clientOpts.pairWithPhoneNumber = {
        phoneNumber: pendingPhone,
        showNotification: true,
        intervalMs: 600_000,
      };
      pairingCodeRequested = true;
    }

    client = new ClientCtor(clientOpts);
    attachHandlers(client);

    // inject() requestPairingCode'u await etmez; sonucu/hatayı burada yakala
    let pairingRequestError: unknown = null;
    let pairingRequestDone = false;
    if (pairingMode && typeof client.requestPairingCode === "function") {
      const originalRequest = client.requestPairingCode.bind(client);
      client.requestPairingCode = async (...args: unknown[]) => {
        try {
          const code = await originalRequest(...args);
          pairingRequestDone = true;
          if (code) setPairingCode(String(code));
          return code;
        } catch (e) {
          // inject() await etmez; throw unhandledRejection olur — yut, hatayı kaydet
          pairingRequestDone = true;
          pairingRequestError = e;
          logger.warn({ err: e, phone: pendingPhone }, "wa: pairWithPhoneNumber isteği hata");
          return null;
        }
      };
    }

    await client.initialize();

    if (pairingMode && pendingPhone && !isReady) {
      // Kod `code` event veya requestPairingCode return ile gelir
      for (let i = 0; i < 45 && !pairingCode && !isReady; i++) {
        if (pairingRequestDone && pairingRequestError && !pairingCode) break;
        await new Promise((r) => setTimeout(r, 1000));
        if (i === 4 || i === 14) {
          lastError = `Onay kodu bekleniyor… (${pendingPhone})`;
        }
      }
      if (!pairingCode && !isReady) {
        lastError = pairingRequestError
          ? pairingErrorMessage(pairingRequestError)
          : `Onay kodu henüz gelmedi (${pendingPhone}). 1 dk bekleyip bir kez daha deneyin; olmazsa QR kullanın.`;
        logger.warn({ phone: pendingPhone, hasErr: !!pairingRequestError }, "wa: pairing code gelmedi");
      } else if (pairingCode && !isReady) {
        lastError = "Telefonda kodu girin — bağlantı bekleniyor…";
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lastError = msg.includes("ENOENT") || msg.includes("Chromium")
      ? `Chrome/Chromium bulunamadı. Deploy'da chromium kurulu olmalı. (${msg.slice(0, 200)})`
      : msg.slice(0, 500);
    client = null;
    isReady = false;
    logger.error({ err: e }, "wa: start failed");
    throw e;
  } finally {
    starting = false;
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
  return {
    ready: isWhatsAppReady(),
    connected: isWhatsAppReady(),
    starting,
    pairing: pairingIntent,
    hasSession: hasWhatsAppLocalSession(),
    // Onay kodu modunda QR asla dönmesin
    qr: pairingIntent ? null : qrDataUrl,
    pairingCode,
    phone: pendingPhone,
    error: lastError,
    chromePath,
  };
}

export async function stopWhatsAppClient(): Promise<void> {
  manualStop = true;
  pairingIntent = false;
  pairingCodeRequested = false;
  pairingReconnectScheduled = false;
  pendingPhone = null;
  stopWhatsAppWatchdog();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  clearPairingCode("stop");
  if (!client) {
    isReady = false;
    return;
  }
  try {
    await client.destroy();
  } catch { /* ignore */ }
  client = null;
  isReady = false;
  qrDataUrl = null;
}

export async function fetchWhatsAppGroups(): Promise<WhatsAppChannel[]> {
  if (!client || !isReady) return [];
  return withWhatsAppPageLock(async () => {
    const byId = new Map<string, WhatsAppChannel>();

    const pullChats = async () => {
      const chats = await client.getChats();
      for (const c of chats as any[]) {
        const id = String(c?.id?._serialized ?? "");
        if (!id) continue;
        const isChannel = !!(c.isChannel || c.isNewsletter || id.endsWith("@newsletter"));
        const isGroup = !!(c.isGroup || id.endsWith("@g.us"));
        if (!isChannel && !isGroup) continue;
        byId.set(id, {
          id,
          name: String(c.name || c.formattedTitle || id),
          participants: Number(c.participants?.length ?? c.groupMetadata?.participants?.length ?? 0) || 0,
          kind: isChannel ? "channel" : "group",
        });
      }
    };

    try {
      await pullChats();
    } catch (e) {
      logger.warn({ err: e }, "wa: getChats failed — retry");
      await new Promise((r) => setTimeout(r, 1500));
      try {
        await pullChats();
      } catch (e2) {
        logger.warn({ err: e2 }, "wa: getChats retry failed");
      }
    }

    // Abone olunan kanallar — getChats bazen eksik bırakır
    try {
      if (typeof client.getChannels === "function") {
        const channels = await client.getChannels();
        for (const c of channels as any[]) {
          const id = String(c?.id?._serialized ?? "");
          if (!id) continue;
          byId.set(id, {
            id,
            name: String(c.name || c.formattedTitle || id),
            participants: Number(c.subscribersCount ?? c.participants?.length ?? 0) || 0,
            kind: "channel",
          });
        }
      }
    } catch (e) {
      logger.warn({ err: e }, "wa: getChannels failed");
    }

    return [...byId.values()].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "group" ? -1 : 1;
      return a.name.localeCompare(b.name, "tr");
    });
  });
}

/** WA timestamp sn veya ms olabilir */
function waTsToMs(raw: unknown): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // 1e12 ≈ 2001 ms; daha küçükse saniye kabul et
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
}

function extractWaText(m: any): string {
  const raw = m?.body
    ?? m?.caption
    ?? m?._data?.body
    ?? m?._data?.caption
    ?? m?.list?.description
    ?? m?.hydratedButtonsMessage?.contentText
    ?? m?.text
    ?? "";
  return String(raw).trim();
}

async function resolveWhatsAppChat(groupJid: string): Promise<any | null> {
  if (!client) return null;
  const jid = String(groupJid || "").trim();
  if (!jid) return null;

  try {
    const chat = await client.getChatById(jid);
    if (chat) return chat;
  } catch (e) {
    logger.warn({ err: e, groupJid: jid }, "wa: getChatById failed");
  }

  if (jid.includes("@newsletter")) {
    try {
      if (typeof client.getChannelById === "function") {
        const ch = await client.getChannelById(jid);
        if (ch) return ch;
      }
    } catch (e) {
      logger.warn({ err: e, groupJid: jid }, "wa: getChannelById failed");
    }
  }

  try {
    const chats = await client.getChats();
    const exact = (chats as any[]).find((c) => String(c?.id?._serialized ?? "") === jid);
    if (exact) return exact;
    const local = jid.split("@")[0] || "";
    if (local) {
      const fuzzy = (chats as any[]).find((c) => {
        const id = String(c?.id?._serialized ?? "");
        return id.startsWith(`${local}@`) || id.includes(local);
      });
      if (fuzzy) {
        logger.info({ wanted: jid, found: fuzzy.id?._serialized }, "wa: chat fuzzy eşleşti");
        return fuzzy;
      }
    }
  } catch (e) {
    logger.warn({ err: e, groupJid: jid }, "wa: getChats fallback failed");
  }
  return null;
}

/** Store'daki metin mesajlarını cutoff sonrası oku (WA bellek penceresi kaydığı için tur tur biriktirilir). */
async function harvestStoreMessages(
  page: { evaluate: (fn: (...args: any[]) => any, ...args: any[]) => Promise<any> },
  chatId: string,
  groupJid: string,
  cutoff: number,
  byId: Map<string, WhatsAppMessage>,
): Promise<{ count: number; oldest: number; raw: number }> {
  const storeMsgs: Array<{ id: string; text: string; timestamp: number }> = await page.evaluate(
    (id: string, cut: number) => {
      const w = window as any;
      const models = w.Store?.Chat?.models || [];
      const storeChat =
        w.Store?.Chat?.get?.(id) ||
        w.Store?.Chat?.find?.(id) ||
        models.find((c: any) => c?.id?._serialized === id) ||
        models.find((c: any) => String(c?.id?._serialized || "").includes(String(id).split("@")[0] || "__none__"));
      if (!storeChat) return [];
      const arr = storeChat.msgs?.getModelsArray?.() ?? storeChat.msgs?.models ?? [];
      const out: Array<{ id: string; text: string; timestamp: number }> = [];
      for (const m of arr) {
        const mid = m.id?._serialized;
        const rawT = Number(m.t ?? m.timestamp ?? 0);
        const ts = rawT > 0 && rawT < 1e12 ? rawT * 1000 : rawT;
        if (!mid || !ts || ts <= cut) continue;
        const text = String(
          m.body
          ?? m.caption
          ?? m.list?.description
          ?? m.hydratedButtonsMessage?.contentText
          ?? "",
        ).trim();
        if (!text || text.length < 4) continue;
        out.push({ id: mid, text, timestamp: ts });
      }
      return out;
    },
    chatId,
    cutoff,
  ).catch(() => [] as Array<{ id: string; text: string; timestamp: number }>);
  let oldest = Date.now();
  for (const m of storeMsgs) {
    byId.set(m.id, { id: m.id, remoteJid: groupJid, text: m.text, timestamp: m.timestamp });
    if (m.timestamp < oldest) oldest = m.timestamp;
  }
  return { count: storeMsgs.length, oldest: storeMsgs.length ? oldest : Date.now(), raw: storeMsgs.length };
}

export type WhatsAppFetchResult = {
  messages: WhatsAppMessage[];
  oldestTs: number;
  /** Hedef güne (örn. 30g) ulaşıldı */
  reachedCutoff: boolean;
  /** Chromium/WA daha eski yükleyemiyor — gidebildiği kadar bitti */
  historyExhausted: boolean;
  rounds: number;
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
  } = {},
): Promise<WhatsAppFetchResult> {
  if (!client || !isReady) {
    return { messages: [], oldestTs: Date.now(), reachedCutoff: false, historyExhausted: false, rounds: 0 };
  }

  return withWhatsAppPageLock(() => fetchWhatsAppMessagesDetailedUnlocked(groupJid, opts));
}

async function fetchWhatsAppMessagesDetailedUnlocked(
  groupJid: string,
  opts: {
    afterTimestampMs?: number;
    limit?: number;
    maxAgeDays?: number;
    deep?: boolean;
  },
): Promise<WhatsAppFetchResult> {
  const page = (client as any).pupPage;
  const cutoff = opts.afterTimestampMs != null
    ? opts.afterTimestampMs
    : (Date.now() - (opts.maxAgeDays ?? 730) * 24 * 60 * 60 * 1000);

  try {
    await (client as any).interface?.openChatWindow?.(groupJid);
    await new Promise((r) => setTimeout(r, 1800));
  } catch { /* ignore */ }

  let chat = await resolveWhatsAppChat(groupJid);
  if (!chat) {
    // Bir kez daha açıp dene — WA sohbet listesi gecikebilir
    try {
      await (client as any).interface?.openChatWindow?.(groupJid);
      await new Promise((r) => setTimeout(r, 2500));
    } catch { /* ignore */ }
    chat = await resolveWhatsAppChat(groupJid);
  }
  if (!chat) {
    logger.warn({ groupJid }, "wa: sohbet bulunamadı");
    return { messages: [], oldestTs: Date.now(), reachedCutoff: false, historyExhausted: false, rounds: 0 };
  }

  const chatId = String((chat as any).id?._serialized ?? groupJid);
  if (page) {
    try {
      await page.evaluate((jid: string) => {
        const w = window as any;
        const models = w.Store?.Chat?.models || [];
        const storeChat =
          w.Store?.Chat?.get?.(jid) ||
          w.Store?.Chat?.find?.(jid) ||
          models.find((c: any) => c?.id?._serialized === jid);
        if (storeChat?.presence?.subscribe) storeChat.presence.subscribe();
        if (typeof storeChat?.syncHistory === "function") {
          try { storeChat.syncHistory(); } catch { /* ignore */ }
        }
      }, chatId);
    } catch { /* ignore */ }
  }

  try {
    if (typeof chat.syncHistory === "function") {
      const synced = await chat.syncHistory();
      logger.info({ groupJid: chatId, synced }, "wa: syncHistory");
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (e) {
    logger.warn({ err: e, groupJid: chatId }, "wa: syncHistory failed");
  }

  const byId = new Map<string, WhatsAppMessage>();
  let rounds = 0;
  let reachedCutoff = false;
  let historyExhausted = false;
  let rawSeen = 0;

  const ingestMessage = (m: any): boolean => {
    const id = String(m?.id?._serialized ?? m?.id ?? "");
    if (!id || byId.has(id)) return false;
    const ts = waTsToMs(m?.timestamp ?? m?.t ?? m?._data?.t);
    if (!ts || ts <= cutoff) return false;
    const text = extractWaText(m);
    if (!text || text.length < 4) return false;
    byId.set(id, { id, remoteJid: chatId, text, timestamp: ts });
    return true;
  };

  const pullFetchMessages = async (limit: number) => {
    try {
      const batch = (await chat.fetchMessages({ limit })) ?? [];
      rawSeen += batch.length;
      let kept = 0;
      for (const m of batch) {
        if (ingestMessage(m)) kept += 1;
      }
      logger.info({ groupJid: chatId, limit, batch: batch.length, kept, total: byId.size }, "wa: fetchMessages");
      return batch.length;
    } catch (e) {
      logger.warn({ err: e, groupJid: chatId, limit }, "wa: fetchMessages failed");
      return 0;
    }
  };

  // Önce sığ çekim — en azından son mesajlar gelsin
  for (const lim of [50, 100, 200, Math.min(opts.limit ?? 300, 500)]) {
    await pullFetchMessages(lim);
    if (byId.size > 0) break;
    await new Promise((r) => setTimeout(r, 800));
  }

  if (opts.deep && page) {
    await harvestStoreMessages(page, chatId, chatId, cutoff, byId);
    if (byId.size === 0) await pullFetchMessages(500);

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
          const storeChat =
            w.Store?.Chat?.get?.(id) ||
            w.Store?.Chat?.find?.(id) ||
            (w.Store?.Chat?.models || []).find((c: any) => c?.id?._serialized === id);
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
      const harvested = await harvestStoreMessages(page, chatId, chatId, cutoff, byId);
      if (i % 5 === 0) await pullFetchMessages(Math.min(2000, 300 + i * 20));

      const oldest = Math.min(info.oldest ?? Date.now(), harvested.oldest);
      const count = info.count ?? 0;

      if (i % 5 === 0 || oldest <= cutoff || byId.size !== lastHarvested) {
        logger.info(
          {
            groupJid: chatId,
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
            { groupJid: chatId, rounds: i + 1, harvested: byId.size, oldest: new Date(oldest).toISOString(), stagnant },
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

    try {
      if (typeof chat.syncHistory === "function") await chat.syncHistory();
    } catch { /* ignore */ }
    await pullFetchMessages(2000);
    await harvestStoreMessages(page, chatId, chatId, cutoff, byId);

    const finalOldest = [...byId.values()].reduce((min, m) => Math.min(min, m.timestamp), Date.now());
    if (finalOldest <= cutoff) {
      reachedCutoff = true;
      historyExhausted = false;
    } else if (!reachedCutoff && byId.size > 0) {
      historyExhausted = true;
    }
  } else if (page) {
    await harvestStoreMessages(page, chatId, chatId, cutoff, byId);
    if (byId.size === 0) await pullFetchMessages(Math.min(opts.limit ?? 300, 500));
    rounds = Math.max(1, rounds);
    const finalOldest = [...byId.values()].reduce((min, m) => Math.min(min, m.timestamp), Date.now());
    reachedCutoff = byId.size === 0 || finalOldest <= cutoff;
    historyExhausted = !reachedCutoff && byId.size > 0;
  }

  // Hâlâ boşsa son şans: sohbeti yeniden aç + küçük fetch
  if (byId.size === 0) {
    try {
      await (client as any).interface?.openChatWindow?.(chatId);
      await new Promise((r) => setTimeout(r, 3000));
      chat = await resolveWhatsAppChat(chatId) || chat;
      await pullFetchMessages(100);
      if (page) await harvestStoreMessages(page, chatId, chatId, cutoff, byId);
    } catch (e) {
      logger.warn({ err: e, groupJid: chatId }, "wa: son şans fetch failed");
    }
  }

  const out = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
  const oldestTs = out.length ? out[0]!.timestamp : Date.now();
  logger.info(
    {
      groupJid: chatId,
      inRange: out.length,
      rawSeen,
      deep: !!opts.deep,
      reachedCutoff,
      historyExhausted,
      rounds,
      oldest: new Date(oldestTs).toISOString(),
      cutoff: new Date(cutoff).toISOString(),
    },
    "wa: mesajlar hazır (eski→yeni)",
  );
  return { messages: out, oldestTs, reachedCutoff, historyExhausted, rounds };
}

export async function sendWhatsAppMessage(jid: string, text: string): Promise<void> {
  if (!client || !isReady) throw new Error("WhatsApp not connected");
  await client.sendMessage(jid, text);
}
