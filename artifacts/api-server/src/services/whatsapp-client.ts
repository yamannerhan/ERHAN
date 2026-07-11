import QRCode from "qrcode";
import fs from "node:fs";
import { logger } from "../lib/logger";

let client: any = null;
let isReady = false;
let qrDataUrl: string | null = null;
let pairingCode: string | null = null;
let lastError: string | null = null;
let starting = false;
let pendingPhone: string | null = null;
let ClientCtor: any = null;
let LocalAuthCtor: any = null;
/** Admin «Bağlantıyı Kes» — otomatik yeniden bağlanma yapma */
let manualStop = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || "./.wwebjs_auth";

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
  return raw.replace(/\D/g, "").replace(/^0/, "90");
}

function attachHandlers(c: any): void {
  c.on("qr", async (qr: string) => {
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
    logger.info("wa: pairing code received");
    pairingCode = code;
    qrDataUrl = null;
    lastError = null;
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
    lastError = null;
    reconnectAttempts = 0;
    manualStop = false;
    startWhatsAppWatchdog();
    // Bağlanınca bekleyen ilk taramaları otomatik başlat (sıfırlama gerekmez)
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
    // Auth failure: oturum bozulmuş olabilir — otomatik deneme sınırlı
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

export async function startWhatsAppClient(opts?: { phoneNumber?: string }): Promise<void> {
  if (isReady && client) return;
  if (starting) return;
  starting = true;
  manualStop = false;
  lastError = null;
  qrDataUrl = null;
  pairingCode = null;

  if (opts?.phoneNumber) {
    pendingPhone = normalizePhone(opts.phoneNumber);
  }

  try {
    await loadWhatsAppLib();

    if (client) {
      try { await client.destroy(); } catch { /* ignore */ }
      client = null;
      isReady = false;
    }

    const executablePath = resolveExecutablePath();
    logger.info({ executablePath }, "wa: Chromium yolu");

    const clientOpts: Record<string, unknown> = {
      authStrategy: new LocalAuthCtor({ dataPath: AUTH_PATH, clientId: "ozelguvenlik" }),
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
          // --single-process kaldırıldı: Chromium sık düşüyordu
        ],
      },
      // Bağlantı kopmalarında wwebjs'in kendi yeniden denemesi
      restartOnAuthFail: false,
    };

    if (pendingPhone) {
      clientOpts.pairWithPhoneNumber = {
        phoneNumber: pendingPhone,
        showNotification: true,
        intervalMs: 180_000,
      };
    }

    client = new ClientCtor(clientOpts);
    attachHandlers(client);
    await client.initialize();
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
 * Boot'ta Chromium AÇMA — Railway healthcheck'i bozar / OOM yapar.
 * Sadece kayıtlı oturum varsa ve WA_AUTO_CONNECT=1 ise arka planda bağlan.
 */
export async function initWhatsAppClient(): Promise<void> {
  if (process.env.WA_AUTO_CONNECT !== "1") {
    logger.info("wa: boot auto-connect kapalı (admin panelden bağlanın)");
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
    qr: qrDataUrl,
    pairingCode,
    phone: pendingPhone,
    error: lastError,
    chromePath,
  };
}

export async function stopWhatsAppClient(): Promise<void> {
  manualStop = true;
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
  pendingPhone = null;
}

export async function fetchWhatsAppGroups(): Promise<WhatsAppChannel[]> {
  if (!client || !isReady) return [];
  const byId = new Map<string, WhatsAppChannel>();

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
  reachedCutoff: boolean;
  rounds: number;
};

/**
 * Grup mesajlarını çek — 30 güne kadar agresif loadEarlier + DOM scroll + Store harvest.
 * reachedCutoff=false ise tarama bitmiş sayılmamalı.
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
    return { messages: [], oldestTs: Date.now(), reachedCutoff: false, rounds: 0 };
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
    return { messages: [], oldestTs: Date.now(), reachedCutoff: false, rounds: 0 };
  }
  if (!chat) {
    return { messages: [], oldestTs: Date.now(), reachedCutoff: false, rounds: 0 };
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
    : (Date.now() - (opts.maxAgeDays ?? 30) * 24 * 60 * 60 * 1000);

  const chatId = (chat as any).id?._serialized ?? groupJid;
  const byId = new Map<string, WhatsAppMessage>();
  let rounds = 0;
  let reachedCutoff = false;

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
    const maxRounds = 500;

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

      await new Promise((r) => setTimeout(r, 600));

      // 3) Her tur harvest + ara ara fetchMessages
      const harvested = await harvestStoreMessages(page, chatId, groupJid, cutoff, byId);
      if (i % 5 === 0) await pullFetchMessages(Math.min(2000, 300 + i * 20));

      const oldest = Math.min(info.oldest ?? Date.now(), harvested.oldest);
      const count = info.count ?? 0;

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
      if (info.done && !progressed) {
        stagnant++;
        // WA bazen geç yanıt verir — daha sabırlı ol
        if (stagnant >= 40) {
          logger.warn({ groupJid, rounds: i + 1, harvested: byId.size, oldest: new Date(oldest).toISOString() }, "wa: geçmiş yükleme tıkandı");
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        stagnant = 0;
      }
      lastHarvested = byId.size;
      lastOldest = oldest;
      await new Promise((r) => setTimeout(r, 400));
    }

    // Son bir syncHistory + büyük fetch
    try {
      if (typeof chat.syncHistory === "function") await chat.syncHistory();
    } catch { /* ignore */ }
    await pullFetchMessages(5000);
    await harvestStoreMessages(page, chatId, groupJid, cutoff, byId);

    const finalOldest = [...byId.values()].reduce((min, m) => Math.min(min, m.timestamp), Date.now());
    if (finalOldest <= cutoff) reachedCutoff = true;
  } else {
    if (page) await harvestStoreMessages(page, chatId, groupJid, cutoff, byId);
    await pullFetchMessages(Math.min(opts.limit ?? 200, 500));
    const finalOldest = [...byId.values()].reduce((min, m) => Math.min(min, m.timestamp), Date.now());
    reachedCutoff = byId.size === 0 || finalOldest <= cutoff;
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
      rounds,
      oldest: new Date(oldestTs).toISOString(),
      cutoff: new Date(cutoff).toISOString(),
    },
    "wa: mesajlar hazır",
  );
  return { messages: out, oldestTs, reachedCutoff, rounds };
}

export async function sendWhatsAppMessage(jid: string, text: string): Promise<void> {
  if (!client || !isReady) throw new Error("WhatsApp not connected");
  await client.sendMessage(jid, text);
}
