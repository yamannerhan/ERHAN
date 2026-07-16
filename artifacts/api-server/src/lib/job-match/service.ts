import { db, listingsTable, userJobPreferencesTable } from "@workspace/db";
import { and, desc, eq, or, sql, ne, isNull } from "drizzle-orm";
import { ensureJobPreferencesSchema } from "./ensure";
import {
  scoreListingMatch,
  validateJobPrefs,
  type JobMatchPrefsInput,
  type MatchResult,
} from "./scoring";
import { MATCH_THRESHOLD } from "./constants";

export type JobPrefsDto = JobMatchPrefsInput & {
  securityLicenseExpiry: string | null;
  drivingLicenseType: string | null;
  drivesActively: boolean;
  militaryStatus: string | null;
  educationLevel: string | null;
  experienceYears: string | null;
  preferencesCompleted: boolean;
  updatedAt?: string | null;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function rowToDto(row: typeof userJobPreferencesTable.$inferSelect): JobPrefsDto {
  return {
    preferredCities: asStringArray(row.preferredCities),
    preferredDistricts: asStringArray(row.preferredDistricts),
    nearbyDistrictsEnabled: !!row.nearbyDistrictsEnabled,
    maximumDistance: row.maximumDistance ?? null,
    securityLicenseTypes: asStringArray(row.securityLicenseTypes),
    securityLicenseExpiry: row.securityLicenseExpiry ?? null,
    employmentTypes: asStringArray(row.employmentTypes),
    shiftPreferences: asStringArray(row.shiftPreferences),
    projectTypes: asStringArray(row.projectTypes),
    minimumSalary: row.minimumSalary ?? null,
    benefits: asStringArray(row.benefits),
    experienceLevel: row.experienceLevel ?? null,
    preferredRoles: asStringArray(row.preferredRoles),
    drivingLicense: !!row.drivingLicense,
    drivingLicenseType: row.drivingLicenseType ?? null,
    drivesActively: !!row.drivesActively,
    srcCertificate: !!row.srcCertificate,
    militaryStatus: row.militaryStatus ?? null,
    height: row.height ?? null,
    weight: row.weight ?? null,
    educationLevel: row.educationLevel ?? null,
    experienceYears: row.experienceYears ?? null,
    preferencesCompleted: !!row.preferencesCompleted,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

export async function getJobPreferences(userId: number): Promise<JobPrefsDto | null> {
  await ensureJobPreferencesSchema();
  const [row] = await db.select().from(userJobPreferencesTable)
    .where(eq(userJobPreferencesTable.userId, userId))
    .limit(1);
  return row ? rowToDto(row) : null;
}

export async function saveJobPreferences(
  userId: number,
  body: Partial<JobPrefsDto>,
): Promise<{ ok: true; prefs: JobPrefsDto } | { ok: false; errors: string[] }> {
  await ensureJobPreferencesSchema();
  const errors = validateJobPrefs(body);
  if (errors.length) return { ok: false, errors };

  const values = {
    userId,
    preferredCities: asStringArray(body.preferredCities),
    preferredDistricts: asStringArray(body.preferredDistricts),
    nearbyDistrictsEnabled: body.nearbyDistrictsEnabled !== false,
    maximumDistance: body.maximumDistance ?? null,
    securityLicenseTypes: asStringArray(body.securityLicenseTypes),
    securityLicenseExpiry: body.securityLicenseExpiry?.trim() || null,
    employmentTypes: asStringArray(body.employmentTypes),
    shiftPreferences: asStringArray(body.shiftPreferences),
    projectTypes: asStringArray(body.projectTypes),
    minimumSalary: body.minimumSalary ?? null,
    benefits: asStringArray(body.benefits),
    experienceLevel: body.experienceLevel ?? null,
    preferredRoles: asStringArray(body.preferredRoles),
    drivingLicense: !!body.drivingLicense,
    drivingLicenseType: body.drivingLicenseType?.trim() || null,
    drivesActively: !!body.drivesActively,
    srcCertificate: !!body.srcCertificate,
    militaryStatus: body.militaryStatus ?? null,
    height: body.height ?? null,
    weight: body.weight ?? null,
    educationLevel: body.educationLevel ?? null,
    experienceYears: body.experienceYears ?? null,
    preferencesCompleted: true,
    updatedAt: new Date(),
  };

  const existing = await getJobPreferences(userId);
  if (existing) {
    await db.update(userJobPreferencesTable)
      .set(values)
      .where(eq(userJobPreferencesTable.userId, userId));
  } else {
    await db.insert(userJobPreferencesTable).values(values);
  }
  const prefs = await getJobPreferences(userId);
  return { ok: true, prefs: prefs! };
}

export type MatchedListing = {
  listing: typeof listingsTable.$inferSelect;
  match: MatchResult;
  isAlternative: boolean;
};

export async function findMatchingJobs(
  userId: number,
  opts?: { page?: number; limit?: number },
): Promise<{
  completed: boolean;
  total: number;
  page: number;
  limit: number;
  listings: MatchedListing[];
  alternatives: MatchedListing[];
}> {
  await ensureJobPreferencesSchema();
  const prefs = await getJobPreferences(userId);
  const page = Math.max(1, opts?.page ?? 1);
  const limit = Math.min(48, Math.max(1, opts?.limit ?? 24));

  if (!prefs?.preferencesCompleted) {
    return { completed: false, total: 0, page, limit, listings: [], alternatives: [] };
  }

  const cities = prefs.preferredCities;
  const cityConds = cities.length
    ? cities.map((c) => sql`(${listingsTable.city} ILIKE ${`%${c}%`} OR COALESCE(${listingsTable.description}, '') ILIKE ${`%${c}%`})`)
    : [];

  const activeCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const baseWhere = and(
    eq(listingsTable.status, "active"),
    eq(listingsTable.isActive, true),
    or(isNull(listingsTable.sourceTag), ne(listingsTable.sourceTag, "demo"))!,
    sql`COALESCE(${listingsTable.firstSeenAt}, ${listingsTable.createdAt}) >= ${activeCutoff}`,
  );

  // Önce seçilen illere yakın adaylar (performans)
  const candidates = await db.select().from(listingsTable)
    .where(cityConds.length ? and(baseWhere, or(...cityConds)!) : baseWhere)
    .orderBy(desc(sql`COALESCE(${listingsTable.sourcePublishedAt}, ${listingsTable.firstSeenAt}, ${listingsTable.createdAt})`))
    .limit(800);

  const prefsInput: JobMatchPrefsInput = prefs;
  const primary: MatchedListing[] = [];
  const softPool: MatchedListing[] = [];

  for (const listing of candidates) {
    const match = scoreListingMatch(prefsInput, {
      id: listing.id,
      title: listing.title,
      city: listing.city,
      company: listing.company,
      salary: listing.salary,
      salaryMin: listing.salaryMin,
      workType: listing.workType,
      description: listing.description,
      requirements: listing.requirements,
    });
    if (!match.hardFail && match.score >= MATCH_THRESHOLD) {
      primary.push({ listing, match, isAlternative: false });
    } else {
      const soft = scoreListingMatch(prefsInput, {
        id: listing.id,
        title: listing.title,
        city: listing.city,
        company: listing.company,
        salary: listing.salary,
        salaryMin: listing.salaryMin,
        workType: listing.workType,
        description: listing.description,
        requirements: listing.requirements,
      }, { soft: true });
      if (soft.score >= 40) {
        softPool.push({ listing, match: soft, isAlternative: true });
      }
    }
  }

  primary.sort((a, b) => b.match.score - a.match.score || b.listing.id - a.listing.id);
  softPool.sort((a, b) => b.match.score - a.match.score);

  // Yeterli birincil yoksa komşu / alternatif doldur
  let alternatives: MatchedListing[] = [];
  if (primary.length < 8) {
    const seen = new Set(primary.map((p) => p.listing.id));
    alternatives = softPool.filter((s) => !seen.has(s.listing.id)).slice(0, 24);
  }

  const total = primary.length;
  const offset = (page - 1) * limit;
  return {
    completed: true,
    total,
    page,
    limit,
    listings: primary.slice(offset, offset + limit),
    alternatives: page === 1 ? alternatives : [],
  };
}
