import {
  locationScoringConfig,
  type ClassificationStatus,
  type LocationRole,
} from "./location-scoring.config";
import { normalizeTurkishText, normalizeAliasKey, hashText } from "./turkishTextNormalizer";
import {
  getBootstrapCatalog,
  findExactAliasHits,
  getLocationDisplay,
  type CatalogLocation,
  type LocationCatalog,
  type ScoredCandidate,
} from "./locationCatalog";
import { classifyCandidateRoles, applyHierarchyBonuses } from "./locationContextClassifier";
import { AMBIGUOUS_SHORT_NAMES } from "./location-scoring.config";

export type ClassifiedLocation = {
  locationId: number;
  name: string;
  display: string;
  province: string | null;
  district: string | null;
  locationType: string;
  role: LocationRole;
  evidence: string;
  confidence: number;
  method: string;
  score: number;
};

export type ClassifyJobLocationsInput = {
  title: string;
  description: string;
  structuredLocation?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  catalog?: LocationCatalog;
};

export type ClassifyJobLocationsResult = {
  workLocations: ClassifiedLocation[];
  serviceRoutes: ClassifiedLocation[];
  residenceRequirements: ClassifiedLocation[];
  interviewLocations: ClassifiedLocation[];
  companyHeadquarters: ClassifiedLocation[];
  primaryLocation: ClassifiedLocation | null;
  confidence: number;
  status: ClassificationStatus;
  evidence: string[];
  method: string[];
  locationScope?: "nationwide" | "regional" | null;
  candidates: ScoredCandidate[];
  rejected: ScoredCandidate[];
  textHash: string;
  aiUsed: boolean;
  processingTimeMs: number;
};

function toClassified(c: ScoredCandidate): ClassifiedLocation {
  return {
    locationId: c.location.id,
    name: c.location.name,
    display: getLocationDisplay(c.location),
    province: c.location.provinceName,
    district: c.location.districtName,
    locationType: c.location.locationType,
    role: c.role,
    evidence: c.sentence || c.evidence,
    confidence: c.confidence,
    method: c.method,
    score: c.score,
  };
}

function statusFromConfidence(conf: number): ClassificationStatus {
  const { confirmedMin, probableMin, ambiguousMin } = locationScoringConfig.confidence;
  if (conf >= confirmedMin) return "confirmed";
  if (conf >= probableMin) return "probable";
  if (conf >= ambiguousMin) return "ambiguous";
  return "unresolved";
}

function hasConflictingProvinceDistrict(work: ScoredCandidate[]): boolean {
  const provinces = new Set(work.map((w) => w.location.provinceId).filter(Boolean));
  for (const w of work) {
    if (!w.location.districtId) continue;
    const siblings = work.filter(
      (x) => x.location.locationType === "province" && x.location.provinceId !== w.location.provinceId,
    );
    if (siblings.length && provinces.size > 1 && work.every((x) => x.score === w.score)) {
      return true;
    }
  }
  // Same district name different provinces without industrial parent clarity
  const districtNames = work.filter((w) => w.location.locationType === "district");
  for (const d of districtNames) {
    const sameNameOtherProv = districtNames.filter(
      (o) =>
        o.location.id !== d.location.id &&
        normalizeAliasKey(o.location.name) === normalizeAliasKey(d.location.name) &&
        o.location.provinceId !== d.location.provinceId,
    );
    if (sameNameOtherProv.length && Math.abs(d.score - sameNameOtherProv[0]!.score) < 15) {
      return true;
    }
  }
  return false;
}

function detectNationwide(ascii: string): boolean {
  return /turkiye geneli|turkiye genelindeki|turkiye capinda|ulke geneli/.test(ascii);
}

function enrichFromDistrict(loc: CatalogLocation, catalog: LocationCatalog): CatalogLocation {
  if (loc.provinceName) return loc;
  if (loc.provinceId) {
    const p = catalog.byId.get(loc.provinceId);
    if (p) {
      return { ...loc, provinceName: p.name };
    }
  }
  return loc;
}

function dedupeByLocationId(items: ScoredCandidate[]): ScoredCandidate[] {
  const map = new Map<number, ScoredCandidate>();
  for (const item of items) {
    const prev = map.get(item.location.id);
    if (!prev || item.score > prev.score) map.set(item.location.id, item);
  }
  return [...map.values()];
}

function collapseToProvinceDistrictOsb(items: ScoredCandidate[]): ScoredCandidate[] {
  // Prefer OSB/industrial over plain district when same district; keep multiple districts
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const out: ScoredCandidate[] = [];
  for (const c of sorted) {
    const covers = out.some((o) => {
      if (o.location.id === c.location.id) return true;
      // Drop province-only if more specific in same province exists
      if (
        c.location.locationType === "province" &&
        o.location.provinceId === c.location.id &&
        o.location.locationType !== "province"
      ) {
        return true;
      }
      if (
        o.location.locationType === "province" &&
        c.location.provinceId === o.location.id &&
        c.location.locationType !== "province"
      ) {
        // replace province with more specific
        return false;
      }
      // district duplicate under industrial in same district
      if (
        c.location.locationType === "district" &&
        (o.location.locationType === "industrial_zone" || o.location.locationType === "free_zone") &&
        o.location.districtId === c.location.id
      ) {
        return true;
      }
      return false;
    });
    if (!covers) {
      // remove weaker province-only of same province
      for (let i = out.length - 1; i >= 0; i--) {
        const o = out[i]!;
        if (
          o.location.locationType === "province" &&
          c.location.provinceId === o.location.id &&
          c.location.locationType !== "province"
        ) {
          out.splice(i, 1);
        }
      }
      out.push(c);
    }
  }
  return out;
}

