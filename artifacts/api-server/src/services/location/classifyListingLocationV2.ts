import {
  classifyJobLocations,
  classificationToParsedCity,
  type ClassifyJobLocationsResult,
} from "./jobLocationClassifier";
import { getBootstrapCatalog } from "./locationCatalog";
import {
  loadCatalogFromDb,
  persistClassification,
  findCachedClassification,
} from "./locationRepository";
import { resolveWithAi } from "./locationAiResolver";
import {
  isLocationClassifierV2Enabled,
  isLocationClassifierV2ShadowMode,
} from "./featureFlags";
import type { ParsedLocation } from "../../lib/job-parsing";

let catalogCache: ReturnType<typeof getBootstrapCatalog> | null = null;
let catalogLoadedAt = 0;

async function getCatalog() {
  const now = Date.now();
  if (catalogCache && now - catalogLoadedAt < 10 * 60_000) return catalogCache;
  const fromDb = await loadCatalogFromDb().catch(() => null);
  catalogCache = fromDb ?? getBootstrapCatalog();
  catalogLoadedAt = now;
  return catalogCache;
}

export async function classifyListingLocationV2(opts: {
  jobId?: number;
  title: string;
  description: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  structuredLocation?: string | null;
}): Promise<{ result: ClassifyJobLocationsResult; parsed: ParsedLocation & { unresolved?: boolean } }> {
  const catalog = await getCatalog();
  let result = classifyJobLocations({
    title: opts.title,
    description: opts.description,
    sourceName: opts.sourceName,
    sourceUrl: opts.sourceUrl,
    structuredLocation: opts.structuredLocation,
    catalog,
  });

  const cached = await findCachedClassification(result.textHash).catch(() => null);
  if (cached && cached.status === "confirmed" && typeof cached.selectedLocations === "object") {
    // cache hit — keep fresh classification but could short-circuit later
  }

  if (
    (result.status === "ambiguous" || result.status === "unresolved" || result.confidence < 0.75) &&
    result.candidates.length > 0
  ) {
    const ai = await resolveWithAi({
      title: opts.title,
      description: opts.description,
      candidates: result.candidates,
      current: result,
    });
    if (ai) {
      const byId = new Map(result.candidates.map((c) => [c.location.id, c]));
      const pick = (ids: number[], role: string) =>
        ids
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((c) => ({
            locationId: c!.location.id,
            name: c!.location.name,
            display: [c!.location.provinceName, c!.location.districtName, c!.location.name]
              .filter(Boolean)
              .join(" / "),
            province: c!.location.provinceName,
            district: c!.location.districtName,
            locationType: c!.location.locationType,
            role: role as never,
            evidence: ai.evidence || c!.sentence,
            confidence: ai.confidence ?? c!.confidence,
            method: "ai",
            score: c!.score,
          }));
      const work = pick(ai.workLocationIds, "work_location");
      result = {
        ...result,
        workLocations: work,
        serviceRoutes: pick(ai.serviceRouteIds, "service_route"),
        residenceRequirements: pick(ai.residenceIds, "residence_requirement"),
        interviewLocations: pick(ai.interviewIds, "interview_location"),
        companyHeadquarters: pick(ai.headquartersIds, "company_headquarters"),
        primaryLocation: work[0] ?? null,
        status: ai.status,
        confidence: ai.confidence ?? result.confidence,
        aiUsed: true,
        evidence: ai.evidence ? [ai.evidence] : result.evidence,
        method: [...result.method, "ai"],
      };
    }
  }

  if (opts.jobId) {
    const shadow = isLocationClassifierV2ShadowMode() && !isLocationClassifierV2Enabled();
    await persistClassification(opts.jobId, result, shadow).catch(() => undefined);
  }

  const parsed = classificationToParsedCity(result);
  return {
    result,
    parsed: {
      city: parsed.city,
      district: parsed.district,
      neighborhood: parsed.neighborhood,
      display: parsed.display,
      unresolved: parsed.unresolved,
    },
  };
}

/** Scraper için: V2 açıksa yeni motor, shadow'da eski + log, kapalıysa null */
export async function maybeClassifyWithV2(opts: {
  jobId?: number;
  title: string;
  text: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  legacy: ParsedLocation;
}): Promise<{ city: string; usedV2: boolean; unresolved: boolean }> {
  const enabled = isLocationClassifierV2Enabled();
  const shadow = isLocationClassifierV2ShadowMode();

  if (!enabled && !shadow) {
    return {
      city: opts.legacy.display ?? opts.legacy.district ?? opts.legacy.city ?? "Türkiye",
      usedV2: false,
      unresolved: false,
    };
  }

  const { result, parsed } = await classifyListingLocationV2({
    jobId: opts.jobId,
    title: opts.title,
    description: opts.text,
    sourceName: opts.sourceName,
    sourceUrl: opts.sourceUrl,
  });

  if (shadow && !enabled) {
    // Eski sonuç kullanıcıya; yeni sonuç sadece log (persist shadow)
    return {
      city: opts.legacy.display ?? opts.legacy.district ?? opts.legacy.city ?? "Türkiye",
      usedV2: false,
      unresolved: false,
    };
  }

  if (parsed.unresolved || result.status === "unresolved" || result.status === "ambiguous") {
    return { city: "Konum doğrulanıyor", usedV2: true, unresolved: true };
  }

  return {
    city: parsed.display ?? parsed.city ?? "Konum doğrulanıyor",
    usedV2: true,
    unresolved: false,
  };
}
