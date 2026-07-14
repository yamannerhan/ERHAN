import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { db, knownCompaniesTable, knownCompanyAliasesTable, listingsTable } from "@workspace/db";
import { and, eq, isNull, or, sql, ilike } from "drizzle-orm";

const LOGO_DIR = path.join(process.cwd(), "data", "known-company-logos");
try {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
} catch { /* ignore */ }

let schemaReady = false;
let aliasCache: { companyId: number; name: string; logoUrl: string | null; hasData: boolean; norms: string[] }[] | null = null;
let aliasCacheAt = 0;

export async function ensureKnownCompaniesSchema(): Promise<void> {
  if (schemaReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS known_companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      logo_url TEXT,
      logo_data TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS known_companies_slug_uidx ON known_companies (slug)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS known_company_aliases (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS known_company_aliases_norm_uidx ON known_company_aliases (normalized_alias)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS known_company_aliases_company_idx ON known_company_aliases (company_id)`);
  schemaReady = true;
}

/** İ/I Ü/U ç/ş vb. + küçük büyük — logo eşleştirme anahtarı */
export function normalizeCompanyKey(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPANY_GENERIC_SUFFIXES = new Set([
  "guvenlik", "hizmet", "hizmetleri", "hizmetler", "grup", "group",
  "limited", "sirketi", "sirket", "sanayi", "ticaret", "ltd", "sti", "as", "a", "s",
]);

/** Firma özünü koruyup “Güvenlik Hizmetleri Ltd. Şti.” gibi değişken sonları atar. */
function normalizeCompanyCore(input: string): string {
  const tokens = input.split(" ").filter(Boolean);
  while (tokens.length > 1 && COMPANY_GENERIC_SUFFIXES.has(tokens[tokens.length - 1]!)) {
    tokens.pop();
  }
  return tokens.join(" ");
}

/** Kısa/uzun ad varyasyonlarını kelime sınırında puanlar; benzer kelimeleri karıştırmaz. */
function companyVariantScore(input: string, known: string): number {
  if (!input || !known) return 0;
  if (input === known) return 10_000 + known.length;
  const inputCore = normalizeCompanyCore(input);
  const knownCore = normalizeCompanyCore(known);
  if (inputCore === knownCore) return 9_000 + knownCore.length;
  return 0;
}

export function slugifyCompany(name: string): string {
  return normalizeCompanyKey(name).replace(/\s+/g, "-") || `co-${Date.now()}`;
}

/**
 * Beyaz / açık gri arka planı kırp — logo tam otursun.
 * Alpha veya neredeyse beyaz kenarlar trim edilir.
 */
export async function trimLogoWhitespace(input: Buffer): Promise<Buffer> {
  // Önce alpha varsa trim; yoksa açık zemini şeffafa çevirip trim
  const meta = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = meta;
  const { width, height, channels } = info;
  const threshold = 245; // neredeyse beyaz
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const a = channels > 3 ? data[i + 3]! : 255;
      const nearWhite = r >= threshold && g >= threshold && b >= threshold;
      if (a < 12 || nearWhite) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return sharp(input)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  }

  const pad = 4;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const cropW = Math.min(width - left, maxX - minX + 1 + pad * 2);
  const cropH = Math.min(height - top, maxY - minY + 1 + pad * 2);

  return sharp(input)
    .ensureAlpha()
    .extract({ left, top, width: cropW, height: cropH })
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
}

export function invalidateKnownCompanyCache(): void {
  aliasCache = null;
}

async function loadAliasCache(): Promise<typeof aliasCache> {
  const now = Date.now();
  if (aliasCache && now - aliasCacheAt < 60_000) return aliasCache;
  await ensureKnownCompaniesSchema();
  const companies = await db
    .select()
    .from(knownCompaniesTable)
    .where(eq(knownCompaniesTable.isActive, true));
  const aliases = await db.select().from(knownCompanyAliasesTable);
  const byId = new Map<number, { name: string; logoUrl: string | null; hasData: boolean; norms: string[] }>();
  for (const c of companies) {
    byId.set(c.id, {
      name: c.name,
      logoUrl: c.logoUrl,
      hasData: Boolean(c.logoData),
      norms: [normalizeCompanyKey(c.name), normalizeCompanyKey(c.slug.replace(/-/g, " "))].filter(Boolean),
    });
  }
  for (const a of aliases) {
    const row = byId.get(a.companyId);
    if (!row) continue;
    const n = a.normalizedAlias || normalizeCompanyKey(a.alias);
    if (n && !row.norms.includes(n)) row.norms.push(n);
  }
  aliasCache = [...byId.entries()].map(([companyId, v]) => ({
    companyId,
    name: v.name,
    logoUrl: v.logoUrl ? (v.logoUrl.startsWith("/") ? v.logoUrl : `/api/known-company-logos/${companyId}`) : `/api/known-company-logos/${companyId}`,
    hasData: v.hasData,
    norms: v.norms,
  }));
  // logoUrl: her zaman API id yolu (DB data tercih)
  aliasCache = aliasCache.map((c) => ({
    ...c,
    logoUrl: c.hasData || c.logoUrl ? `/api/known-company-logos/${c.companyId}` : null,
  }));
  aliasCacheAt = now;
  return aliasCache;
}

export type KnownCompanyMatch = {
  companyId: number;
  name: string;
  logoUrl: string;
};

/** Esnek eşleşme: tam, alias, kısaltma (GLM ↔ GLM GRUP) */
export async function matchKnownCompany(companyText: string | null | undefined): Promise<KnownCompanyMatch | null> {
  await loadAliasCache();
  return matchKnownCompanySync(companyText);
}

/** Cache üzerinden senkron eşleşme (formatListing) */
export function matchKnownCompanySync(companyText: string | null | undefined): KnownCompanyMatch | null {
  const key = normalizeCompanyKey(companyText);
  if (!key || key === "belirtilmedi" || key === "belirtilmemis" || key === "turkiye") return null;
  const cache = aliasCache;
  if (!cache?.length) {
    void loadAliasCache().catch(() => undefined);
    return null;
  }

  for (const c of cache) {
    if (c.norms.includes(key) && c.logoUrl) {
      return { companyId: c.companyId, name: c.name, logoUrl: c.logoUrl };
    }
  }

  let best: { company: NonNullable<typeof cache>[number]; score: number } | null = null;
  for (const c of cache) {
    for (const norm of c.norms) {
      if (!norm || !c.logoUrl) continue;
      const score = companyVariantScore(key, norm);
      if (score > 0 && (!best || score > best.score)) best = { company: c, score };
    }
  }
  return best?.company.logoUrl
    ? { companyId: best.company.companyId, name: best.company.name, logoUrl: best.company.logoUrl }
    : null;
}

/** Metin içinde marka adı ara (bot ilanları / Belirtilmemiş) */
export function matchKnownCompanyInBlob(blob: string | null | undefined): KnownCompanyMatch | null {
  const cache = aliasCache;
  if (!cache?.length) {
    void loadAliasCache().catch(() => undefined);
    return null;
  }
  const hay = ` ${normalizeCompanyKey(blob)} `;
  if (hay.trim().length < 3) return null;

  type Cand = { match: KnownCompanyMatch; len: number };
  let best: Cand | null = null;
  for (const c of cache) {
    if (!c.logoUrl) continue;
    for (const norm of c.norms) {
      if (!norm || norm.length < 2) continue;
      const variants = [...new Set([norm, normalizeCompanyCore(norm)])];
      for (const variant of variants) {
        if (variant.length >= 2 && hay.includes(` ${variant} `)) {
          if (!best || variant.length > best.len) {
            best = { match: { companyId: c.companyId, name: c.name, logoUrl: c.logoUrl }, len: variant.length };
          }
        }
      }
    }
  }
  return best?.match ?? null;
}

export function isPlaceholderListingLogo(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.trim();
  if (!u || u.startsWith("data:image/svg")) return true;
  if (/unsplash|randomuser|picsum/i.test(u)) return true;
  return false;
}

/** Eşleşen aktif ilanlara logo yaz (admin yükleyince / seed) */
export async function applyKnownLogoToListings(companyId: number): Promise<number> {
  await ensureKnownCompaniesSchema();
  const [co] = await db.select().from(knownCompaniesTable).where(eq(knownCompaniesTable.id, companyId)).limit(1);
  if (!co || !co.isActive) return 0;
  const logoUrl = `/api/known-company-logos/${co.id}`;
  const aliases = await db
    .select()
    .from(knownCompanyAliasesTable)
    .where(eq(knownCompanyAliasesTable.companyId, companyId));
  const keys = new Set<string>([
    normalizeCompanyKey(co.name),
    ...aliases.map((a) => a.normalizedAlias || normalizeCompanyKey(a.alias)),
  ].filter(Boolean));

  const rows = await db
    .select({ id: listingsTable.id, company: listingsTable.company, companyLogoUrl: listingsTable.companyLogoUrl })
    .from(listingsTable)
    .where(and(eq(listingsTable.isActive, true), eq(listingsTable.status, "active")))
    .limit(5000);

  let updated = 0;
  for (const row of rows) {
    const k = normalizeCompanyKey(row.company);
    if (!k) continue;
    let hit = keys.has(k);
    if (!hit) {
      for (const key of keys) {
        if (companyVariantScore(k, key) > 0) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) continue;
    if (!isPlaceholderListingLogo(row.companyLogoUrl) && row.companyLogoUrl?.includes("/api/known-company-logos/")) {
      // zaten bilinen logo — id güncelle
    } else if (!isPlaceholderListingLogo(row.companyLogoUrl) && !row.companyLogoUrl?.includes("/api/known-company-logos/")) {
      // kullanıcı/profil logosu var — dokunma
      continue;
    }
    await db.update(listingsTable).set({ companyLogoUrl: logoUrl }).where(eq(listingsTable.id, row.id));
    updated += 1;
  }
  return updated;
}

export async function saveKnownCompanyLogoBuffer(companyId: number, buf: Buffer): Promise<string> {
  const cropped = await trimLogoWhitespace(buf);
  const filename = `kc_${companyId}_${crypto.randomBytes(6).toString("hex")}.webp`;
  const filepath = path.join(LOGO_DIR, filename);
  try {
    await fs.promises.writeFile(filepath, cropped);
  } catch {
    // Kalıcı kaynak DB'deki logoData; salt-okunur/geçici diskte yükleme yine başarılı olsun.
  }
  const b64 = cropped.toString("base64");
  const logoUrl = `/api/known-company-logos/${companyId}`;
  await db
    .update(knownCompaniesTable)
    .set({ logoData: b64, logoUrl, updatedAt: new Date() })
    .where(eq(knownCompaniesTable.id, companyId));
  invalidateKnownCompanyCache();
  return logoUrl;
}

export async function upsertKnownCompanyAliases(companyId: number, aliases: string[]): Promise<void> {
  const norms = new Set<string>();
  for (const raw of aliases) {
    const alias = String(raw || "").trim();
    if (!alias) continue;
    const normalizedAlias = normalizeCompanyKey(alias);
    if (!normalizedAlias || norms.has(normalizedAlias)) continue;
    norms.add(normalizedAlias);
    try {
      await db.insert(knownCompanyAliasesTable).values({ companyId, alias, normalizedAlias });
    } catch {
      /* unique / duplicate ignore */
    }
  }
  invalidateKnownCompanyCache();
}

/** Seed katalogu — isimler + kısaltmalar */
export const KNOWN_COMPANY_SEEDS: { name: string; slug: string; aliases: string[]; file: string }[] = [
  { name: "Securitas", slug: "securitas", aliases: ["securitas", "sekuritas", "securitas guvenlik"], file: "securitas.png" },
  { name: "KDG Grup", slug: "kdg-grup", aliases: ["kdg", "kdg grup", "kdg group"], file: "kdg-grup.png" },
  { name: "Euroserve Güvenlik", slug: "euroserve", aliases: ["euroserve", "esg", "euroserve guvenlik", "euro serve"], file: "euroserve.png" },
  { name: "ISS Proser", slug: "iss-proser", aliases: ["iss", "iss proser", "iss guvenlik", "proser"], file: "iss-proser.png" },
  { name: "CD Güvenlik", slug: "cd-guvenlik", aliases: ["cd", "cd guvenlik", "cd güvenlik"], file: "cd-guvenlik.png" },
  { name: "GLM Grup", slug: "glm-grup", aliases: ["glm", "glm grup", "glm group"], file: "glm-grup.png" },
  { name: "G4S", slug: "g4s", aliases: ["g4s", "g4s guvenlik"], file: "g4s.png" },
  { name: "EUBSA", slug: "eubsa", aliases: ["eubsa", "eupsa", "eubsa turkey", "eupsa turkey"], file: "eubsa.png" },
  { name: "Ritüel", slug: "rituel", aliases: ["rituel", "ritüel", "rituel ozel guvenlik", "rituel company"], file: "rituel.png" },
  { name: "Aron", slug: "aron", aliases: ["aron", "aron guvenlik"], file: "aron.png" },
];

export async function seedKnownCompaniesFromDisk(srcDir?: string): Promise<number> {
  await ensureKnownCompaniesSchema();
  const dir =
    srcDir ||
    path.join(process.cwd(), "artifacts", "api-server", "scripts", "seed-known-logos-src");
  const alt = path.join(process.cwd(), "scripts", "seed-known-logos-src");
  const root = fs.existsSync(dir) ? dir : alt;
  if (!fs.existsSync(root)) return 0;

  let count = 0;
  for (const seed of KNOWN_COMPANY_SEEDS) {
    const [existing] = await db
      .select()
      .from(knownCompaniesTable)
      .where(eq(knownCompaniesTable.slug, seed.slug))
      .limit(1);

    let companyId = existing?.id;
    if (!existing) {
      const [ins] = await db
        .insert(knownCompaniesTable)
        .values({ name: seed.name, slug: seed.slug, isActive: true })
        .returning();
      companyId = ins!.id;
    }
    if (!companyId) continue;

    await upsertKnownCompanyAliases(companyId, [seed.name, ...seed.aliases]);

    const filePath = path.join(root, seed.file);
    if (fs.existsSync(filePath) && (!existing?.logoData || !existing.logoUrl)) {
      const buf = await fs.promises.readFile(filePath);
      await saveKnownCompanyLogoBuffer(companyId, buf);
      await applyKnownLogoToListings(companyId);
      count += 1;
    } else if (existing?.logoData) {
      await applyKnownLogoToListings(companyId);
    }
  }
  invalidateKnownCompanyCache();
  return count;
}

export { LOGO_DIR };
