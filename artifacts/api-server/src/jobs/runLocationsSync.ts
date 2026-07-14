import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { downloadTurkeyPbf, cleanupTempDownloads, GEOFABRIK_TURKEY_PBF_URL } from "./syncTurkeyLocations";
import {
  seedBootstrapLocations,
  countActiveProvinces,
  setSyncMeta,
  ensureExtensions,
  ensureTrigramIndexes,
} from "../services/location/locationRepository";
import { normalizeAliasKey } from "../services/location/turkishTextNormalizer";

export type SyncReport = {
  skippedDownload: boolean;
  pbfPath: string | null;
  extractMethod: "osmium" | "docker-osmium" | "bootstrap-only";
  provinces: number;
  activated: boolean;
  added: number;
  updated: number;
  deactivated: number;
  message: string;
};

function runCmd(cmd: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += String(d); });
    child.stderr?.on("data", (d) => { stderr += String(d); });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: String(err) }));
  });
}

async function hasOsmium(): Promise<boolean> {
  const r = await runCmd("osmium", ["--version"]);
  return r.code === 0;
}

async function hasDocker(): Promise<boolean> {
  const r = await runCmd("docker", ["version"]);
  return r.code === 0;
}

/** osmium tags-filter → OPL satırları (name + admin_level) */
async function extractWithOsmium(pbfPath: string, outDir: string): Promise<string> {
  await fsp.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "admin-industrial.opl");
  const args = [
    "tags-filter", pbfPath,
    "r/boundary=administrative",
    "n/place=city,town,suburb,quarter,neighbourhood,village,hamlet",
    "nwr/landuse=industrial",
    "nwr/industrial",
    "-o", outFile, "--overwrite",
  ];
  const r = await runCmd("osmium", args);
  if (r.code !== 0) throw new Error(`osmium failed: ${r.stderr || r.stdout}`);
  return outFile;
}

async function extractWithDockerOsmium(pbfPath: string, outDir: string): Promise<string> {
  await fsp.mkdir(outDir, { recursive: true });
  const absPbf = path.resolve(pbfPath);
  const absOut = path.resolve(outDir);
  const outName = "admin-industrial.opl";
  const r = await runCmd("docker", [
    "run", "--rm",
    "-v", `${path.dirname(absPbf)}:/data`,
    "-v", `${absOut}:/out`,
    "ibox/osmium-tool",
    "osmium", "tags-filter", `/data/${path.basename(absPbf)}`,
    "r/boundary=administrative",
    "n/place=city,town,suburb,quarter,neighbourhood,village,hamlet",
    "nwr/landuse=industrial",
    "nwr/industrial",
    "-o", `/out/${outName}`, "--overwrite",
  ]);
  if (r.code !== 0) {
    // fallback image name
    const r2 = await runCmd("docker", [
      "run", "--rm",
      "-v", `${path.dirname(absPbf)}:/data:ro`,
      "-v", `${absOut}:/out`,
      "ghcr.io/osmcode/osmium-tool",
      "tags-filter", `/data/${path.basename(absPbf)}`,
      "r/boundary=administrative",
      "-o", `/out/${outName}`, "--overwrite",
    ]);
    if (r2.code !== 0) throw new Error(`docker osmium failed: ${r.stderr}\n${r2.stderr}`);
  }
  return path.join(outDir, outName);
}

type ExtractedPlace = {
  osmType: string;
  osmId: string;
  name: string;
  adminLevel: number | null;
  locationType: string;
  aliases: string[];
};

function parseOplLine(line: string): ExtractedPlace | null {
  // Rough OPL: r123 tags=boundary=administrative,admin_level=4,name=İstanbul
  const typeMatch = line.match(/^([nwr])(\d+)/);
  if (!typeMatch) return null;
  const osmType = typeMatch[1] === "n" ? "node" : typeMatch[1] === "w" ? "way" : "relation";
  const osmId = typeMatch[2]!;
  const tags: Record<string, string> = {};
  for (const m of line.matchAll(/([\w:]+)=([^,\s]+)/g)) {
    tags[m[1]!] = decodeURIComponent(m[2]!.replace(/\+/g, " "));
  }
  // Better: scan name=...
  const name =
    tags["name:tr"] ||
    tags.name ||
    tags.official_name ||
    tags.short_name ||
    null;
  if (!name) return null;

  const adminLevel = tags.admin_level ? Number(tags.admin_level) : null;
  let locationType = "other";
  if (adminLevel === 2) locationType = "country";
  else if (adminLevel === 4) locationType = "province";
  else if (adminLevel === 6) locationType = "district";
  else if (adminLevel === 8) locationType = "village";
  else if (adminLevel === 10) locationType = "neighborhood";
  else if (tags.place === "suburb") locationType = "suburb";
  else if (tags.place === "quarter") locationType = "quarter";
  else if (tags.place === "neighbourhood") locationType = "neighborhood";
  else if (tags.place === "village" || tags.place === "hamlet") locationType = "village";
  else if (tags.landuse === "industrial" || tags.industrial) {
    locationType = /serbest|free.?zone/i.test(name) ? "free_zone" : "industrial_zone";
  } else {
    return null;
  }

  const aliases = [
    tags.name,
    tags["name:tr"],
    tags.official_name,
    tags.short_name,
    tags.alt_name,
    tags.old_name,
    tags.loc_name,
    tags.ref,
  ].filter(Boolean) as string[];

  return { osmType, osmId, name, adminLevel, locationType, aliases };
}