export function classifyJobLocations(input: ClassifyJobLocationsInput): ClassifyJobLocationsResult {
  const t0 = Date.now();
  const catalog = input.catalog ?? getBootstrapCatalog();
  const title = input.title ?? "";
  const description = input.description ?? "";
  const structured = input.structuredLocation ?? "";
  const fullText = [title, description, structured].filter(Boolean).join("\n");
  const ascii = normalizeTurkishText(fullText).ascii;
  const textHash = hashText(fullText);

  const methods: string[] = ["normalize", "exact_alias"];
  const evidence: string[] = [];

  if (detectNationwide(ascii)) {
    return {
      workLocations: [],
      serviceRoutes: [],
      residenceRequirements: [],
      interviewLocations: [],
      companyHeadquarters: [],
      primaryLocation: null,
      confidence: 0.95,
      status: "confirmed",
      evidence: ["Türkiye geneli ifadesi"],
      method: ["nationwide"],
      locationScope: "nationwide",
      candidates: [],
      rejected: [],
      textHash,
      aiUsed: false,
      processingTimeMs: Date.now() - t0,
    };
  }

  let hits = findExactAliasHits(fullText, catalog);

  // structured location boost: re-score later
  if (structured.trim()) {
    const structuredHits = findExactAliasHits(structured, catalog);
    for (const h of structuredHits) {
      hits.push(h);
    }
    methods.push("structured");
  }

  // Filter fuzzy-eligible short names from being treated as confirmed later
  hits = hits.filter((h) => {
    const key = compactOf(h.matchedText);
    if (AMBIGUOUS_SHORT_NAMES.has(key) && h.alias?.isAmbiguous) return true; // keep but mark
    return true;
  });

  methods.push("context_role", "hierarchy");
  let candidates = applyHierarchyBonuses(
    classifyCandidateRoles(fullText, title, hits, input.sourceName),
  );

  // Structured work location bonus
  if (structured.trim()) {
    const sAscii = normalizeTurkishText(structured).ascii;
    candidates = candidates.map((c) => {
      if (sAscii.includes(c.matchedText) || sAscii.includes(c.location.normalizedName)) {
        return {
          ...c,
          role: c.role === "mentioned_location" || c.role === "source_location" ? "work_location" : c.role,
          score: c.score + locationScoringConfig.structuredWorkLocation,
          confidence: Math.min(1, (c.score + locationScoringConfig.structuredWorkLocation) / 280),
        };
      }
      return c;
    });
  }

  candidates = candidates.map((c) => ({
    ...c,
    location: enrichFromDistrict(c.location, catalog),
  }));

  const byRole = (role: LocationRole) =>
    collapseToProvinceDistrictOsb(
      dedupeByLocationId(candidates.filter((c) => c.role === role && c.score > 0)).sort(
        (a, b) => b.score - a.score,
      ),
    );

  let work = byRole("work_location");
  // If no explicit work_location but strong industrial/district/region with no negative context
  if (work.length === 0) {
    const fallback = candidates
      .filter(
        (c) =>
          (c.role === "mentioned_location" || c.role === "work_location") &&
          c.score >= 80 &&
          !c.alias?.isAmbiguous &&
          c.location.locationType !== "province",
      )
      .sort((a, b) => b.score - a.score);
    work = collapseToProvinceDistrictOsb(dedupeByLocationId(fallback));
    for (const w of work) {
      w.role = "work_location";
    }
  }

  // İl + bölge (Anadolu Yakası): ilçe null, province set
  if (work.length === 0) {
    const region = candidates
      .filter((c) => c.location.locationType === "region" && c.score >= 50)
      .sort((a, b) => b.score - a.score);
    if (region[0]) {
      work = [{ ...region[0], role: "work_location" }];
    }
  }

  const serviceRoutes = byRole("service_route");
  const residenceRequirements = byRole("residence_requirement");
  const interviewLocations = byRole("interview_location");
  const companyHeadquarters = byRole("company_headquarters");
  const sourceOnly = candidates.filter((c) => c.role === "source_location");

  const rejected: ScoredCandidate[] = [
    ...serviceRoutes,
    ...residenceRequirements,
    ...interviewLocations,
    ...companyHeadquarters,
    ...sourceOnly,
  ];

  // Ambiguous-only work (AOSB, Cumhuriyet Mahallesi without district)
  const ambiguousOnly =
    work.length > 0 &&
    work.every(
      (w) =>
        w.alias?.isAmbiguous ||
        (!w.location.provinceId && w.location.locationType === "neighborhood") ||
        (!w.location.districtId &&
          w.location.locationType === "neighborhood" &&
          AMBIGUOUS_SHORT_NAMES.has(compactOf(w.location.name))),
    );

  const tie =
    work.length >= 2 &&
    Math.abs(work[0]!.score - work[1]!.score) < 8 &&
    work[0]!.location.provinceId !== work[1]!.location.provinceId &&
    work[0]!.location.locationType === work[1]!.location.locationType;

  const onlyNonWork =
    work.length === 0 &&
    (serviceRoutes.length > 0 ||
      residenceRequirements.length > 0 ||
      interviewLocations.length > 0 ||
      companyHeadquarters.length > 0 ||
      sourceOnly.length > 0);

  const conflict = hasConflictingProvinceDistrict(work);

  let status: ClassificationStatus;
  let primary: ScoredCandidate | null = null;
  let confidence = 0;

  if (ambiguousOnly || onlyNonWork || conflict || (tie && work.every((w) => w.location.locationType === "industrial_zone" && w.alias?.isAmbiguous))) {
    status = ambiguousOnly || conflict || tie ? "ambiguous" : "unresolved";
    if (ambiguousOnly || onlyNonWork) status = "unresolved";
    if (work.length === 1 && work[0]!.alias?.isAmbiguous && !work[0]!.location.provinceName) {
      status = "ambiguous";
    }
    // Cumhuriyet etc.
    if (work.some((w) => !w.location.provinceName && w.alias?.isAmbiguous)) {
      status = "unresolved";
      work = [];
    }
    // AOSB
    if (candidates.some((c) => compactOf(c.matchedText) === "aosb" && c.alias?.isAmbiguous)) {
      status = "ambiguous";
      work = [];
    }
    primary = null;
    confidence = status === "ambiguous" ? 0.6 : 0.3;
    evidence.push("Belirsiz veya yetersiz çalışma konumu sinyali");
  } else if (work.length === 0) {
    status = "unresolved";
    confidence = 0.2;
    evidence.push("Çalışma konumu bulunamadı");
  } else {
    // Multi work locations OK (Pendik, Tuzla, Gebze)
    primary = work[0]!;
    confidence = Math.min(1, Math.max(...work.map((w) => w.confidence)));
    // Boost when hierarchy complete
    if (primary.location.provinceName && (primary.location.districtName || primary.location.locationType === "region")) {
      confidence = Math.max(confidence, 0.9);
    }
    status = statusFromConfidence(confidence);
    // Province-only region like Anadolu Yakası
    if (primary.location.locationType === "region") {
      status = confidence >= 0.75 ? "confirmed" : status;
    }
    for (const w of work) {
      evidence.push(w.sentence || w.evidence);
    }
  }

  // Never auto-assign city from source-only
  if (work.length === 0 && sourceOnly.length && !structured.trim()) {
    status = "unresolved";
    primary = null;
    confidence = Math.min(confidence, 0.4);
  }

  const workLocations = work.map(toClassified);
  const result: ClassifyJobLocationsResult = {
    workLocations,
    serviceRoutes: serviceRoutes.map(toClassified),
    residenceRequirements: residenceRequirements.map(toClassified),
    interviewLocations: interviewLocations.map(toClassified),
    companyHeadquarters: companyHeadquarters.map(toClassified),
    primaryLocation: primary ? toClassified(primary) : null,
    confidence,
    status,
    evidence,
    method: methods,
    locationScope: primary?.location.locationType === "region" ? "regional" : null,
    candidates,
    rejected,
    textHash,
    aiUsed: false,
    processingTimeMs: Date.now() - t0,
  };

  return result;
}

