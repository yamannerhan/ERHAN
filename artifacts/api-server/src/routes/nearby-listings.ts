import { Router } from "express";
import { optionalAuthMiddleware } from "../middlewares/auth";
import {
  ensureNearbySchema,
  findNearbyListings,
  parseCoord,
  parseNearbyRadius,
  parseNearbySort,
  assignCoordsFromCity,
  type NearbyQuery,
} from "../lib/nearby-listings";
import { listDistrictsForProvince, listProvinces, resolveDistrictCenter } from "../lib/geo-centers";
import { db, listingsTable, listingFavoritesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { extractPhoneNumber } from "../lib/job-parsing";

const router = Router();

void ensureNearbySchema().catch(() => undefined);

function maskContactInfo(text: string): string {
  return text
    .replace(/(?:\+90|0)?[\s\-./()]*(?:5(?:[\s\-./()]*\d){9})/g, "[GİRİŞ_GEREKLİ]")
    .replace(/(?:iletişim|irtibat|yetkili)\s*[:\-]?\s*[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+/gi, "[GİRİŞ_GEREKLİ]");
}

function formatNearbyListing(
  listing: typeof listingsTable.$inferSelect,
  distanceKm: number | null,
  sameDistrict: boolean,
  approximate: boolean,
  userId?: number,
  favIds?: Set<number>,
) {
  const isAuth = userId != null;
  const rawDesc = listing.description;
  let rawApplyUrl = listing.applyUrl;
  if (rawApplyUrl && /t\.me\/|telegram\.me\/|wa\.me\//i.test(rawApplyUrl)) {
    const phone = extractPhoneNumber(`${rawDesc ?? ""}\n${listing.requirements ?? ""}\n${listing.title}`);
    rawApplyUrl = phone ? `tel:${phone}` : null;
  }
  const description = rawDesc ? (isAuth ? rawDesc : maskContactInfo(rawDesc)) : null;
  const applyUrl = rawApplyUrl
    ? (isAuth ? rawApplyUrl : (rawApplyUrl.startsWith("tel:") || rawApplyUrl.startsWith("http") ? "auth_required" : rawApplyUrl))
    : null;

  return {
    id: listing.id,
    title: listing.title,
    company: listing.company,
    companyName: listing.company,
    city: listing.city,
    salary: listing.salary,
    workType: listing.workType,
    employmentType: listing.workType,
    description,
    requirements: listing.requirements,
    applyUrl,
    companyLogoUrl: listing.companyLogoUrl,
    isFeatured: listing.isFeatured,
    isFavoritedByMe: userId != null && favIds != null ? favIds.has(listing.id) : false,
    viewCount: listing.viewCount,
    createdAt: listing.createdAt.toISOString(),
    distanceKm,
    sameDistrict,
    approximate,
    hasService: /servis/i.test(`${listing.title} ${listing.description ?? ""} ${listing.requirements ?? ""}`),
    locationAccuracy: listing.locationAccuracy,
  };
}

/** GET /api/listings/nearby/meta — il / ilçe listesi */
router.get("/listings/nearby/meta", async (req, res): Promise<void> => {
  const city = String(req.query["city"] ?? "").trim();
  if (city) {
    res.json({
      success: true,
      districts: listDistrictsForProvince(city),
    });
    return;
  }
  res.json({
    success: true,
    provinces: listProvinces(),
    radii: [5, 10, 25, 50, 100],
    sorts: [
      { id: "distance", label: "En yakın" },
      { id: "salary", label: "En yüksek maaş" },
      { id: "newest", label: "En yeni" },
      { id: "views", label: "En çok görüntülenen" },
    ],
  });
});

/** GET /api/listings/nearby */
router.get("/listings/nearby", optionalAuthMiddleware, async (req, res): Promise<void> => {
  await ensureNearbySchema();

  let lat = parseCoord(req.query["lat"], "lat");
  let lng = parseCoord(req.query["lng"], "lng");
  const radiusRaw = req.query["radius"] ?? req.query["radiusKm"];
  const radiusParsed = parseNearbyRadius(radiusRaw);
  if (radiusRaw != null && String(radiusRaw).length > 0 && radiusParsed == null) {
    res.status(400).json({
      success: false,
      error: "Geçersiz mesafe. Sadece 5, 10, 25, 50 veya 100 km kabul edilir.",
    });
    return;
  }
  const radiusKm = radiusParsed ?? 25;
  const sort = parseNearbySort(req.query["sort"]);
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10) || 1);
  const limit = Math.min(24, Math.max(1, parseInt(String(req.query["limit"] ?? "24"), 10) || 24));

  const city = String(req.query["city"] ?? "").trim() || undefined;
  const district = String(req.query["district"] ?? "").trim() || undefined;

  // Manuel il/ilçe → merkez koordinat (mesafe hesabı buradan; il adı ile SQL filtresi yok)
  if ((lat == null || lng == null) && city) {
    const { resolveGeoFromCityText } = await import("../lib/geo-centers");
    const fromText = resolveGeoFromCityText(district ? `${city} / ${district}` : city);
    const geo = district ? resolveDistrictCenter(city, district) : null;
    const point = geo ?? fromText;
    if (point) {
      lat = point.lat;
      lng = point.lng;
    }
  }

  if (lat == null || lng == null) {
    res.status(400).json({
      success: false,
      error: "Geçerli lat/lng veya city parametresi gerekli",
    });
    return;
  }

  const employmentType = String(req.query["employmentType"] ?? "").trim() || undefined;
  const armedStatus = String(req.query["armedStatus"] ?? "").trim() || undefined;
  const shift = String(req.query["shift"] ?? "").trim() || undefined;
  const service = req.query["service"] === "true" || req.query["service"] === "1";
  const date = req.query["date"] === "today" ? "today" as const : undefined;
  const salarySpecified = req.query["salarySpecified"] === "true" || req.query["minSalary"] != null;

  const query: NearbyQuery = {
    lat,
    lng,
    radiusKm,
    sort,
    page,
    limit,
    employmentType: employmentType === "parttime" || employmentType === "PartTime" ? "parttime" : employmentType,
    armedStatus: armedStatus === "silahli" || armedStatus === "Silahlı" ? "silahli"
      : armedStatus === "silahsiz" || armedStatus === "Silahsız" ? "silahsiz"
        : armedStatus,
    shift: shift === "gece" || shift === "night" ? "gece" : shift,
    service: service || undefined,
    date,
    salarySpecified: salarySpecified || undefined,
    districtHint: district,
  };

  try {
    const { total, rows } = await findNearbyListings(query);
    const userId = req.user?.id;
    let favIds: Set<number> | undefined;
    if (userId && rows.length > 0) {
      const favs = await db
        .select({ listingId: listingFavoritesTable.listingId })
        .from(listingFavoritesTable)
        .where(
          and(
            eq(listingFavoritesTable.userId, userId),
            inArray(listingFavoritesTable.listingId, rows.map((r) => r.listing.id)),
          ),
        );
      favIds = new Set(favs.map((f) => f.listingId));
    }

    res.json({
      success: true,
      location: {
        radiusKm,
        // tam koordinat dönülmez
        label: district && city ? `${district} / ${city} civarı` : city ? `${city} civarı` : "Konumunuz civarı",
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      listings: rows.map((r) =>
        formatNearbyListing(r.listing, r.distanceKm, r.sameDistrict, r.approximate, userId, favIds),
      ),
    });
  } catch (e) {
    console.error("[nearby]", e);
    res.status(500).json({ success: false, error: "İlanlar yüklenemedi. Lütfen tekrar deneyin." });
  }
});

export { assignCoordsFromCity };
export default router;