async function importExtractedToStaging(places: ExtractedPlace[]): Promise<{ added: number; updated: number }> {
  let added = 0;
  let updated = 0;
  // staging table
  await db.execute(sql`CREATE TABLE IF NOT EXISTS locations_staging (LIKE locations INCLUDING ALL)`);
  await db.execute(sql`TRUNCATE locations_staging`);

  for (const p of places) {
    const normalizedName = normalizeAliasKey(p.name);
    await db.execute(sql`
      INSERT INTO locations_staging (
        osm_type, osm_id, location_type, name, normalized_name, admin_level,
        is_active, source, source_updated_at, created_at, updated_at
      ) VALUES (
        ${p.osmType}, ${p.osmId}, ${p.locationType}, ${p.name}, ${normalizedName}, ${p.adminLevel},
        true, 'geofabrik', NOW(), NOW(), NOW()
      )
      ON CONFLICT DO NOTHING
    `);
    added++;
  }
  void updated;
  return { added, updated };
}

async function activateStagingIfValid(): Promise<{ activated: boolean; provinces: number }> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS c FROM locations_staging WHERE location_type = 'province'
  `);
  const rows = (result as unknown as { rows?: { c: number }[] }).rows
    ?? (Array.isArray(result) ? (result as { c: number }[]) : []);
  const provinces = Number(rows[0]?.c ?? 0);
  if (provinces !== 81) {
    return { activated: false, provinces };
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO locations (
        osm_type, osm_id, location_type, name, normalized_name, admin_level,
        latitude, longitude, is_active, source, source_updated_at, created_at, updated_at
      )
      SELECT osm_type, osm_id, location_type, name, normalized_name, admin_level,
             latitude, longitude, true, source, source_updated_at, NOW(), NOW()
      FROM locations_staging
      ON CONFLICT (osm_type, osm_id) DO UPDATE SET
        location_type = EXCLUDED.location_type,
        name = EXCLUDED.name,
        normalized_name = EXCLUDED.normalized_name,
        admin_level = EXCLUDED.admin_level,
        is_active = true,
        source = EXCLUDED.source,
        source_updated_at = EXCLUDED.source_updated_at,
        updated_at = NOW()
    `);
  });

  return { activated: true, provinces };
}

export async function runLocationsSync(opts?: { forceDownload?: boolean; skipPbf?: boolean }): Promise<SyncReport> {
  await ensureExtensions();
  await ensureTrigramIndexes().catch(() => undefined);

  let skippedDownload = true;
  let pbfPath: string | null = null;
  let extractMethod: SyncReport["extractMethod"] = "bootstrap-only";
  let added = 0;
  let updated = 0;
  let deactivated = 0;

  // Her zaman bootstrap seed (kritik alias + 81 il güvence)
  const seed = await seedBootstrapLocations();
  added += seed.aliases;

  if (!opts?.skipPbf) {
    try {
      const dl = await downloadTurkeyPbf({ force: opts?.forceDownload });
      skippedDownload = dl.skipped;
      pbfPath = dl.filePath;
      await setSyncMeta("last_pbf_sha256", dl.sha256 ?? "");
      await setSyncMeta("last_pbf_etag", dl.etag ?? "");

      const outDir = path.join(path.dirname(dl.filePath), "extract");
      let opl: string | null = null;
      if (await hasOsmium()) {
        opl = await extractWithOsmium(dl.filePath, outDir);
        extractMethod = "osmium";
      } else if (await hasDocker()) {
        opl = await extractWithDockerOsmium(dl.filePath, outDir);
        extractMethod = "docker-osmium";
      }

      if (opl && fs.existsSync(opl)) {
        const content = await fsp.readFile(opl, "utf8");
        const places: ExtractedPlace[] = [];
        for (const line of content.split(/\n+/)) {
          const p = parseOplLine(line);
          if (p) places.push(p);
        }
        const imp = await importExtractedToStaging(places);
        added += imp.added;
        updated += imp.updated;
        const act = await activateStagingIfValid();
        if (!act.activated) {
          await cleanupTempDownloads();
          return {
            skippedDownload,
            pbfPath,
            extractMethod,
            provinces: act.provinces,
            activated: false,
            added,
            updated,
            deactivated,
            message: `Staging il sayısı ${act.provinces} ≠ 81 — yeni veri aktif edilmedi. Bootstrap konumlar kullanılmaya devam ediyor.`,
          };
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await setSyncMeta("last_sync_error", msg);
      // Mevcut veriyi bozma
      const provinces = await countActiveProvinces();
      await cleanupTempDownloads();
      return {
        skippedDownload,
        pbfPath,
        extractMethod,
        provinces,
        activated: false,
        added,
        updated,
        deactivated,
        message: `PBF işleme başarısız, mevcut veri korundu: ${msg}`,
      };
    }
  }

  await cleanupTempDownloads();
  const provinces = await countActiveProvinces();
  await setSyncMeta("last_sync_at", new Date().toISOString());
  await setSyncMeta("last_sync_provinces", String(provinces));
  await setSyncMeta("geofabrik_url", GEOFABRIK_TURKEY_PBF_URL);

  return {
    skippedDownload,
    pbfPath,
    extractMethod,
    provinces,
    activated: provinces === 81,
    added,
    updated,
    deactivated,
    message: provinces === 81
      ? `Sync tamam: ${provinces} il aktif (${extractMethod}).`
      : `Uyarı: aktif il sayısı ${provinces} (beklenen 81). Bootstrap seed kontrol edin.`,
  };
}
