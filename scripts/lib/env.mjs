import fs from "node:fs";
import crypto from "node:crypto";

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

  const puppeteerPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (puppeteerPath && !fs.existsSync(puppeteerPath)) {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    log(`[env] Gecersiz PUPPETEER_EXECUTABLE_PATH kaldirildi: ${puppeteerPath}`);
  }
  process.env.PUPPETEER_SKIP_DOWNLOAD ??= "true";

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
