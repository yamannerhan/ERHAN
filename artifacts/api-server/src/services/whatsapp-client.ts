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
let ClientCtor: any = null;
let LocalAuthCtor: any = null;
/** Admin «Bağlantıyı Kes» — otomatik yeniden bağlanma yapma */
let manualStop = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

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

function setPairingCode(code: string | null): void {
  if (!code) return;
  const raw = String(code).replace(/\s+/g, "").toUpperCase();
  if (raw.length < 6) return;
  pairingCode = raw;
  qrDataUrl = null;
  lastError = null;
  logger.info({ codeLen: raw.length }, "wa: pairing code set");
}

async function requestPairingCodeNow(c: any, phone: string): Promise<string | null> {
  if (!c || typeof c.requestPairingCode !== "function") return null;
  try {
    const code = await c.requestPairingCode(phone, true, 180_000);
    if (code) {
      setPairingCode(String(code));
      return pairingCode;
    }
  } catch (e) {
    logger.warn({ err: e }, "wa: requestPairingCode failed");
  }
  return null;
}

function attachHandlers(c: any): void {
  c.on("qr", async (qr: string) => {
    // Onay kodu modunda QR'ı ASLA gösterme — kod iste
    if (pairingIntent && pendingPhone) {
      logger.info("wa: QR yoksayıldı (onay kodu modu) — pairing code isteniyor");
      qrDataUrl = null;
      if (!pairingCode && !pairingCodeRequested) {
        pairingCodeRequested = true;
        void requestPairingCodeNow(c, pendingPhone).then((code) => {
          if (!code) {
            pairingCodeRequested = false;
            lastError = "Onay kodu alınamadı. Numarayı 905… formatında kontrol edip tekrar deneyin.";
          }
        });
      }
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

    // initialize sonrası kod yoksa zorla iste ve bekle
    if (pairingMode && pendingPhone && !isReady && !pairingCode) {
      lastError = "Onay kodu isteniyor…";
      pairingCodeRequested = true;
      const code = await requestPairingCodeNow(client, pendingPhone);
      if (!code) {
        // Birkaç sn daha code event bekledikten sonra hata
        for (let i = 0; i < 20 && !pairingCode && !isReady; i++) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (!pairingCode && !isReady) {
        lastError = "Onay kodu gelmedi. 905xxxxxxxxx formatında tekrar deneyin (QR kapalı).";
        logger.warn({ phone: pendingPhone }, "wa: pairing code gelmedi");
      } else if (pairingCode) {
        lastError = null;
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
  const byId = new Map<string, WhatsAppChannel>();

  // 1) getChats ana kaynağı
  try {
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
  } catch (e) {
    logger.warn({ err: e }, "wa: getChats failed");
  }

  // 2) getChannels ile kanalları ekle
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

  // 3) getContacts ile kişi listesindeki grupları da ekle
  try {
    if (typeof client.getContacts === "function") {
      const contacts = await client.getContacts();
      for (const c of contacts as any[]) {
        const id = String(c?.id?._serialized ?? "");
        if (!id || byId.has(id)) continue;
        const isGroup = !!(c.isGroup || id.endsWith("@g.us"));
        const isChannel = !!(c.isChannel || c.isNewsletter || id.endsWith("@newsletter"));
        if (!isGroup && !isChannel) continue;
        byId.set(id, {
          id,
          name: String(c.name || c.formattedTitle || c.pushname || id),
          participants: Number(c.participants?.length ?? c.groupMetadata?.participants?.length ?? 0) || 0,
          kind: isChannel ? "channel" : "group",
        });
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "wa: getContacts (groups) failed");
  }

  // 4) WhatsApp Web Store yedeği — ekranda görünen ama istemcinin kaçırdığı kaynaklar
  try {
    const page = (client as any).pupPage;
    if (page) {
      const storeSources: Array<{
        id: string;
        name: string;
        isGroup: boolean;
        isChannel: boolean;
        participants: number;
      }> = await page.evaluate(() => {
        const w = window as any;
        const collect = (collection: any) => {
          if (!collection) return [];
          if (typeof collection.getModelsArray === "function") return collection.getModelsArray();
          if (Array.isArray(collection.models)) return collection.models;
          if (Array.isArray(collection)) return collection;
          return [];
        };
        const chats = collect(w.Store?.Chat);
        const newsletters = collect(w.Store?.Newsletter);
        return [...chats, ...newsletters].map((item: any) => ({
          id: item?.id?._serialized ?? item?.id ?? "",
          name: item?.name ?? item?.formattedTitle ?? item?.title ?? "",
          isGroup: Boolean(item?.isGroup || String(item?.id?._serialized ?? item?.id ?? "").endsWith("@g.us")),
          isChannel: Boolean(item?.isChannel || item?.isNewsletter || String(item?.id?._serialized ?? item?.id ?? "").endsWith("@newsletter")),
          participants: item?.participants?.length ?? item?.groupMetadata?.participants?.length ?? item?.subscribersCount ?? 0,
        }));
      });
      for (const s of storeSources) {
        if (!s.id || byId.has(s.id)) continue;
        if (!s.isGroup && !s.isChannel) continue;
        byId.set(s.id, {
          id: s.id,
          name: s.name || s.id,
          participants: s.participants,
          kind: s.isChannel ? "channel" : "group",
        });
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "wa: Store group/channel discovery failed");
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

  try {
    const state = String(await client.getState?.() ?? "") || null;
    diagnostic.state = state;
  } catch { /* ignore */ }
  try {
    const wwebVersion = String(await client.getWWebVersion?.() ?? "") || null;
    diagnostic.wwebVersion = wwebVersion;
  } catch { /* ignore */ }

  try {
    const chats = await client.getChats();
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
    if (typeof client.getContacts === "function") {
      const contacts = await client.getContacts();
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
    const page = (client as any).pupPage;
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
      const storeChat =
        w.Store?.Chat?.get?.(id) ||
        w.Store?.Chat?.find?.(id) ||
        (w.Store?.Chat?.models || []).find((c: any) => c?.id?._serialized === id);
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
        await page.evaluate((jid: string) => {
          const w = window as any;
          const chat =
            w.Store?.Chat?.get?.(jid) ||
            w.Store?.Chat?.find?.(jid);
          if (chat?.presence?.subscribe) chat.presence.subscribe();
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
    logger.warn({ err: e, groupJid }, "wa: getChatById failed");
    return {
      messages: [],
      oldestTs: Date.now(),
      reachedCutoff: false,
      historyExhausted: false,
      rounds: 0,
      diagnostic: "Grup/kanal istemcide bulunamadı.",
    };
  }
  if (!chat) {
    return {
      messages: [],
      oldestTs: Date.now(),
      reachedCutoff: false,
      historyExhausted: false,
      rounds: 0,
      diagnostic: "Grup/kanal istemcide bulunamadı.",
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
