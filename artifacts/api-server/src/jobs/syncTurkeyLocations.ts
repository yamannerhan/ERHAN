import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export const GEOFABRIK_TURKEY_PBF_URL = "https://download.geofabrik.de/europe/turkey-latest.osm.pbf";

export type DownloadResult = {
  filePath: string;
  skipped: boolean;
  etag: string | null;
  lastModified: string | null;
  sha256: string | null;
  bytes: number;
};

function dataDir(): string {
  return process.env.LOCATION_DATA_DIR || path.resolve(process.cwd(), ".data", "locations");
}

async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Geofabrik PBF indir — ETag/Last-Modified, resume, hash */
export async function downloadTurkeyPbf(opts?: { force?: boolean }): Promise<DownloadResult> {
  const dir = dataDir();
  await ensureDir(dir);
  const finalPath = path.join(dir, "turkey-latest.osm.pbf");
  const partPath = `${finalPath}.part`;
  const metaPath = `${finalPath}.meta.json`;

  let prevMeta: { etag?: string; lastModified?: string; sha256?: string } = {};
  if (fs.existsSync(metaPath)) {
    try {
      prevMeta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
    } catch {
      prevMeta = {};
    }
  }

  const headers: Record<string, string> = {};
  if (!opts?.force) {
    if (prevMeta.etag) headers["If-None-Match"] = prevMeta.etag;
    if (prevMeta.lastModified) headers["If-Modified-Since"] = prevMeta.lastModified;
  }

  // Resume
  let existingPart = 0;
  if (fs.existsSync(partPath)) {
    existingPart = (await fsp.stat(partPath)).size;
    if (existingPart > 0) headers.Range = `bytes=${existingPart}-`;
  }

  const res = await fetch(GEOFABRIK_TURKEY_PBF_URL, { headers });

  if (res.status === 304 && fs.existsSync(finalPath)) {
    const sha = prevMeta.sha256 || (await sha256File(finalPath));
    return {
      filePath: finalPath,
      skipped: true,
      etag: prevMeta.etag ?? null,
      lastModified: prevMeta.lastModified ?? null,
      sha256: sha,
      bytes: (await fsp.stat(finalPath)).size,
    };
  }

  if (!res.ok && res.status !== 206) {
    throw new Error(`Geofabrik download failed: HTTP ${res.status}`);
  }

  const etag = res.headers.get("etag");
  const lastModified = res.headers.get("last-modified");

  const append = res.status === 206 && existingPart > 0;
  const out = createWriteStream(partPath, { flags: append ? "a" : "w" });
  if (!res.body) throw new Error("Empty response body");
  await pipeline(Readable.fromWeb(res.body as import("stream/web").ReadableStream), out);

  await fsp.rename(partPath, finalPath);
  const sha256 = await sha256File(finalPath);
  const bytes = (await fsp.stat(finalPath)).size;

  await fsp.writeFile(
    metaPath,
    JSON.stringify({ etag, lastModified, sha256, bytes, downloadedAt: new Date().toISOString() }, null, 2),
  );

  return { filePath: finalPath, skipped: false, etag, lastModified, sha256, bytes };
}

export async function cleanupTempDownloads(): Promise<void> {
  const dir = dataDir();
  if (!fs.existsSync(dir)) return;
  for (const name of await fsp.readdir(dir)) {
    if (name.endsWith(".part") || name.endsWith(".tmp")) {
      await fsp.unlink(path.join(dir, name)).catch(() => undefined);
    }
  }
}
