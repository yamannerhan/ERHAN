import { Router } from "express";
import {
  db,
  listingsTable,
  locationsTable,
  locationAliasesTable,
  unresolvedJobLocationsTable,
  locationClassificationLogsTable,
  jobLocationsTable,
  locationSyncMetaTable,
} from "@workspace/db";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { authMiddleware, requireAdmin, requireAdminOrModerator } from "../middlewares/auth";
import { normalizeAliasKey } from "../services/location/turkishTextNormalizer";
import { classifyListingLocationV2 } from "../services/location/classifyListingLocationV2";
import { runLocationsSync } from "../jobs/runLocationsSync";
import { reclassifyJobLocations } from "../jobs/reclassifyJobLocations";

const router = Router();

/** Belirsiz / doğrulanacak konum kuyruğu */
router.get("/admin/location-reviews", authMiddleware, requireAdminOrModerator, async (_req, res) => {
  const unresolved = await db
    .select()
    .from(unresolvedJobLocationsTable)
    .where(isNull(unresolvedJobLocationsTable.resolvedAt))
    .orderBy(desc(unresolvedJobLocationsTable.createdAt))
    .limit(100);

  const jobIds = unresolved.map((u) => u.jobId);
  const listings =
    jobIds.length === 0
      ? []
      : await db
          .select({
            id: listingsTable.id,
            title: listingsTable.title,
            description: listingsTable.description,
            city: listingsTable.city,
            rawText: listingsTable.rawText,
          })
          .from(listingsTable)
          .where(sql`${listingsTable.id} = ANY(${jobIds})`);

  const byId = new Map(listings.map((l) => [l.id, l]));
  const logs = jobIds.length
    ? await db
        .select()
        .from(locationClassificationLogsTable)
        .where(sql`${locationClassificationLogsTable.jobId} = ANY(${jobIds})`)
        .orderBy(desc(locationClassificationLogsTable.createdAt))
        .limit(200)
    : [];

  const latestLog = new Map<number, (typeof logs)[0]>();
  for (const log of logs) {
    if (log.jobId && !latestLog.has(log.jobId)) latestLog.set(log.jobId, log);
  }

  res.json({
    items: unresolved.map((u) => {
      const listing = byId.get(u.jobId);
      const log = latestLog.get(u.jobId);
      return {
        unresolvedId: u.id,
        jobId: u.jobId,
        title: listing?.title ?? "",
        description: listing?.description ?? listing?.rawText ?? "",
        oldCity: listing?.city ?? "",
        reason: u.reason,
        candidates: u.candidateLocations,
        detectedText: u.detectedText,
        suggested: log?.selectedLocations ?? [],
        rejected: log?.rejectedLocations ?? [],
        confidence: log?.confidence ?? null,
        status: log?.status ?? u.reason,
        method: log?.aiUsed ? "ai" : "rules",
      };
    }),
  });
});

