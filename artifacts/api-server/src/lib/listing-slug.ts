import { db, listingsTable, buildListingSlug } from "@workspace/db";
import { and, eq, ne, sql, or, isNull } from "drizzle-orm";
import { logger } from "./logger";

let schemaReady = false;
let backfillDone = false;

/** Kolon + unique index — production'da ALTER IF NOT EXISTS */
export async function ensureListingSlugSchema(): Promise<void> {
  if (schemaReady) return;
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS slug TEXT`);
  // Geçici değer (unique conflict öncesi)
  await db.execute(sql`
    UPDATE listings
    SET slug = 'tmp-' || id::text
    WHERE slug IS NULL OR trim(slug) = ''
  `);
  await db.execute(sql`ALTER TABLE listings ALTER COLUMN slug SET DEFAULT 'ilan'`);
  await db.execute(sql`ALTER TABLE listings ALTER COLUMN slug SET NOT NULL`);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'listings_slug_uidx'
      ) THEN
        UPDATE listings l
        SET slug = l.slug || '-' || l.id::text
        WHERE EXISTS (
          SELECT 1 FROM listings o
          WHERE o.slug = l.slug AND o.id < l.id
        );
        CREATE UNIQUE INDEX listings_slug_uidx ON listings (slug);
      END IF;
    END $$;
  `);
  schemaReady = true;
}

function needsSlugRebuild(slug: string | null | undefined): boolean {
  const s = (slug || "").trim();
  if (!s) return true;
  if (s === "ilan") return true;
  if (/^tmp-\d+$/i.test(s)) return true;
  if (/^ilan-\d+$/i.test(s)) return true;
  return false;
}

/** Tüm eski ilanlara SEO slug üret — boş/geçici olanlar */
export async function backfillListingSlugs(): Promise<{ updated: number }> {
  await ensureListingSlugSchema();
  if (backfillDone) return { updated: 0 };

  const rows = await db.select({
    id: listingsTable.id,
    title: listingsTable.title,
    city: listingsTable.city,
    slug: listingsTable.slug,
  }).from(listingsTable);

  let updated = 0;
  const used = new Set(rows.map((r) => (r.slug || "").trim()).filter(Boolean));

  for (const row of rows) {
    if (!needsSlugRebuild(row.slug)) {
      used.add(row.slug!);
      continue;
    }

    // İlk kurulum / boş slug: başlık+ilçe+şehirden üret — hiçbir ilan atlanmasın
    let base = buildListingSlug(row.title || "ilan", row.city || "");
    if (!base || base === "ilan") base = `ilan-${row.id}`;

    let candidate = base;
    const takenByOther = used.has(candidate) && candidate !== row.slug;
    if (takenByOther) candidate = `${base}-${row.id}`;
    let n = 0;
    while (used.has(candidate) && candidate !== row.slug && n < 30) {
      n += 1;
      candidate = `${base}-${row.id}-${n}`;
    }

    if (candidate === row.slug) {
      used.add(candidate);
      continue;
    }

    await db.update(listingsTable)
      .set({ slug: candidate, updatedAt: new Date() })
      .where(eq(listingsTable.id, row.id));

    if (row.slug) used.delete(row.slug);
    used.add(candidate);
    updated += 1;
  }

  // Kalan boşlar
  const leftovers = await db.select({
    id: listingsTable.id,
    title: listingsTable.title,
    city: listingsTable.city,
  }).from(listingsTable).where(or(
    isNull(listingsTable.slug),
    eq(listingsTable.slug, ""),
    eq(listingsTable.slug, "ilan"),
  )!);

  for (const row of leftovers) {
    const candidate = `${buildListingSlug(row.title || "ilan", row.city || "") || "ilan"}-${row.id}`;
    await db.update(listingsTable)
      .set({ slug: candidate, updatedAt: new Date() })
      .where(eq(listingsTable.id, row.id));
    updated += 1;
  }

  backfillDone = true;
  logger.info({ updated, total: rows.length }, "listings: slug backfill tamam");
  return { updated };
}

/** Unique slug üret (mevcut id hariç) */
export async function allocateUniqueListingSlug(
  listingId: number | null,
  title: string,
  city: string,
): Promise<string> {
  await ensureListingSlugSchema();
  let base = buildListingSlug(title, city);
  if (!base) base = listingId ? `ilan-${listingId}` : `ilan-${Date.now()}`;

  const tryCandidate = async (candidate: string): Promise<boolean> => {
    const [hit] = await db.select({ id: listingsTable.id })
      .from(listingsTable)
      .where(
        listingId
          ? and(eq(listingsTable.slug, candidate), ne(listingsTable.id, listingId))
          : eq(listingsTable.slug, candidate),
      )
      .limit(1);
    return !hit;
  };

  if (await tryCandidate(base)) return base;
  if (listingId) {
    const withId = `${base}-${listingId}`;
    if (await tryCandidate(withId)) return withId;
  }
  for (let i = 2; i < 50; i++) {
    const c = `${base}-${listingId ?? "n"}-${i}`;
    if (await tryCandidate(c)) return c;
  }
  return `${base}-${listingId ?? Date.now()}`;
}

/** İlan kaydı sonrası / title-city değişince slug güncelle */
export async function syncListingSlug(
  listingId: number,
  title: string,
  city: string,
): Promise<string> {
  const slug = await allocateUniqueListingSlug(listingId, title, city);
  await db.update(listingsTable)
    .set({ slug, updatedAt: new Date() })
    .where(eq(listingsTable.id, listingId));
  return slug;
}
