import { db, listingsTable } from "@workspace/db";
import { and, eq, sql, lt, or, isNull } from "drizzle-orm";
import {
  classifyJobLocations,
  classificationToParsedCity,
  type ClassifyJobLocationsResult,
} from "../services/location/jobLocationClassifier";
import { getBootstrapCatalog } from "../services/location/locationCatalog";
import { loadCatalogFromDb, persistClassification } from "../services/location/locationRepository";
import { resolveWithAi } from "../services/location/locationAiResolver";

export type ReclassifyOptions = {
  dryRun?: boolean;
  batchSize?: number;
  onlyUnresolved?: boolean;
  onlyLowConfidence?: boolean;
  limit?: number;
};

export type ReclassifyRow = {
  id: number;
  oldCity: string;
  newCity: string | null;
  newDistrict: string | null;
  workLocations: string[];
  serviceRoutes: string[];
  evidence: string[];
  confidence: number;
  status: string;
  reason: string;
};

function applyAi(
  base: ClassifyJobLocationsResult,
  ai: Awaited<ReturnType<typeof resolveWithAi>>,
): ClassifyJobLocationsResult {
  if (!ai) return base;
  const byId = new Map(base.candidates.map((c) => [c.location.id, c]));
  const pick = (ids: number[]) =>
    ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((c) => ({
        locationId: c!.location.id,
        name: c!.location.name,
        display: [c!.location.provinceName, c!.location.districtName, c!.location.name].filter(Boolean).join(" / "),
        province: c!.location.provinceName,
        district: c!.location.districtName,
        locationType: c!.location.locationType,
        role: c!.role,
        evidence: ai.evidence || c!.sentence,
        confidence: ai.confidence ?? c!.confidence,
        method: "ai",
        score: c!.score,
      }));

  if (ai.status === "unresolved" || (ai.workLocationIds.length === 0 && ai.status !== "confirmed")) {
    return {
      ...base,
      workLocations: [],
      primaryLocation: null,
      status: ai.status,
      confidence: ai.confidence ?? 0.4,
      aiUsed: true,
      evidence: ai.evidence ? [ai.evidence] : base.evidence,
    };
  }

  const work = pick(ai.workLocationIds);
  return {
    ...base,
    workLocations: work,
    serviceRoutes: pick(ai.serviceRouteIds),
    residenceRequirements: pick(ai.residenceIds),
    interviewLocations: pick(ai.interviewIds),
    companyHeadquarters: pick(ai.headquartersIds),
    primaryLocation: work[0] ?? null,
    status: ai.status,
    confidence: ai.confidence ?? base.confidence,
    aiUsed: true,
    evidence: ai.evidence ? [ai.evidence, ...base.evidence] : base.evidence,
    method: [...base.method, "ai"],
  };
}

export async function reclassifyJobLocations(opts: ReclassifyOptions = {}): Promise<{
  total: number;
  updated: number;
  rows: ReclassifyRow[];
}> {
  const batchSize = opts.batchSize ?? 100;
  const dryRun = opts.dryRun ?? false;
  const catalog = (await loadCatalogFromDb()) ?? getBootstrapCatalog();

  const conditions = [eq(listingsTable.isActive, true)];
  if (opts.onlyUnresolved) {
    conditions.push(
      or(
        eq(listingsTable.city, "Konum doğrulanıyor"),
        eq(listingsTable.city, "Türkiye"),
        eq(listingsTable.city, "Türkiye Geneli"),
        isNull(listingsTable.city),
        eq(listingsTable.city, ""),
      )!,
    );
  }

  const listings = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      description: listingsTable.description,
      rawText: listingsTable.rawText,
      city: listingsTable.city,
      sourceTag: listingsTable.sourceTag,
      sourceUrl: listingsTable.sourceUrl,
    })
    .from(listingsTable)
    .where(and(...conditions))
    .limit(opts.limit ?? 5000);

  const rows: ReclassifyRow[] = [];
  let updated = 0;

  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize);
    for (const job of batch) {
      const text = job.rawText || `${job.title}\n${job.description || ""}`;
      let result = classifyJobLocations({
        title: job.title,
        description: job.description || text,
        sourceName: job.sourceTag,
        sourceUrl: job.sourceUrl,
        catalog,
      });

      if (
        result.status === "ambiguous" ||
        result.status === "unresolved" ||
        result.confidence < 0.75
      ) {
        const ai = await resolveWithAi({
          title: job.title,
          description: job.description || text,
          candidates: result.candidates,
          current: result,
        });
        result = applyAi(result, ai);
      }

      if (opts.onlyLowConfidence && result.confidence >= 0.75 && result.status === "confirmed") {
        continue;
      }

      const parsed = classificationToParsedCity(result);
      const newCity = parsed.unresolved
        ? "Konum doğrulanıyor"
        : parsed.display || parsed.city || "Konum doğrulanıyor";

      const reason =
        job.city !== newCity
          ? `şehir değişti: ${job.city} → ${newCity}`
          : "aynı şehir, roller güncellendi";

      rows.push({
        id: job.id,
        oldCity: job.city,
        newCity,
        newDistrict: parsed.district,
        workLocations: result.workLocations.map((w) => w.display),
        serviceRoutes: result.serviceRoutes.map((w) => w.display),
        evidence: result.evidence.slice(0, 3),
        confidence: result.confidence,
        status: result.status,
        reason,
      });

      if (!dryRun) {
        if (job.city !== newCity) {
          await db.update(listingsTable).set({ city: newCity }).where(eq(listingsTable.id, job.id));
          updated++;
        }
        await persistClassification(job.id, result, false);
      }
    }
  }

  return { total: rows.length, updated: dryRun ? 0 : updated, rows };
}
