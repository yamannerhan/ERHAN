import { normalizeAliasKey, compactKey, normalizeTurkishText } from "./turkishTextNormalizer";
import { CRITICAL_ALIAS_SEEDS, TURKEY_PROVINCES_81 } from "./criticalAliasSeeds";
import { REGIONAL_LOCATION_KEYWORDS } from "../../lib/location-terms";
import type { LocationRole } from "./location-scoring.config";

export type CatalogLocation = {
  id: number;
  locationType: string;
  name: string;
  normalizedName: string;
  provinceName: string | null;
  districtName: string | null;
  provinceId: number | null;
  districtId: number | null;
  parentId: number | null;
  adminLevel: number | null;
  source: string;
};

export type CatalogAlias = {
  id: number;
  locationId: number;
  alias: string;
  normalizedAlias: string;
  compactAlias: string;
  aliasType: string;
  priority: number;
  isAmbiguous: boolean;
};

export type LocationCatalog = {
  locations: CatalogLocation[];
  aliases: CatalogAlias[];
  byId: Map<number, CatalogLocation>;
  aliasesByNorm: Map<string, CatalogAlias[]>;
};

let nextId = 1;

function addLocation(
  catalog: LocationCatalog,
  partial: Omit<CatalogLocation, "id" | "normalizedName"> & { normalizedName?: string },
): CatalogLocation {
  const loc: CatalogLocation = {
    id: nextId++,
    normalizedName: partial.normalizedName ?? normalizeAliasKey(partial.name),
    ...partial,
  };
  catalog.locations.push(loc);
  catalog.byId.set(loc.id, loc);
  return loc;
}

function addAlias(
  catalog: LocationCatalog,
  locationId: number,
  alias: string,
  opts: { aliasType?: string; priority?: number; isAmbiguous?: boolean } = {},
): void {
  const normalizedAlias = normalizeAliasKey(alias);
  if (!normalizedAlias) return;
  const row: CatalogAlias = {
    id: nextId++,
    locationId,
    alias,
    normalizedAlias,
    compactAlias: compactKey(alias),
    aliasType: opts.aliasType ?? "name",
    priority: opts.priority ?? 0,
    isAmbiguous: opts.isAmbiguous ?? false,
  };
  catalog.aliases.push(row);
  const list = catalog.aliasesByNorm.get(normalizedAlias) ?? [];
  list.push(row);
  catalog.aliasesByNorm.set(normalizedAlias, list);
  if (row.compactAlias !== normalizedAlias) {
    const cl = catalog.aliasesByNorm.get(row.compactAlias) ?? [];
    cl.push(row);
    catalog.aliasesByNorm.set(row.compactAlias, cl);
  }
}

function generateOsbAliases(name: string): string[] {
  const n = name.trim();
  if (!n) return [];
  const out = new Set<string>([n]);
  const ascii = normalizeAliasKey(n);
  out.add(ascii);
  // "Gebze Organize Sanayi Bölgesi" → "Gebze OSB", "Gebze Organize"
  if (/organize\s+sanayi/i.test(n) || /\bosb\b/i.test(n)) {
    const base = n
      .replace(/\s*organize\s+sanayi\s+b[öo]lgesi/gi, "")
      .replace(/\s*osb\b/gi, "")
      .trim();
    if (base) {
      out.add(`${base} OSB`);
      out.add(`${base} Organize`);
    }
  }
  if (/serbest\s+b[öo]lge/i.test(n)) {
    out.add(n.replace(/\s*serbest\s+b[öo]lgesi?/gi, "").trim() + " Serbest Bölge");
  }
  return [...out].filter(Boolean);
}

