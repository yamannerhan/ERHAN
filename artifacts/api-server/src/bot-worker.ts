import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const platformArg = process.argv.find((value) => value.startsWith("--platform="))?.split("=")[1];
if (platformArg) process.env["BOT_PLATFORMS"] = platformArg;
const platforms = (process.env["BOT_PLATFORMS"] ?? "telegram,whatsapp,eleman")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter((value) => ["telegram", "whatsapp", "eleman"].includes(value));
if (platforms.length === 0) throw new Error("BOT_PLATFORMS en az bir geçerli platform içermeli");

const lockClient = await pool.connect();
const acquiredLocks: string[] = [];
try {
  for (const platform of [...new Set(platforms)].sort()) {
    const lockName = `ozelguvenlik:bot:${platform}`;
    const result = await lockClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [lockName],
    );
    if (!result.rows[0]?.locked) {
      throw new Error(`${platform} worker zaten başka bir process içinde çalışıyor`);
    }
    acquiredLocks.push(lockName);
  }
} catch (error) {
  for (const lockName of acquiredLocks) {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [lockName]).catch(() => {});
  }
  lockClient.release();
  await pool.end();
  throw error;
}

const telegram = await import("./services/telegram-client");
const whatsapp = await import("./services/whatsapp-client");
const scraper = await import("./workers/scraper");

if (platforms.includes("telegram")) await telegram.initTelegramClient();
if (platforms.includes("whatsapp")) await whatsapp.initWhatsAppClient();
scraper.startScraperWorker();
logger.info({ platforms }, "Singleton bot worker başladı");

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, platforms }, "Bot worker kapanıyor");
  const forceExit = setTimeout(() => process.exit(1), 30_000);
  forceExit.unref();
  await scraper.stopScraperWorker();
  await Promise.allSettled([
    telegram.shutdownTelegramClient(),
    whatsapp.stopWhatsAppClient(),
  ]);
  for (const lockName of acquiredLocks) {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [lockName]).catch(() => {});
  }
  lockClient.release();
  await pool.end();
  clearTimeout(forceExit);
  process.exit(0);
}

process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT", () => { void shutdown("SIGINT"); });
