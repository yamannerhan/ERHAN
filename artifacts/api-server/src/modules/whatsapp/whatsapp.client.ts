/**
 * Chromium / LocalAuth path yardımcıları.
 * Client yalnızca WhatsAppManager içinde `new Client()` ile oluşturulur.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export class WhatsAppModuleError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
    public code = "WA_ERROR",
  ) {
    super(message);
    this.name = "WhatsAppModuleError";
  }
}

/** Auth path: WHATSAPP_AUTH_PATH → /data/whatsapp-auth → ./data/whatsapp-auth */
export function resolveAuthPath(): string {
  const fromEnv = process.env.WHATSAPP_AUTH_PATH?.trim() || process.env.WWEBJS_AUTH_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (fs.existsSync("/data")) return "/data/whatsapp-auth";
  return path.join(process.cwd(), "data", "whatsapp-auth");
}

export function ensureAuthDir(authPath: string): void {
  fs.mkdirSync(authPath, { recursive: true });
}

export function sessionAuthDir(authPath: string, sessionId: string): string {
  return path.join(authPath, `session-${sessionId}`);
}

export function hasLocalAuth(authPath: string, sessionId: string): boolean {
  const dir = sessionAuthDir(authPath, sessionId);
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/** Volume yoksa panel uyarısı — uygulama kapanmaz. */
export function volumeWarning(authPath: string): string | null {
  if (authPath.startsWith("/data")) return null;
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
    return "Kalıcı volume yok — restart sonrası WhatsApp oturumu kaybolabilir. WHATSAPP_AUTH_PATH ile volume bağlayın.";
  }
  return null;
}

export function resolveChromiumPath(): { executablePath: string; source: string } {
  const envPath = process.env.WHATSAPP_CHROME_PATH?.trim()
    || process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
    || process.env.CHROMIUM_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    return { executablePath: envPath, source: "env" };
  }

  try {
    const puppeteer = require("puppeteer") as { executablePath?: () => string };
    if (typeof puppeteer.executablePath === "function") {
      const p = puppeteer.executablePath();
      if (p && fs.existsSync(p)) return { executablePath: p, source: "puppeteer" };
    }
  } catch { /* ignore */ }

  for (const candidate of [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]) {
    if (fs.existsSync(candidate)) return { executablePath: candidate, source: "system" };
  }

  throw new WhatsAppModuleError(
    "Chromium bulunamadı (BROWSER_NOT_FOUND). WHATSAPP_CHROME_PATH veya Puppeteer Chromium gerekli.",
    500,
    "BROWSER_NOT_FOUND",
  );
}

export function getWwebjsVersion(): string {
  try {
    return String(require("whatsapp-web.js/package.json").version ?? "unknown");
  } catch {
    return "unknown";
  }
}

export function getPuppeteerVersion(): string {
  try {
    return String(require("puppeteer/package.json").version ?? "unknown");
  } catch {
    return "unknown";
  }
}

export function normalizeTurkishPhone(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let n = digits;
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("90") && n.length >= 12) n = n.slice(0, 12);
  else if (n.startsWith("0") && n.length === 11) n = `90${n.slice(1)}`;
  else if (n.length === 10 && n.startsWith("5")) n = `90${n}`;
  else return null;
  if (!/^905\d{9}$/.test(n)) return null;
  return n;
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
}

export function maskChatId(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  if (chatId.length <= 12) return "***";
  return `${chatId.slice(0, 6)}…${chatId.slice(-6)}`;
}

export function contentHash(text: string): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const normalized = String(text ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/https?:\/\/[^\s]+/gi, (url: string) => {
      try {
        const u = new URL(url);
        u.search = "";
        u.hash = "";
        return u.toString();
      } catch {
        return url.split("?")[0] ?? url;
      }
    })
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function isNewerThanCheckpoint(
  messageTimestamp: number,
  messageId: string,
  checkpoint: { messageId: string | null; timestamp: number | null },
): boolean {
  const cpTs = checkpoint.timestamp;
  const cpId = checkpoint.messageId;
  if (cpTs == null || !cpId) return true;
  if (messageTimestamp > cpTs) return true;
  if (messageTimestamp < cpTs) return false;
  return messageId !== cpId;
}

export function compareMessages(
  a: { timestamp: number; id: string },
  b: { timestamp: number; id: string },
): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function daysAgoUnixSeconds(days: number, nowMs = Date.now()): number {
  return Math.floor((nowMs - days * 24 * 60 * 60 * 1000) / 1000);
}

export function unixSecondsToDate(sec: number): Date {
  return new Date(sec * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

class Mutex {
  private chain: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const prev = this.chain;
    this.chain = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

const sessionLocks = new Map<string, Mutex>();

export function getSessionLock(sessionId: string): Mutex {
  let m = sessionLocks.get(sessionId);
  if (!m) {
    m = new Mutex();
    sessionLocks.set(sessionId, m);
  }
  return m;
}
