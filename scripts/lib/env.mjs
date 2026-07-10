import fs from "node:fs";
import crypto from "node:crypto";

const CHROME_CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

function resolveChromePath(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const p of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return undefined;
}

/**
 * Normalize environment for any host (Railway, VPS, Docker, local).
 * Call once at process start before loading the app.
 */
export function normalizeEnv(log = console.log) {
  process.env.NODE_ENV ??= "production";
  process.env.BASE_PATH ??= "/";
  process.env.PORT ??= "8080";

  process.env.DATABASE_URL ??=
    process.env.POSTGRES_URL ??
    process.env.DATABASE_PRIVATE_URL ??
    process.env.RAILWAY_DATABASE_URL;

  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
    log("[env] SESSION_SECRET otomatik uretildi.");
  }

  process.env.JWT_SECRET ??= process.env.SESSION_SECRET;

  process.env.PUPPETEER_SKIP_DOWNLOAD ??= "true";
  process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD ??= "true";

  const chrome = resolveChromePath();
  if (chrome) {
    process.env.PUPPETEER_EXECUTABLE_PATH = chrome;
    log(`[env] Chromium bulundu: ${chrome}`);
  } else {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    log("[env] Chromium bulunamadi — WhatsApp QR icin Docker imajinda chromium kurulu olmali.");
  }

  if (!process.env.TELEGRAM_API_ID?.trim() || !process.env.TELEGRAM_API_HASH?.trim()) {
    log("[env] Telegram yapilandirilmadi (opsiyonel, uygulama calismaya devam eder).");
  }
}

export function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL gerekli. Postgres baglayin (Railway: Variables -> Add Reference -> Postgres.DATABASE_URL).",
    );
  }
}

export { resolveChromePath };