function compactOf(s: string): string {
  return normalizeAliasKey(s).replace(/\s+/g, "");
}

/** Eski ParsedLocation uyumluluğu */
export function classificationToParsedCity(result: ClassifyJobLocationsResult): {
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  display: string | null;
  unresolved: boolean;
} {
  if (result.locationScope === "nationwide") {
    return { city: "Türkiye Geneli", district: null, neighborhood: null, display: "Türkiye Geneli", unresolved: false };
  }
  if (result.status === "unresolved" || result.status === "ambiguous" || !result.primaryLocation) {
    if (result.workLocations.length > 1 && result.status !== "unresolved" && result.status !== "ambiguous") {
      const first = result.workLocations[0]!;
      return {
        city: first.province,
        district: first.district,
        neighborhood: first.locationType === "industrial_zone" || first.locationType === "free_zone" ? first.name : null,
        display: first.display,
        unresolved: false,
      };
    }
    return {
      city: null,
      district: null,
      neighborhood: null,
      display: result.status === "unresolved" || result.status === "ambiguous" ? "Konum doğrulanıyor" : null,
      unresolved: true,
    };
  }
  const p = result.primaryLocation;
  return {
    city: p.province,
    district: p.district,
    neighborhood:
      p.locationType === "industrial_zone" ||
      p.locationType === "free_zone" ||
      p.locationType === "neighborhood" ||
      p.locationType === "region"
        ? p.name
        : null,
    display: p.display,
    unresolved: false,
  };
}
