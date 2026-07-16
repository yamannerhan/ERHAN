import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  DISTANCE_OPTIONS,
  EMPLOYMENT_OPTIONS,
  SHIFT_OPTIONS,
  LICENSE_OPTIONS,
  PROJECT_OPTIONS,
  BENEFIT_OPTIONS,
  EXPERIENCE_OPTIONS,
  ROLE_OPTIONS,
} from "../lib/job-match/constants";
import { findMatchingJobs, getJobPreferences, saveJobPreferences } from "../lib/job-match/service";
import { listDistrictsForProvince, listProvinces } from "../lib/geo-centers";
import { ensureJobPreferencesSchema } from "../lib/job-match/ensure";

const router = Router();

router.get("/job-match/meta", async (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    provinces: listProvinces(),
    distances: DISTANCE_OPTIONS,
    employmentTypes: EMPLOYMENT_OPTIONS,
    shifts: SHIFT_OPTIONS,
    licenses: LICENSE_OPTIONS,
    projects: PROJECT_OPTIONS,
    benefits: BENEFIT_OPTIONS,
    experience: EXPERIENCE_OPTIONS,
    roles: ROLE_OPTIONS,
  });
});

router.get("/job-match/districts", async (req, res) => {
  const city = String(req.query["city"] ?? "").trim();
  if (!city) {
    res.json({ districts: [] });
    return;
  }
  res.json({ districts: listDistrictsForProvince(city) });
});

router.get("/job-match/prefs", authMiddleware, async (req, res) => {
  try {
    await ensureJobPreferencesSchema();
    const prefs = await getJobPreferences(req.user!.id);
    res.json({
      completed: !!prefs?.preferencesCompleted,
      prefs: prefs ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Tercihler alınamadı" });
  }
});

router.put("/job-match/prefs", authMiddleware, async (req, res) => {
  try {
    const result = await saveJobPreferences(req.user!.id, req.body ?? {});
    if (!result.ok) {
      res.status(400).json({ success: false, errors: result.errors });
      return;
    }
    res.json({ success: true, prefs: result.prefs, completed: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Tercihler kaydedilemedi" });
  }
});

router.get("/job-match/listings", authMiddleware, async (req, res) => {
  try {
    const page = Number(req.query["page"] ?? 1);
    const limit = Number(req.query["limit"] ?? 24);
    const result = await findMatchingJobs(req.user!.id, { page, limit });
    if (!result.completed) {
      res.json({
        completed: false,
        message: "Sana uygun ilanları bulabilmemiz için önce çalışma tercihlerini belirtmelisin.",
        listings: [],
        alternatives: [],
        total: 0,
      });
      return;
    }

    const mapRow = (row: (typeof result.listings)[0]) => ({
      id: row.listing.id,
      title: row.listing.title,
      company: row.listing.company,
      city: row.listing.city,
      salary: row.listing.salary,
      workType: row.listing.workType,
      description: row.listing.description,
      requirements: row.listing.requirements,
      status: row.listing.status,
      isFeatured: row.listing.isFeatured,
      companyLogoUrl: row.listing.companyLogoUrl,
      applyUrl: row.listing.applyUrl,
      createdAt: row.listing.createdAt,
      sourcePublishedAt: row.listing.sourcePublishedAt,
      sourceTag: row.listing.sourceTag,
      matchScore: row.match.score,
      matchLabel: row.match.label,
      matchLabelText: row.match.labelText,
      matchReasons: row.match.reasons,
      matchMismatches: row.match.mismatches,
      isAlternative: row.isAlternative,
    });

    res.json({
      completed: true,
      total: result.total,
      page: result.page,
      limit: result.limit,
      listings: result.listings.map(mapRow),
      alternatives: result.alternatives.map(mapRow),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Eşleşme alınamadı" });
  }
});

export default router;
