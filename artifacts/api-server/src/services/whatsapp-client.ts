import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import QRCode from "qrcode";
import { logger } from "../lib/logger";

let client: any = null;
let isReady = false;
let qrDataUrl: string | null = null;
let starting = false;

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

export async function startWhatsAppClient(): Promise<void> {
  if (client || starting) return;
  starting = true;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  });

  client.on("qr", async (qr: string) => {
    logger.info("wa: QR received");
    qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2, errorCorrectionLevel: "M" });
  });

  client.on("ready", () => {
    logger.info("wa: connected");
    isReady = true;
    qrDataUrl = null;
  });

  client.on("disconnected", (reason: string) => {
    logger.warn(`wa: disconnected - ${reason}`);
    isReady = false;
    client = null;
    qrDataUrl = null;
  });

  client.on("auth_failure", (msg: string) => {
    logger.error(`wa: auth failure - ${msg}`);
    isReady = false;
    client = null;
    qrDataUrl = null;
  });

  try {
    await client.initialize();
  } finally {
    starting = false;
  }
}

export function getWhatsAppQR(): string | null {
  return qrDataUrl;
}

export function isWhatsAppReady(): boolean {
  return isReady && !!client;
}

export async function stopWhatsAppClient(): Promise<void> {
  if (!client) return;
  await client.destroy();
  client = null;
  isReady = false;
  qrDataUrl = null;
}

export async function fetchWhatsAppGroups(): Promise<WhatsAppChannel[]> {
  if (!client || !isReady) return [];
  const chats = await client.getChats();
  return chats
    .filter((c: any) => c.isGroup)
    .map((c: any) => ({ id: c.id._serialized, name: c.name, participants: c.participants?.length ?? 0 }));
}

export async function fetchWhatsAppMessages(groupJid: string, opts: { afterId?: string; limit?: number } = {}): Promise<WhatsAppMessage[]> {
  if (!client || !isReady) return [];
  const chat = await client.getChatById(groupJid);
  if (!chat) return [];
  const msgs = await chat.fetchMessages({ limit: opts.limit ?? 50 });
  const out: WhatsAppMessage[] = [];
  let started = !opts.afterId;
  for (const m of msgs) {
    if (!started) {
      if (m.id._serialized === opts.afterId) started = true;
      continue;
    }
    out.push({
      id: m.id._serialized,
      remoteJid: groupJid,
      text: m.body ?? "",
      timestamp: (m.timestamp ?? Math.floor(Date.now() / 1000)) * 1000,
    });
  }
  return out;
}

export async function sendWhatsAppMessage(jid: string, text: string): Promise<void> {
  if (!client || !isReady) throw new Error("WhatsApp not connected");
  await client.sendMessage(jid, text);
}