import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import fs from "node:fs";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_PRIVATE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const useSsl =
  databaseUrl.includes("sslmode=require") ||
  databaseUrl.includes("railway.app") ||
  process.env.DATABASE_SSL === "true";
const caFile = process.env["DATABASE_CA_CERT_FILE"];
const ca = process.env["DATABASE_CA_CERT"]?.replace(/\\n/g, "\n")
  ?? (caFile && fs.existsSync(caFile) ? fs.readFileSync(caFile, "utf8") : undefined);
const rejectUnauthorized = process.env["DATABASE_TLS_REJECT_UNAUTHORIZED"] !== "false";

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized, ...(ca ? { ca } : {}) } : undefined,
  max: Number(process.env["PG_POOL_MAX"] ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  maxLifetimeSeconds: 300,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
