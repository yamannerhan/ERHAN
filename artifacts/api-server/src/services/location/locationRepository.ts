import { db } from "@workspace/db";
import {
  locationsTable,
  locationAliasesTable,
  jobLocationsTable,
  locationClassificationLogsTable,
  unresolvedJobLocationsTable,
  locationSyncMetaTable,
} from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { normalizeAliasKey, compactKey } from "./turkishTextNormalizer";
import type { ClassifyJobLocationsResult, ClassifiedLocation } from "./jobLocationClassifier";
import {
  buildBootstrapCatalog,
  type LocationCatalog,
  type CatalogLocation,
  type CatalogAlias,
} from "./locationCatalog";
import { CRITICAL_ALIAS_SEEDS, TURKEY_PROVINCES_81 } from "./criticalAliasSeeds";

export async function ensureExtensions(): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS unaccent`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
  } catch {
    // optional
  }
}

export async function ensureTrigramIndexes(): Promise<void> {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS locations_normalized_name_trgm
    ON locations USING gin (normalized_name gin_trgm_ops)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS location_aliases_normalized_trgm
    ON location_aliases USING gin (normalized_alias gin_trgm_ops)
  `);
}

export async function countActiveProvinces(): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(locationsTable)
    .where(and(eq(locationsTable.locationType, "province"), eq(locationsTable.isActive, true)));
  return Number(rows[0]?.c ?? 0);
}