router.post("/admin/location-reviews/:jobId/confirm", authMiddleware, requireAdminOrModerator, async (req, res) => {
  const jobId = Number(req.params.jobId);
  const { locationId, city, leaveUnresolved, alias, aliasLocationId } = req.body as {
    locationId?: number;
    city?: string;
    leaveUnresolved?: boolean;
    alias?: string;
    aliasLocationId?: number;
  };

  if (leaveUnresolved) {
    await db.update(listingsTable).set({ city: "Konum doğrulanıyor" }).where(eq(listingsTable.id, jobId));
    await db
      .update(unresolvedJobLocationsTable)
      .set({ resolvedAt: new Date(), reason: "admin_left_unresolved" })
      .where(and(eq(unresolvedJobLocationsTable.jobId, jobId), isNull(unresolvedJobLocationsTable.resolvedAt)));
    await db.insert(locationSyncMetaTable).values({
      key: `audit:location:${jobId}:${Date.now()}`,
      value: JSON.stringify({ action: "leave_unresolved", admin: (req as { user?: { id?: number } }).user?.id }),
    });
    res.json({ ok: true });
    return;
  }

  let display = city;
  if (locationId) {
    const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId)).limit(1);
    if (loc) {
      const [prov] = loc.provinceId
        ? await db.select().from(locationsTable).where(eq(locationsTable.id, loc.provinceId)).limit(1)
        : [];
      const [dist] = loc.districtId
        ? await db.select().from(locationsTable).where(eq(locationsTable.id, loc.districtId)).limit(1)
        : [];
      display = [prov?.name, dist?.name, loc.name].filter(Boolean).join(" / ");
      await db.delete(jobLocationsTable).where(eq(jobLocationsTable.jobId, jobId));
      await db.insert(jobLocationsTable).values({
        jobId,
        locationId: loc.id,
        provinceId: loc.provinceId,
        districtId: loc.districtId,
        locationRole: "work_location",
        evidence: "admin_confirm",
        confidence: 1,
        method: "admin",
        isPrimary: true,
      });
    }
  }

  if (alias && aliasLocationId) {
    await db.insert(locationAliasesTable).values({
      locationId: aliasLocationId,
      alias,
      normalizedAlias: normalizeAliasKey(alias),
      aliasType: "admin",
      priority: 100,
      isAmbiguous: false,
      isActive: true,
    });
  }

  if (display) {
    await db.update(listingsTable).set({ city: display }).where(eq(listingsTable.id, jobId));
  }

  await db
    .update(unresolvedJobLocationsTable)
    .set({ resolvedAt: new Date(), reason: "admin_confirmed" })
    .where(and(eq(unresolvedJobLocationsTable.jobId, jobId), isNull(unresolvedJobLocationsTable.resolvedAt)));

  await db.insert(locationSyncMetaTable).values({
    key: `audit:location:${jobId}:${Date.now()}`,
    value: JSON.stringify({
      action: "confirm",
      city: display,
      locationId,
      alias,
      admin: (req as { user?: { id?: number } }).user?.id,
    }),
  });

  res.json({ ok: true, city: display });
});

router.post("/admin/location-aliases", authMiddleware, requireAdmin, async (req, res) => {
  const { alias, locationId, isAmbiguous } = req.body as {
    alias: string;
    locationId: number;
    isAmbiguous?: boolean;
  };
  if (!alias || !locationId) {
    res.status(400).json({ error: "alias and locationId required" });
    return;
  }
  const [row] = await db
    .insert(locationAliasesTable)
    .values({
      locationId,
      alias,
      normalizedAlias: normalizeAliasKey(alias),
      aliasType: "admin",
      priority: 100,
      isAmbiguous: !!isAmbiguous,
      isActive: true,
    })
    .returning();
  res.json(row);
});

router.patch("/admin/location-aliases/:id", authMiddleware, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { isActive, isAmbiguous, locationId } = req.body as {
    isActive?: boolean;
    isAmbiguous?: boolean;
    locationId?: number;
  };
  const [row] = await db
    .update(locationAliasesTable)
    .set({
      ...(typeof isActive === "boolean" ? { isActive } : {}),
      ...(typeof isAmbiguous === "boolean" ? { isAmbiguous } : {}),
      ...(locationId ? { locationId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(locationAliasesTable.id, id))
    .returning();
  res.json(row);
});

router.post("/admin/locations/sync", authMiddleware, requireAdmin, async (req, res) => {
  const force = !!(req.body as { force?: boolean })?.force;
  const report = await runLocationsSync({ forceDownload: force });
  res.json(report);
});

router.post("/admin/locations/reclassify", authMiddleware, requireAdmin, async (req, res) => {
  const body = req.body as { dryRun?: boolean; batchSize?: number; onlyUnresolved?: boolean };
  const result = await reclassifyJobLocations({
    dryRun: body.dryRun !== false,
    batchSize: body.batchSize ?? 50,
    onlyUnresolved: !!body.onlyUnresolved,
    limit: 200,
  });
  res.json(result);
});

router.post("/admin/locations/preview", authMiddleware, requireAdminOrModerator, async (req, res) => {
  const { title, description, sourceName } = req.body as {
    title?: string;
    description?: string;
    sourceName?: string;
  };
  const { result } = await classifyListingLocationV2({
    title: title ?? "",
    description: description ?? "",
    sourceName,
  });
  res.json(result);
});

router.get("/admin/locations/search", authMiddleware, requireAdminOrModerator, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json([]);
    return;
  }
  const n = normalizeAliasKey(q);
  const rows = await db
    .select()
    .from(locationsTable)
    .where(and(eq(locationsTable.isActive, true), sql`${locationsTable.normalizedName} LIKE ${"%" + n + "%"}`))
    .limit(30);
  res.json(rows);
});

export default router;
