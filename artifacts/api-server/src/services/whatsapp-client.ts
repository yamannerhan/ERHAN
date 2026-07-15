import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger";
import {
  discoverWhatsAppSources,
  fetchMessagesFromChat,
  type WhatsAppDiscoveryResult,
} from "./whatsapp-core";

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
let ClientCtor: any = null;
let LocalAuthCtor: any = null;
/** Admin «Bağlantıyı Kes» — otomatik yeniden bağlanma yapma */
let manualStop = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
/** Aynı Puppeteer sayfasında grup keşfi ve geçmiş taraması yarışmasın. */
let pageBusy: Promise<void> = Promise.resolve();

async function withWhatsAppPageLock<T>(operation: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = pageBusy;
  pageBusy = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    return await operation();
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

export type WhatsAppDiscoveryDiagnostics = {
  ready: boolean;
  state: string | null;
  wwebVersion: string | null;
  chatCount: number;
  groupCount: number;
  channelCount: number;
  errors: string[];
  steps: string[];
};

let lastDiscoveryResult: WhatsAppDiscoveryResult | null = null;

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

function setPairingCode(code: string | null): void {
  if (!code) return;
  const raw = String(code).replace(/\s+/g, "").toUpperCase();
  if (raw.length < 6) return;
  pairingCode = raw;
  qrDataUrl = null;
  lastError = null;
  logger.info({ codeLen: raw.length }, "wa: pairing code set");
}

function attachHandlers(c: any): void {
  c.on("qr", async (qr: string) => {
    // pairWithPhoneNumber kodu kendi üretir. Buradan ikinci kez kod istemek
    // ekrandaki ilk kodu geçersiz kılar ve telefonda "kod yanlış" hatası verir.
    if (pairingIntent && pendingPhone) {
      logger.info("wa: QR yoksayıldı (onay kodu modu)");
      qrDataUrl = null;
      return;
    }

    logger.info("wa: QR received");
    lastError = null;
    pairingCode = null;
    try {
      qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2, errorCorrectionLevel: "M" });
      logger.info("wa: QR data URL hazır");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  });

  c.on("loading_screen", (percent: string, message: string) => {
    logger.info(`wa: loading ${percent}% ${message}`);
  });

  c.on("code", (code: string) => {
    setPairingCode(code);
  });

  c.on("authenticated", () => {
    logger.info("wa: authenticated");
    lastError = null;
  });

  c.on("ready", () => {
    logger.info("wa: connected");
    isReady = true;
    qrDataUrl = null;
    pairingCode = null;
    pendingPhone = null;
    pairingIntent = false;
    pairingCodeRequested = false;
    lastError = null;
    reconnectAttempts = 0;
    manualStop = false;
    startWhatsAppWatchdog();
    void import("../workers/scraper").then((m) => {
      if (typeof m.onWhatsAppReady === "function") m.onWhatsAppReady();
    }).catch(() => {});
  });

  c.on("disconnected", (reason: string) => {
    logger.warn(`wa: disconnected - ${reason}`);
    isReady = false;
    stopWhatsAppWatchdog();
    const old = client;
    client = null;
    qrDataUrl = null;
    pairingCode = null;
    lastError = `Bağlantı koptu: ${reason}`;
    try { void old?.destroy?.(); } catch { /* ignore */ }
    scheduleWhatsAppReconnect(reason);
  });

  c.on("auth_failure", (msg: string) => {
    logger.error(`wa: auth failure - ${msg}`);
    isReady = false;
    stopWhatsAppWatchdog();
    client = null;
    qrDataUrl = null;
    pairingCode = null;
    lastError = `Kimlik doğrulama hatası: ${msg}`;
    if (!manualStop && reconnectAttempts < 2) scheduleWhatsAppReconnect(`auth_failure:${msg}`);
  });
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
      // Yalnız whatsapp-web.js genel API'siyle bağlantı durumunu doğrula.
      if (typeof client.getState === "function") {
        void client.getState().then((state: string | null) => {
          if (state && state !== "CONNECTED") {
            logger.warn({ state }, "wa: watchdog istemci durumu hazır değil");
          }
        }).catch((error: unknown) => {
          logger.warn({ err: error }, "wa: watchdog getState başarısız");
        });
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
  pairingCode = null;
  pairingCodeRequested = false;
  pairingIntent = pairingMode;
  lastError = pairingMode ? "Onay kodu hazırlanıyor… QR kullanılmayacak." : null;

  if (pairingMode) {
    pendingPhone = normalizePhone(opts!.phoneNumber!);
    if (!isValidWaPhone(pendingPhone)) {
      starting = false;
      pairingIntent = false;
      lastError = `Geçersiz numara: ${pendingPhone}. Örn: 905xxxxxxxxx (ülke kodu ile)`;
      throw new Error(lastError);
    }
    // Eski oturum QR'a düşürüyor — pairing için hem ana hem pair session temizle
    clearWhatsAppLocalSession(WA_CLIENT_ID);
    clearWhatsAppLocalSession(WA_PAIR_CLIENT_ID);
  } else {
    pendingPhone = null;
    pairingIntent = false;
  }

  try {
    await loadWhatsAppLib();

    if (client) {
      try { await client.destroy(); } catch { /* ignore */ }
      client = null;
      isReady = false;
    }

    const executablePath = resolveExecutablePath();
    // Aynı clientId: pairing sonrası oturum auto-reconnect ile bulunsun
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
    };

    // Dolu phoneNumber → kod; boş/yok → QR. Pairing'de mutlaka phoneNumber ver.
    if (pairingMode && pendingPhone) {
      clientOpts.pairWithPhoneNumber = {
        phoneNumber: String(pendingPhone),
        showNotification: true,
        intervalMs: 180_000,
      };
    }

    client = new ClientCtor(clientOpts);
    attachHandlers(client);

    await client.initialize();

    // Kod yalnızca constructor'daki pairWithPhoneNumber tarafından üretilir.
    // Manuel ikinci istek mevcut kodu geçersiz kıldığı için sadece code event'i bekle.
    if (pairingMode && pendingPhone && !isReady && !pairingCode) {
      lastError = "Onay kodu hazırlanıyor…";
      pairingCodeRequested = true;
      for (let i = 0; i < 40 && !pairingCode && !isReady; i++) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!pairingCode && !isReady) {
        lastError = "Onay kodu gelmedi. «Onay Kodu ile Bağlan»a bir kez daha basın.";
        logger.warn({ phone: pendingPhone }, "wa: pairing code gelmedi");
      } else if (pairingCode) {
        lastError = "Bu kodu telefona girin; yeni kod istemeden bağlantıyı bekleyin.";
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
  pendingPhone = null;
  stopWhatsAppWatchdog();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
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
  pairingCode = null;
}

export async function fetchWhatsAppGroups(): Promise<WhatsAppChannel[]> {
  if (!client || !isReady) return [];
  let discovery = await discoverWhatsAppSources(client);

  if (discovery.errors.some((error) => error.startsWith("getChats hatası:"))) {
    let state: unknown = null;
    let wwebVersion: unknown = null;
    let pageClosed: unknown = null;
    try { state = await client.getState?.(); } catch { /* tanıda kalır */ }
    try { wwebVersion = await client.getWWebVersion?.(); } catch { /* tanıda kalır */ }
    try { pageClosed = client.pupPage?.isClosed?.(); } catch { /* tanıda kalır */ }
    logger.error(
      { errors: discovery.errors, state, wwebVersion, pageClosed, hasSession: hasWhatsAppLocalSession() },
      "wa: getChats başarısız — istemci tanısı",
    );

    // Kararlı API'nin kendi state resetini yalnız bir kez dene; session silinmez.
    if (typeof client.resetState === "function") {
      try {
        await client.resetState();
        const retry = await discoverWhatsAppSources(client);
        const merged = new Map(discovery.sources.map((source) => [source.id, source]));
        for (const source of retry.sources) merged.set(source.id, source);
        discovery = {
          ...retry,
          sources: [...merged.values()],
          errors: [...discovery.errors, ...retry.errors],
          steps: [...discovery.steps, "getChats: resetState sonrası tek retry", ...retry.steps],
        };
      } catch (error) {
        discovery.errors.push(`resetState/retry hatası: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
      }
    }
  }

  lastDiscoveryResult = discovery;
  for (const error of discovery.errors) logger.warn({ error }, "wa: kaynak keşif hatası");
  return discovery.sources;
}

export async function getWhatsAppDiscoveryDiagnostics(): Promise<WhatsAppDiscoveryDiagnostics> {
  let state: string | null = null;
  let wwebVersion: string | null = null;
  if (!client || !isReady) {
    return {
      ready: false,
      state,
      wwebVersion,
      chatCount: 0,
      groupCount: 0,
      channelCount: 0,
      errors: ["WhatsApp istemcisi hazır değil."],
      steps: [],
    };
  }
  try { state = String(await client.getState?.() ?? "") || null; } catch { /* sonuçta hata logu var */ }
  try { wwebVersion = String(await client.getWWebVersion?.() ?? "") || null; } catch { /* sonuçta hata logu var */ }
  const discovery = lastDiscoveryResult ?? await discoverWhatsAppSources(client);
  lastDiscoveryResult = discovery;
  return {
    ready: true,
    state,
    wwebVersion,
    chatCount: discovery.chatCount,
    groupCount: discovery.groupCount,
    channelCount: discovery.channelCount,
    errors: discovery.errors,
    steps: [
      `Client state: ${state ?? "bilinmiyor"}`,
      `WhatsApp Web sürümü: ${wwebVersion ?? "bilinmiyor"}`,
      ...discovery.steps,
    ],
  };
}

async function resolveWhatsAppChat(groupJid: string): Promise<any | null> {
  if (!client) return null;
  const jid = String(groupJid || "").trim();
  if (!jid) return null;

  // Chat indeksinin hazır olması gecikebilir; önce doğrudan sohbeti dene.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const chat = await client.getChatById(jid);
      if (chat) return chat;
    } catch (e) {
      if (attempt === 2) logger.warn({ err: e, groupJid: jid }, "wa: getChatById failed");
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  // Kanallar, getChatById yerine özel API ile çözümlenebiliyor.
  if (jid.includes("@newsletter") && typeof client.getChannelById === "function") {
    try {
      const channel = await client.getChannelById(jid);
      if (channel) return channel;
    } catch (e) {
      logger.warn({ err: e, groupJid: jid }, "wa: getChannelById failed");
    }
  }

  try {
    const chats = await client.getChats();
    const exact = (chats as any[]).find((item) => String(item?.id?._serialized ?? "") === jid);
    if (exact) return exact;
  } catch (e) {
    logger.warn({ err: e, groupJid: jid }, "wa: getChats fallback failed");
  }
  return null;
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
    onProgress?: (progress: { round: number; maxRounds: number; messages: number; oldestTs: number }) => void | Promise<void>;
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
      messages: [], oldestTs: Date.now(), reachedCutoff: false, historyExhausted: false, rounds: 0,
      diagnostic: "WhatsApp istemcisi hazır değil; oturum veya bağlantı bekleniyor.",
    };
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
    onProgress?: (progress: { round: number; maxRounds: number; messages: number; oldestTs: number }) => void | Promise<void>;
  } = {},
): Promise<WhatsAppFetchResult> {
  const chat = await resolveWhatsAppChat(groupJid);
  if (!chat) {
    return {
      messages: [], oldestTs: Date.now(), reachedCutoff: false, historyExhausted: false, rounds: 0,
      diagnostic: "Grup/kanal whatsapp-web.js sohbet indeksinde bulunamadı.",
    };
  }

  const cutoff = opts.afterTimestampMs != null
    ? opts.afterTimestampMs
    : (Date.now() - (opts.maxAgeDays ?? 730) * 24 * 60 * 60 * 1000);
  const fetched = await fetchMessagesFromChat(chat, groupJid, {
    cutoff,
    deep: opts.deep,
    limit: opts.deep ? 500 : Math.min(opts.limit ?? 200, 500),
    maxLimit: opts.deep ? 5_000 : Math.min(opts.limit ?? 200, 500),
    onProgress: opts.onProgress,
  });
  for (const diagnostic of fetched.diagnostics) {
    logger.warn({ groupJid, diagnostic }, "wa: mesaj alım tanısı");
  }

  logger.info(
    {
      groupJid,
      inRange: fetched.messages.length,
      deep: !!opts.deep,
      reachedCutoff: fetched.reachedCutoff,
      historyExhausted: fetched.historyExhausted,
      rounds: fetched.rounds,
      oldest: new Date(fetched.oldestTs).toISOString(),
      cutoff: new Date(cutoff).toISOString(),
    },
    "wa: mesajlar hazır (eski→yeni)",
  );
  return {
    messages: fetched.messages,
    oldestTs: fetched.oldestTs,
    reachedCutoff: fetched.reachedCutoff,
    historyExhausted: fetched.historyExhausted,
    rounds: fetched.rounds,
    diagnostic: fetched.diagnostics.length ? fetched.diagnostics.join(" | ").slice(0, 700) : null,
  };
}

export async function sendWhatsAppMessage(jid: string, text: string): Promise<void> {
  if (!client || !isReady) throw new Error("WhatsApp not connected");
  await client.sendMessage(jid, text);
}
