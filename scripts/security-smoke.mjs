import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const entry = path.join(root, "artifacts/api-server/dist/index.mjs");
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: "8080",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  JWT_SECRET: "smoke-test-secret-must-be-longer-than-thirty-two-characters",
  APP_ORIGINS: "https://ozelguvenlik.online",
  RUN_BOT_WORKERS: "0",
  WA_AUTO_CONNECT: "0",
};

const child = spawn(process.execPath, [entry], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += String(chunk); });

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:8080/livez");
      if (response.ok) return;
    } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server başlamadı: ${stderr.slice(-1000)}`);
}

try {
  await waitForServer();
  const live = await fetch("http://127.0.0.1:8080/livez", {
    headers: { Origin: "https://ozelguvenlik.online" },
  });
  if (live.status !== 200) throw new Error(`livez=${live.status}`);
  if (live.headers.has("x-powered-by")) throw new Error("X-Powered-By kaldırılmadı");
  if (!live.headers.has("content-security-policy-report-only")) throw new Error("CSP report-only eksik");
  if (live.headers.get("access-control-allow-origin") !== "https://ozelguvenlik.online") {
    throw new Error("Allowed CORS origin eksik");
  }

  const admin = await fetch("http://127.0.0.1:8080/api/admin/stats");
  if (admin.status !== 401) throw new Error(`Yetkisiz admin status=${admin.status}`);

  const crossSite = await fetch("http://127.0.0.1:8080/api/auth/logout", {
    method: "POST",
    headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
  });
  if (crossSite.status !== 403) throw new Error(`Cross-site mutation status=${crossSite.status}`);

  console.log(JSON.stringify({
    livez: live.status,
    unauthorizedAdmin: admin.status,
    crossSiteMutation: crossSite.status,
    cspReportOnly: true,
    xPoweredByRemoved: true,
  }));
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

const insecureEnv = { ...env };
delete insecureEnv.JWT_SECRET;
delete insecureEnv.SESSION_SECRET;
insecureEnv.PORT = "8081";
const insecure = spawn(process.execPath, [entry], {
  cwd: root,
  env: insecureEnv,
  stdio: "ignore",
});
const insecureExit = await Promise.race([
  new Promise((resolve) => insecure.once("exit", (code) => resolve(code))),
  new Promise((resolve) => setTimeout(() => resolve("timeout"), 5_000)),
]);
if (insecureExit === "timeout" || insecureExit === 0) {
  insecure.kill("SIGKILL");
  throw new Error("JWT_SECRET olmadan production başlangıcı reddedilmedi");
}
console.log(JSON.stringify({ missingJwtSecretRejected: true }));