/** Bellek içi katalog — OSM sync öncesi ve unit testler için */
export function buildBootstrapCatalog(): LocationCatalog {
  nextId = 1;
  const catalog: LocationCatalog = {
    locations: [],
    aliases: [],
    byId: new Map(),
    aliasesByNorm: new Map(),
  };

  const provinceByName = new Map<string, CatalogLocation>();

  for (const name of TURKEY_PROVINCES_81) {
    const loc = addLocation(catalog, {
      locationType: "province",
      name,
      provinceName: name,
      districtName: null,
      provinceId: null,
      districtId: null,
      parentId: null,
      adminLevel: 4,
      source: "seed",
    });
    provinceByName.set(normalizeAliasKey(name), loc);
    addAlias(catalog, loc.id, name, { aliasType: "name", priority: 100 });
  }

  // province self provinceId
  for (const loc of catalog.locations) {
    if (loc.locationType === "province") {
      loc.provinceId = loc.id;
    }
  }

  const districtByKey = new Map<string, CatalogLocation>();

  for (const [province, data] of Object.entries(REGIONAL_LOCATION_KEYWORDS)) {
    const prov = provinceByName.get(normalizeAliasKey(province));
    if (!prov) continue;
    for (const alias of data.aliases) {
      addAlias(catalog, prov.id, alias, { aliasType: "alt_name", priority: 80 });
    }
    for (const district of data.districts) {
      const d = addLocation(catalog, {
        locationType: "district",
        name: district,
        provinceName: province,
        districtName: district,
        provinceId: prov.id,
        districtId: null,
        parentId: prov.id,
        adminLevel: 6,
        source: "seed",
      });
      d.districtId = d.id;
      districtByKey.set(`${normalizeAliasKey(province)}|${normalizeAliasKey(district)}`, d);
      addAlias(catalog, d.id, district, { aliasType: "name", priority: 90 });
    }
    for (const term of data.terms) {
      const districtLoc = term.district
        ? districtByKey.get(`${normalizeAliasKey(province)}|${normalizeAliasKey(term.district)}`)
        : null;
      const isOsb = /osb|serbest|organize|taysad|gosb|ostim|esbas|imos|imes|des\b/i.test(term.term + term.display);
      const loc = addLocation(catalog, {
        locationType: isOsb ? ( /serbest/i.test(term.display) ? "free_zone" : "industrial_zone" ) : (term.neighborhood ? "neighborhood" : "business_district"),
        name: term.neighborhood ?? term.display.split("/").pop()?.trim() ?? term.term,
        provinceName: province,
        districtName: term.district ?? null,
        provinceId: prov.id,
        districtId: districtLoc?.id ?? null,
        parentId: districtLoc?.id ?? prov.id,
        adminLevel: term.neighborhood ? 10 : null,
        source: "seed",
      });
      addAlias(catalog, loc.id, term.term, { aliasType: "seed_term", priority: 95 });
      for (const a of generateOsbAliases(loc.name)) {
        addAlias(catalog, loc.id, a, { aliasType: "auto", priority: 40 });
      }
    }
  }

  // Regions
  const istanbul = provinceByName.get("istanbul");
  if (istanbul) {
    const region = addLocation(catalog, {
      locationType: "region",
      name: "Anadolu Yakası",
      provinceName: "İstanbul",
      districtName: null,
      provinceId: istanbul.id,
      districtId: null,
      parentId: istanbul.id,
      adminLevel: null,
      source: "seed",
    });
    addAlias(catalog, region.id, "Anadolu Yakası", { aliasType: "name", priority: 90 });
    addAlias(catalog, region.id, "anadolu yakasi", { aliasType: "name", priority: 90 });
  }

  // Critical aliases (GOSB etc.)
  for (const seed of CRITICAL_ALIAS_SEEDS) {
    if (seed.ambiguous) {
      // Standalone ambiguous alias pointing to a synthetic unresolved marker location
      const marker = addLocation(catalog, {
        locationType: "industrial_zone",
        name: seed.name,
        provinceName: null,
        districtName: null,
        provinceId: null,
        districtId: null,
        parentId: null,
        adminLevel: null,
        source: "critical_seed",
      });
      addAlias(catalog, marker.id, seed.alias, { aliasType: "critical", priority: 100, isAmbiguous: true });
      continue;
    }
    const prov = provinceByName.get(normalizeAliasKey(seed.province));
    if (!prov) continue;
    const districtLoc = seed.district
      ? districtByKey.get(`${normalizeAliasKey(seed.province)}|${normalizeAliasKey(seed.district)}`)
      : null;
    // Find or create industrial zone
    let zone = catalog.locations.find(
      (l) =>
        l.locationType === seed.locationType &&
        normalizeAliasKey(l.name) === normalizeAliasKey(seed.name) &&
        l.provinceId === prov.id,
    );
    if (!zone) {
      zone = addLocation(catalog, {
        locationType: seed.locationType,
        name: seed.name,
        provinceName: seed.province,
        districtName: seed.district || null,
        provinceId: prov.id,
        districtId: districtLoc?.id ?? null,
        parentId: districtLoc?.id ?? prov.id,
        adminLevel: null,
        source: "critical_seed",
      });
      for (const a of generateOsbAliases(seed.name)) {
        addAlias(catalog, zone.id, a, { aliasType: "auto", priority: 50 });
      }
    }
    addAlias(catalog, zone.id, seed.alias, {
      aliasType: "critical",
      priority: 100,
      isAmbiguous: false,
    });
  }

  // Ambiguous common neighborhoods (no default district)
  const ambiguousNeighborhoods = [
    "Cumhuriyet Mahallesi",
    "Yeni Mahalle",
    "Sanayi Mahallesi",
    "Merkez",
    "Atatürk Mahallesi",
  ];
  for (const name of ambiguousNeighborhoods) {
    const loc = addLocation(catalog, {
      locationType: "neighborhood",
      name,
      provinceName: null,
      districtName: null,
      provinceId: null,
      districtId: null,
      parentId: null,
      adminLevel: 10,
      source: "seed_ambiguous",
    });
    addAlias(catalog, loc.id, name, { aliasType: "name", priority: 30, isAmbiguous: true });
    addAlias(catalog, loc.id, name.replace(/\s+mahallesi?/i, ""), {
      aliasType: "short_name",
      priority: 20,
      isAmbiguous: true,
    });
  }

  return catalog;
}

