import { db, listingsTable } from "@workspace/db";
import { and, eq, sql, isNotNull, ne, or, ilike, gte, isNull, desc } from "drizzle-orm";
import { haversineKm, resolveGeoFromCityText } from "./geo-centers";
import { logger } from "./logger";
import { NEARBY_RADII_KM, type NearbyRadiusKm, type NearbySort } from "./nearby-types";
import { parseCoord, parseListingCoord, parseNearbyRadius, parseNearbySort } from "./nearby-validator";

export { NEARBY_RADII_KM, parseCoord, parseListingCoord, parseNearbyRadius, parseNearbySort };
export type { NearbyRadiusKm, NearbySort };

export type NearbyQuery = {
  lat: number;
  lng: number;
  radiusKm: NearbyRadiusKm;
  sort: NearbySort;
  page: number;
  limit: number;
  employmentType?: string;
  armedStatus?: string;
  shift?: string;
  service?: boolean;
  date?: "today";
  salarySpecified?: boolean;
  /** Yalnızca "aynı ilçe" yumuşak bölümü için — mesafe sorgusuna AND edilmez */
  districtHint?: string;
};

let schemaReady = false;

export async function ensureNearbySchema(): Promise<void> {
  if (schemaReady) return;
  try {
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6)`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6)`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS location_accuracy TEXT`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS location_source TEXT`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_lat_lng_idx ON listings (latitude, longitude)`);
    schemaReady = true;
  } catch (e) {
    logger.warn({ err: e }, "nearby: schema ensure failed");
  }
}

function realListingFilter() {
  return or(isNull(listingsTable.sourceTag), ne(listingsTable.sourceTag, "demo"))!;
}

/** Eksik koordinatları city metninden doldur (batch) */
export async function backfillListingCoordinates(limit = 200): Promise<number> {
  await ensureNearbySchema();
  const rows = await db
    .select({
      id: listingsTable.id,
      city: listingsTable.city,
    })
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.isActive, true),
        eq(listingsTable.status, "active"),
        or(isNull(listingsTable.latitude), isNull(listingsTable.longitude))!,
      ),
    )
    .orderBy(desc(sql`COALESCE(${listingsTable.firstSeenAt}, ${listingsTable.createdAt})`))
    .limit(limit);

  let updated = 0;
  for (const row of rows) {
    const geo = resolveGeoFromCityText(row.city);
    if (!geo) continue;
    await db
      .update(listingsTable)
      .set({
        latitude: String(geo.lat),
        longitude: String(geo.lng),
        locationAccuracy: geo.accuracy,
        locationSource: "district_center",
      })
      .where(eq(listingsTable.id, row.id));
    updated += 1;
  }
  return updated;
}

type NearbyRow = {
  listing: typeof listingsTable.$inferSelect;
  distanceKm: number | null;
  /** Yuvarlanmamış mesafe; doğru yakınlık sıralaması için yalnızca sunucuda kullanılır. */
  sortDistanceKm: number | null;
  sameDistrict: boolean;
  approximate: boolean;
};

function buildChipConditions(q: NearbyQuery) {
  const conditions = [];
  if (q.employmentType && q.employmentType !== "parttime" && q.employmentType !== "part-time") {
    conditions.push(ilike(listingsTable.workType, `%${q.employmentType}%`));
  }
  if (q.date === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    conditions.push(gte(listingsTable.createdAt, start));
  }
  if (q.salarySpecified) {
    conditions.push(
      and(
        isNotNull(listingsTable.salary),
        ne(listingsTable.salary, ""),
        sql`${listingsTable.salary} !~* 'belirtilmedi|gorusme|görüşme'`,
      )!,
    );
  }
  if (q.armedStatus === "silahli") {
    conditions.push(
      sql`(${listingsTable.title} || ' ' || COALESCE(${listingsTable.description}, '') || ' ' || COALESCE(${listingsTable.requirements}, '')) ~* 'silahl[ıi]'`,
    );
  }
  if (q.armedStatus === "silahsiz") {
    conditions.push(
      sql`(${listingsTable.title} || ' ' || COALESCE(${listingsTable.description}, '') || ' ' || COALESCE(${listingsTable.requirements}, '')) ~* 'silahs[ıi]z'`,
    );
  }
  if (q.shift === "gece") {
    conditions.push(
      sql`(${listingsTable.title} || ' ' || COALESCE(${listingsTable.description}, '') || ' ' || COALESCE(${listingsTable.requirements}, '')) ~* 'gece|vardiya|24\\s*/\\s*48|12\\s*/\\s*24'`,
    );
  }
  if (q.service) {
    conditions.push(
      sql`(${listingsTable.title} || ' ' || COALESCE(${listingsTable.description}, '') || ' ' || COALESCE(${listingsTable.requirements}, '')) ~* 'servis'`,
    );
  }
  if (q.employmentType === "parttime" || q.employmentType === "part-time") {
    conditions.push(
      or(
        ilike(listingsTable.workType, "%part%"),
        ilike(listingsTable.workType, "%yarı%"),
        ilike(listingsTable.workType, "%yari%"),
        sql`${listingsTable.title} ~* 'part.?time|parti.?me|yar[ıi]m'`,
      )!,
    );
  }
  return conditions;
}

export async function findNearbyListings(q: NearbyQuery): Promise<{
  total: number;
  rows: NearbyRow[];
}> {
  await ensureNearbySchema();

  // İsteği yavaşlatmasın — arka planda doldur
  void backfillListingCoordinates(80).catch(() => undefined);

  const radiusKm = q.radiusKm;
  const lat = q.lat;
  const lng = q.lng;
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  // 30 gün — aktif ilan havuzu daha geniş
  const activeCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Bbox içindeki koordinatlı + henüz koordinatsız (city'den çözülecek)
  const inBoxOrMissingCoords = or(
    and(
      isNotNull(listingsTable.latitude),
      isNotNull(listingsTable.longitude),
      sql`${listingsTable.latitude}::float BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
      sql`${listingsTable.longitude}::float BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`,
    )!,
    or(isNull(listingsTable.latitude), isNull(listingsTable.longitude))!,
  )!;

  const conditions = [
    eq(listingsTable.status, "active"),
    eq(listingsTable.isActive, true),
    realListingFilter(),
    sql`COALESCE(${listingsTable.firstSeenAt}, ${listingsTable.createdAt}) >= ${activeCutoff}`,
    inBoxOrMissingCoords,
    ...buildChipConditions(q),
  ];

  const candidates = await db
    .select()
    .from(listingsTable)
    .where(and(...conditions))
    .orderBy(desc(sql`COALESCE(${listingsTable.firstSeenAt}, ${listingsTable.createdAt})`))
    .limit(1500);

  const scored: NearbyRow[] = [];
  const persistCoords: { id: number; lat: number; lng: number; accuracy: string }[] = [];

  for (const listing of candidates) {
    let la = parseListingCoord(listing.latitude);
    let lo = parseListingCoord(listing.longitude);
    let accuracy = listing.locationAccuracy ?? "district";
    let resolvedNow = false;

    if (la == null || lo == null) {
      const geo = resolveGeoFromCityText(listing.city);
      if (!geo) continue;
      la = geo.lat;
      lo = geo.lng;
      accuracy = geo.accuracy;
      resolvedNow = true;
    }

    const dist = haversineKm(lat, lng, la, lo);
    if (dist > radiusKm + 0.05) continue;

    if (resolvedNow) {
      persistCoords.push({ id: listing.id, lat: la, lng: lo, accuracy });
    }

    const approx = accuracy === "city" || accuracy === "estimated";
    scored.push({
      listing: {
        ...listing,
        latitude: String(la),
        longitude: String(lo),
        locationAccuracy: accuracy,
      },
      distanceKm: Math.round(dist * 10) / 10,
      sortDistanceKm: dist,
      sameDistrict: false,
      approximate: approx,
    });
  }

  if (persistCoords.length > 0) {
    void (async () => {
      for (const row of persistCoords.slice(0, 300)) {
        try {
          await db
            .update(listingsTable)
            .set({
              latitude: String(row.lat),
              longitude: String(row.lng),
              locationAccuracy: row.accuracy,
              locationSource: "district_center",
            })
            .where(eq(listingsTable.id, row.id));
        } catch {
          /* ignore */
        }
      }
    })();
  }

  if (q.districtHint) {
    const sameDistrictRows = await db
      .select()
      .from(listingsTable)
      .where(
        and(
          eq(listingsTable.status, "active"),
          eq(listingsTable.isActive, true),
          realListingFilter(),
          sql`COALESCE(${listingsTable.firstSeenAt}, ${listingsTable.createdAt}) >= ${activeCutoff}`,
          ilike(listingsTable.city, `%${q.districtHint}%`),
        ),
      )
      .limit(80);

    const seen = new Set(scored.map((s) => s.listing.id));
    for (const listing of sameDistrictRows) {
      if (seen.has(listing.id)) continue;
      scored.push({
        listing,
        distanceKm: null,
        sortDistanceKm: null,
        sameDistrict: true,
        approximate: false,
      });
    }
  }

  scored.sort((a, b) => {
    if (q.sort === "newest") {
      return new Date(b.listing.createdAt).getTime() - new Date(a.listing.createdAt).getTime();
    }
    if (q.sort === "views") {
      return (b.listing.viewCount ?? 0) - (a.listing.viewCount ?? 0);
    }
    if (q.sort === "salary") {
      const sa = Number(a.listing.salaryMin ?? a.listing.salaryMax ?? 0);
      const sb = Number(b.listing.salaryMin ?? b.listing.salaryMax ?? 0);
      return sb - sa;
    }
    if (a.sortDistanceKm == null && b.sortDistanceKm == null) {
      return b.listing.id - a.listing.id;
    }
    if (a.sortDistanceKm == null) return 1;
    if (b.sortDistanceKm == null) return -1;
    const distanceDifference = a.sortDistanceKm - b.sortDistanceKm;
    return distanceDifference !== 0 ? distanceDifference : b.listing.id - a.listing.id;
  });

  const total = scored.length;
  const offset = (q.page - 1) * q.limit;
  const rows = scored.slice(offset, offset + q.limit);
  return { total, rows };
}

export function assignCoordsFromCity(city: string): {
  latitude: string;
  longitude: string;
  locationAccuracy: string;
  locationSource: string;
} | null {
  const geo = resolveGeoFromCityText(city);
  if (!geo) return null;
  return {
    latitude: String(geo.lat),
    longitude: String(geo.lng),
    locationAccuracy: geo.accuracy,
    locationSource: "district_center",
  };
}
