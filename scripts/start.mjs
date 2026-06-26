#!/usr/bin/env node
/**
 * Portable production bootstrap:
 * - env defaults for any server
 * - auto DB schema sync
 * - start API server
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEnv, requireDatabaseUrl } from "./lib/env.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function log(msg) {
  console.log(`[bootstrap] ${msg}`);
}

function fail(msg) {
  console.error(`[bootstrap] HATA: ${msg}`);
  process.exit(1);
}

normalizeEnv((msg) => log(msg.replace("[env] ", "")));

try {
  requireDatabaseUrl();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

for (const dir of ["uploads/avatars", "uploads/parttime"]) {
  fs.mkdirSync(path.join(rootDir, dir), { recursive: true });
}

const staticDir = path.join(rootDir, "artifacts/ozel-guvenlik/dist/public");
if (!fs.existsSync(path.join(staticDir, "index.html"))) {
  log("UYARI: Frontend build yok, yalnizca API aktif.");
} else {
  log("Frontend build bulundu.");
}

log("Veritabani semasi uygulaniyor...");
const push = spawnSync("pnpm", ["--filter", "@workspace/db", "run", "push-force"], {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (push.status !== 0) {
  fail("Veritabani semasi uygulanamadi. Postgres baglantisini kontrol edin.");
}

log(`Veritabani hazir. Sunucu baslatiliyor (PORT=${process.env.PORT})...`);

const server = spawnSync(
  "node",
  ["--enable-source-maps", path.join(rootDir, "artifacts/api-server/dist/index.mjs")],
  { cwd: rootDir, env: process.env, stdio: "inherit" },
);

process.exit(server.status ?? 1);
