#!/usr/bin/env node
/**
 * Production bootstrap — API'yi hemen başlatır.
 * Schema değişikliği yalnız RUN_SCHEMA_PUSH=1 ile açıkça istenirse çalışır.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEnv, requireDatabaseUrl, requireProductionSecurity } from "./lib/env.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localEnvPath = path.join(rootDir, ".env");
if (fs.existsSync(localEnvPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(localEnvPath);
}

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
  requireProductionSecurity();
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

log(`API sunucusu baslatiliyor (PORT=${process.env.PORT || 8080})...`);

const child = spawn(
  "node",
  ["--enable-source-maps", path.join(rootDir, "artifacts/api-server/dist/index.mjs")],
  {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  },
);

let push = null;
if (process.env.RUN_SCHEMA_PUSH === "1") {
  log("Veritabani semasi açık izinle arka planda uygulanıyor...");
  push = spawn(
    "pnpm",
    ["--filter", "@workspace/db", "run", "push-force"],
    {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  push.on("exit", (code) => {
    if (code === 0) log("Veritabani semasi tamam.");
    else log(`UYARI: Veritabani semasi exit=${code}`);
  });
} else {
  log("Schema push kapalı; migration deploy adımında ayrıca çalıştırılmalı.");
}

child.on("exit", (code, signal) => {
  log(`API cikis: code=${code} signal=${signal}`);
  process.exit(code ?? 1);
});

process.on("SIGTERM", () => {
  push?.kill("SIGTERM");
  child.kill("SIGTERM");
});
process.on("SIGINT", () => {
  push?.kill("SIGINT");
  child.kill("SIGINT");
});
