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
  });

  c.on("disconnected", (reason: string) => {
    logger.warn(`wa: disconnected - ${reason}`);
    isReady = false;
    client = null;
    qrDataUrl = null;
    pairingCode = null;
    lastError = `Bağlantı koptu: ${reason}`;
  });

  c.on("auth_failure", (msg: string) => {
    logger.error(`wa: auth failure - ${msg}`);
    isReady = false;
    client = null;
    qrDataUrl = null;
    pairingCode = null;
    lastError = `Kimlik doğrulama hatası: ${msg}`;
  });
}

export async function startWhatsAppClient(opts?: { phoneNumber?: string }): Promise<void> {
  if (isReady && client) return;
  if (starting) return;
  starting = true;
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
          "--disable-software-rasterizer",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          "--disable-background-networking",
          "--mute-audio",
          "--single-process",
        ],
      },
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
  if (!client) return;
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
  const chats = await client.getChats();
  return chats
    .filter((c: any) => c.isGroup)
    .map((c: any) => ({
      id: c.id._serialized,
      name: c.name || c.id._serialized,
      participants: c.participants?.length ?? 0,
    }));
}

/**
 * Grup mesajlarını çek.
 * - İlk tarama: son maxAgeDays içindeki mesajlar (limit yükselterek 30 güne yaklaşır)
 * - Sonraki: afterTimestampMs sonrası yeni mesajlar
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
  if (!client || !isReady) return [];
  const chat = await client.getChatById(groupJid);
  if (!chat) return [];

  const cutoff = opts.afterTimestampMs != null
    ? opts.afterTimestampMs
    : (Date.now() - (opts.maxAgeDays ?? 30) * 24 * 60 * 60 * 1000);

  // WhatsApp Web tek seferde sınırlı döner — derin taramada limiti kademeli artır
  const limits = opts.deep
    ? [200, 500, 1000, 1500, 2000]
    : [Math.min(opts.limit ?? 100, 200)];

  let best: any[] = [];
  for (const limit of limits) {
    const batch = await chat.fetchMessages({ limit });
    best = batch;
    if (!opts.deep) break;
    // En eski mesaj cutoff'tan eskiyse yeterince geri gittik
    let oldest = Date.now();
    for (const m of batch) {
      const ts = (m.timestamp ?? 0) * 1000;
      if (ts > 0 && ts < oldest) oldest = ts;
    }
    if (batch.length < limit || oldest <= cutoff) break;
    await new Promise((r) => setTimeout(r, 400));
  }

  const out: WhatsAppMessage[] = [];
  const seen = new Set<string>();
  for (const m of best) {
    const id = m.id?._serialized;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ts = (m.timestamp ?? 0) * 1000;
    if (!ts || ts <= cutoff) continue;
    const text = String(m.body ?? "").trim();
    if (!text) continue;
    out.push({
      id,
      remoteJid: groupJid,
      text,
      timestamp: ts,
    });
  }

  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

export async function sendWhatsAppMessage(jid: string, text: string): Promise<void> {
  if (!client || !isReady) throw new Error("WhatsApp not connected");
  await client.sendMessage(jid, text);
}