let cachedCatalog: LocationCatalog | null = null;

export function getBootstrapCatalog(): LocationCatalog {
  if (!cachedCatalog) cachedCatalog = buildBootstrapCatalog();
  return cachedCatalog;
}

export function resetBootstrapCatalog(): void {
  cachedCatalog = null;
}

export type LocationMatchHit = {
  location: CatalogLocation;
  alias: CatalogAlias | null;
  matchedText: string;
  start: number;
  end: number;
  method: "exact" | "alias" | "fuzzy";
  similarity?: number;
};

/** Aday kelimeleri çıkar — tüm katalog belleğe yüklenmez; alias indeksi kullanılır */
export function findExactAliasHits(text: string, catalog: LocationCatalog): LocationMatchHit[] {
  const haystack = normalizeTurkishText(text).ascii;
  const hits: LocationMatchHit[] = [];
  const seen = new Set<string>();

  // Sort aliases longest-first for greedy match
  const uniqueAliases = [...new Map(catalog.aliases.map((a) => [a.normalizedAlias, a])).values()]
    .filter((a) => a.normalizedAlias.length >= 2)
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length);

  for (const alias of uniqueAliases) {
    const needle = alias.normalizedAlias;
    if (needle.length < 3 && !/^(gosb|tosb|ostim|esbas|cosb|aosb)$/.test(needle.replace(/\s/g, ""))) {
      continue;
    }
    const compact = alias.compactAlias;
    const patterns = [needle];
    if (compact.length >= 3 && compact !== needle) patterns.push(compact);

    for (const p of patterns) {
      // Türkçe ekler: tuzla'dan → tuzladan after normalize (apostrophe → space → tuzla dan)
      const re = new RegExp(
        `(?:^|[^a-z0-9])(${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=[^a-z0-9]|$)`,
        "gi",
      );
      let m: RegExpExecArray | null;
      while ((m = re.exec(haystack)) !== null) {
        const matched = m[1]!;
        const start = m.index + (m[0].length - matched.length);
        const key = `${alias.locationId}:${start}:${matched}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const loc = catalog.byId.get(alias.locationId);
        if (!loc) continue;
        hits.push({
          location: loc,
          alias,
          matchedText: matched,
          start,
          end: start + matched.length,
          method: alias.aliasType === "name" ? "exact" : "alias",
        });
      }
    }
  }
  return hits;
}

export function getLocationDisplay(loc: CatalogLocation): string {
  const parts = [loc.provinceName, loc.districtName, loc.name].filter(Boolean);
  // Avoid "İstanbul / Tuzla / Tuzla"
  const uniq: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (uniq.length && normalizeAliasKey(uniq[uniq.length - 1]!) === normalizeAliasKey(p)) continue;
    uniq.push(p);
  }
  return uniq.join(" / ");
}

export type ScoredCandidate = LocationMatchHit & {
  role: LocationRole;
  score: number;
  confidence: number;
  evidence: string;
  sentence: string;
  nearbyWords: string[];
};
