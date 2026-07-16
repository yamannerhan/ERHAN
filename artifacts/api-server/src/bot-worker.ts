import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { createServer } from "node:http";

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
const whatsapp = await import("./services/whatsapp");
const scraper = await import("./workers/scraper");

if (platforms.includes("telegram")) await telegram.initTelegramClient();
if (platforms.includes("whatsapp")) await whatsapp.initWhatsAppClient();
scraper.startScraperWorker();
logger.info({ platforms }, "Singleton bot worker başladı");
const healthPort = Math.max(1, Number(process.env["WORKER_HEALTH_PORT"] ?? 9090));
const healthServer = createServer((req, res) => {
  if (req.url !== "/health" && req.url !== "/livez") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ status: "ok", service: "bot-worker", platforms }));
});
healthServer.listen(healthPort, "0.0.0.0", () => {
  logger.info({ healthPort }, "Bot worker health endpoint hazır");
});

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
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
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
process.once("uncaughtException", (error) => {
  logger.error({ err: error }, "Bot worker uncaught exception");
  void shutdown("uncaughtException");
});
process.once("unhandledRejection", (error) => {
  logger.error({ err: error }, "Bot worker unhandled rejection");
  void shutdown("unhandledRejection");
});