export async function getSyncMeta(key: string): Promise<string | null> {
  const [row] = await db.select().from(locationSyncMetaTable).where(eq(locationSyncMetaTable.key, key)).limit(1);
  return row?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await db
    .insert(locationSyncMetaTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: locationSyncMetaTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function seedBootstrapLocations(): Promise<{ provinces: number; aliases: number }> {
  await ensureExtensions();
  const catalog = buildBootstrapCatalog();
  let aliasInserts = 0;
  const idMap = new Map<number, number>();

  for (const loc of catalog.locations) {
    const osmId = `seed:${loc.locationType}:${loc.normalizedName}:${normalizeAliasKey(loc.provinceName ?? "")}`;
    const [existing] = await db
      .select({ id: locationsTable.id })
      .from(locationsTable)
      .where(and(eq(locationsTable.osmType, "seed"), eq(locationsTable.osmId, osmId)))
      .limit(1);

    let dbId: number;
    if (existing) {
      dbId = existing.id;
      await db
        .update(locationsTable)
        .set({ name: loc.name, isActive: true, source: loc.source, updatedAt: new Date() })
        .where(eq(locationsTable.id, dbId));
    } else {
      const [ins] = await db
        .insert(locationsTable)
        .values({
          osmType: "seed",
          osmId,
          locationType: loc.locationType,
          name: loc.name,
          normalizedName: loc.normalizedName,
          adminLevel: loc.adminLevel,
          isActive: true,
          source: loc.source,
          sourceUpdatedAt: new Date(),
        })
        .returning({ id: locationsTable.id });
      dbId = ins!.id;
    }
    idMap.set(loc.id, dbId);
  }

  for (const loc of catalog.locations) {
    const dbId = idMap.get(loc.id)!;
    await db
      .update(locationsTable)
      .set({
        provinceId: loc.provinceId ? idMap.get(loc.provinceId) ?? null : loc.locationType === "province" ? dbId : null,
        districtId: loc.districtId ? idMap.get(loc.districtId) ?? null : loc.locationType === "district" ? dbId : null,
        parentId: loc.parentId ? idMap.get(loc.parentId) ?? null : null,
      })
      .where(eq(locationsTable.id, dbId));
  }

  for (const a of catalog.aliases) {
    const locationId = idMap.get(a.locationId);
    if (!locationId) continue;
    const [ex] = await db
      .select({ id: locationAliasesTable.id })
      .from(locationAliasesTable)
      .where(
        and(
          eq(locationAliasesTable.locationId, locationId),
          eq(locationAliasesTable.normalizedAlias, a.normalizedAlias),
        ),
      )
      .limit(1);
    if (ex) {
      await db
        .update(locationAliasesTable)
        .set({ isAmbiguous: a.isAmbiguous, isActive: true, priority: a.priority, aliasType: a.aliasType })
        .where(eq(locationAliasesTable.id, ex.id));
    } else {
      await db.insert(locationAliasesTable).values({
        locationId,
        alias: a.alias,
        normalizedAlias: a.normalizedAlias,
        aliasType: a.aliasType,
        priority: a.priority,
        isAmbiguous: a.isAmbiguous,
        isActive: true,
      });
      aliasInserts++;
    }
  }

  return { provinces: await countActiveProvinces(), aliases: aliasInserts };
}

export async function loadCatalogFromDb(): Promise<LocationCatalog | null> {
  const provinces = await countActiveProvinces();
  if (provinces < 1) return null;

  const locs = await db.select().from(locationsTable).where(eq(locationsTable.isActive, true));
  const aliases = await db.select().from(locationAliasesTable).where(eq(locationAliasesTable.isActive, true));

  const provinceName = new Map<number, string>();
  const districtName = new Map<number, string>();
  for (const l of locs) {
    if (l.locationType === "province") provinceName.set(l.id, l.name);
    if (l.locationType === "district") districtName.set(l.id, l.name);
  }

  const catalog: LocationCatalog = {
    locations: [],
    aliases: [],
    byId: new Map(),
    aliasesByNorm: new Map(),
  };

  for (const l of locs) {
    const cl: CatalogLocation = {
      id: l.id,
      locationType: l.locationType,
      name: l.name,
      normalizedName: l.normalizedName,
      provinceName: l.provinceId
        ? provinceName.get(l.provinceId) ?? null
        : l.locationType === "province"
          ? l.name
          : null,
      districtName: l.districtId
        ? districtName.get(l.districtId) ?? null
        : l.locationType === "district"
          ? l.name
          : null,
      provinceId: l.provinceId,
      districtId: l.districtId,
      parentId: l.parentId,
      adminLevel: l.adminLevel,
      source: l.source,
    };
    catalog.locations.push(cl);
    catalog.byId.set(cl.id, cl);
  }

  for (const a of aliases) {
    const ca: CatalogAlias = {
      id: a.id,
      locationId: a.locationId,
      alias: a.alias,
      normalizedAlias: a.normalizedAlias,
      compactAlias: compactKey(a.alias),
      aliasType: a.aliasType,
      priority: a.priority,
      isAmbiguous: a.isAmbiguous,
    };
    catalog.aliases.push(ca);
    const list = catalog.aliasesByNorm.get(ca.normalizedAlias) ?? [];
    list.push(ca);
    catalog.aliasesByNorm.set(ca.normalizedAlias, list);
  }

  return catalog.locations.length ? catalog : null;
}

export async function persistClassification(
  jobId: number,
  result: ClassifyJobLocationsResult,
  shadow = false,
): Promise<void> {
  await db.insert(locationClassificationLogsTable).values({
    jobId,
    textHash: result.textHash,
    candidates: result.candidates.map((c) => ({
      id: c.location.id,
      name: c.location.name,
      role: c.role,
      score: c.score,
      method: c.method,
    })),
    selectedLocations: result.workLocations,
    rejectedLocations: result.rejected.map((c) => ({ id: c.location.id, role: c.role })),
    confidence: result.confidence,
    status: shadow ? `shadow:${result.status}` : result.status,
    aiUsed: result.aiUsed,
    processingTimeMs: result.processingTimeMs,
  });

  if (shadow) return;

  await db.delete(jobLocationsTable).where(eq(jobLocationsTable.jobId, jobId));

  const all: { loc: ClassifiedLocation; role: string; primary: boolean }[] = [
    ...result.workLocations.map((loc, i) => ({ loc, role: "work_location", primary: i === 0 })),
    ...result.serviceRoutes.map((loc) => ({ loc, role: "service_route", primary: false })),
    ...result.residenceRequirements.map((loc) => ({ loc, role: "residence_requirement", primary: false })),
    ...result.interviewLocations.map((loc) => ({ loc, role: "interview_location", primary: false })),
    ...result.companyHeadquarters.map((loc) => ({ loc, role: "company_headquarters", primary: false })),
  ];

  for (const item of all) {
    await db.insert(jobLocationsTable).values({
      jobId,
      locationId: item.loc.locationId,
      locationRole: item.role,
      evidence: item.loc.evidence,
      confidence: item.loc.confidence,
      method: item.loc.method,
      isPrimary: item.primary,
    });
  }

  if (result.status === "unresolved" || result.status === "ambiguous") {
    await db.insert(unresolvedJobLocationsTable).values({
      jobId,
      detectedText: result.evidence.join(" | ").slice(0, 500),
      candidateLocations: result.candidates.slice(0, 20).map((c) => ({
        id: c.location.id,
        name: c.location.name,
        score: c.score,
        role: c.role,
      })),
      reason: result.status,
    });
  }
}

export async function findCachedClassification(textHash: string) {
  const [row] = await db
    .select()
    .from(locationClassificationLogsTable)
    .where(
      and(
        eq(locationClassificationLogsTable.textHash, textHash),
        sql`${locationClassificationLogsTable.status} NOT LIKE 'shadow:%'`,
      ),
    )
    .orderBy(desc(locationClassificationLogsTable.createdAt))
    .limit(1);
  return row ?? null;
}

export { TURKEY_PROVINCES_81, CRITICAL_ALIAS_SEEDS };
