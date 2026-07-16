import { Router } from "express";
import { db, pendingJobsTable, importedPostsTable, listingsTable, sourcesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authMiddleware, requireAdmin, requireAdminOrModerator } from "../middlewares/auth";
import { buildListingRequirements, extractBenefits, extractGender, extractLocation, extractPhoneNumbers, extractProjectType, extractWorkType, formatTelApplyUrl } from "../lib/job-parsing";
import { announceNewListing } from "../lib/listing-announcements";

const router = Router();

function safeId(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── List pending jobs ─────────────────────────────────────────────
router.get("/admin/pending-jobs", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const status = (req.query["status"] as string) ?? "pending";
  const jobs = await db.select({
    job: pendingJobsTable,
    sourceName: sourcesTable.name,
  }).from(pendingJobsTable)
    .leftJoin(sourcesTable, eq(pendingJobsTable.sourceId, sourcesTable.id))
    .where(eq(pendingJobsTable.status, status))
    .orderBy(desc(pendingJobsTable.createdAt))
    .limit(50);

  res.json(jobs.map(({ job, sourceName }) => ({
    id: job.id,
    sourceId: job.sourceId,
    sourceName: sourceName ?? "Bilinmiyor",
    platform: job.platform,
    title: job.title,
    company: job.company,
    city: job.city,
    salary: job.salary,
    phone: job.phone,
    description: job.description,
    applicationUrl: job.applicationUrl,
    sourceUrl: job.sourceUrl,
    status: job.status,
    rawText: job.rawText,
    createdAt: job.createdAt.toISOString(),
  })));
});

// ── Get counts by status ──────────────────────────────────────────
router.get("/admin/pending-jobs/counts", authMiddleware, requireAdminOrModerator, async (_req, res): Promise<void> => {
  const rows = await db.select({ status: pendingJobsTable.status }).from(pendingJobsTable);
  const counts: Record<string, number> = {};
  for (const r of rows) { counts[r.status] = (counts[r.status] ?? 0) + 1; }
  res.json(counts);
});

// ── Edit pending job ──────────────────────────────────────────────
router.patch("/admin/pending-jobs/:id", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const { title, company, city, salary, phone, description, applicationUrl } = req.body as {
    title?: string; company?: string; city?: string; salary?: string;
    phone?: string; description?: string; applicationUrl?: string;
  };

  const updates: Partial<typeof pendingJobsTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (company !== undefined) updates.company = company;
  if (city !== undefined) updates.city = city;
  if (salary !== undefined) updates.salary = salary;
  if (phone !== undefined) updates.phone = phone;
  if (description !== undefined) updates.description = description;
  if (applicationUrl !== undefined) updates.applicationUrl = applicationUrl;

  await db.update(pendingJobsTable).set(updates).where(eq(pendingJobsTable.id, id));
  res.json({ success: true });
});

// ── Approve (publish) ─────────────────────────────────────────────
router.post("/admin/pending-jobs/:id/approve", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [job] = await db.select().from(pendingJobsTable).where(eq(pendingJobsTable.id, id));
  if (!job) { res.status(404).json({ error: "Bulunamadı" }); return; }
  if (job.status !== "pending") { res.status(400).json({ error: "Bu ilan zaten işlenmiş" }); return; }

  // Create listing
  const platformTag = job.platform === "telegram" ? "Telegram" : "Facebook";
  const location = extractLocation(job.rawText);
  const gender = extractGender(job.rawText);
  const benefits = extractBenefits(job.rawText);
  const projectType = extractProjectType(job.rawText);
  const title = job.title ?? "Güvenlik Personeli Aranıyor";
  const city = location.display ?? location.city ?? job.city ?? "Türkiye";
  const { assignCoordsFromCity } = await import("../lib/nearby-listings");
  const coords = assignCoordsFromCity(city);
  let companyName = (job.company ?? "").trim() || "Belirtilmemiş";
  let companyLogoUrl: string | null = null;
  try {
    const { matchKnownCompany, matchKnownCompanyInBlob } = await import("../lib/known-companies");
    const brand =
      (await matchKnownCompany(companyName)) ||
      matchKnownCompanyInBlob(`${companyName} ${title} ${job.description ?? job.rawText ?? ""}`);
    if (brand) {
      companyName = companyName === "Belirtilmemiş" ? brand.name : companyName;
      companyLogoUrl = brand.logoUrl;
    }
  } catch { /* ignore */ }
  const listing = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(pendingJobsTable)
      .set({ status: "publishing" })
      .where(and(eq(pendingJobsTable.id, id), eq(pendingJobsTable.status, "pending")))
      .returning({ id: pendingJobsTable.id });
    if (!claimed) throw new Error("Bu ilan başka bir işlem tarafından işleniyor");

    const [created] = await tx.insert(listingsTable).values({
      title,
      company: companyName,
      city,
      salary: job.salary ?? undefined,
      workType: extractWorkType(job.rawText),
      description: job.description ?? job.rawText,
      requirements: buildListingRequirements({ gender, location, benefits, projectType, source: `${platformTag} | ${job.sourceUrl ?? ""}` }),
      status: "active",
      sourceTag: job.platform,
      sourceType: "bot_imported",
      sourceName: job.platform === "telegram" ? "Telegram"
        : job.platform === "whatsapp" ? "WhatsApp"
        : job.platform === "eleman" ? "Eleman.net"
        : (job.platform || "Kaynak"),
      sourcePublishedAt: job.createdAt ?? new Date(),
      verifiedPublisher: false,
      lastCheckedAt: new Date(),
      sourceUrl: job.sourceUrl ?? null,
      companyLogoUrl,
      applyUrl: formatTelApplyUrl(extractPhoneNumbers(job.phone || job.rawText || "").slice(0, 1)),
      autoDeleteOnExpiry: true,
      expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      publishedAt: job.createdAt ?? new Date(),
      lastSeenAt: new Date(),
      firstSeenAt: new Date(),
      ...(coords ?? {}),
    }).returning();
    if (!created) throw new Error("İlan oluşturulamadı");

    await tx.update(pendingJobsTable)
      .set({ status: "published" })
      .where(eq(pendingJobsTable.id, id));
    if (job.importedPostId) {
      await tx.update(importedPostsTable)
        .set({ status: "approved" })
        .where(eq(importedPostsTable.id, job.importedPostId));
    }
    return created;
  });
  if (listing) {
    // Manuel onay: sitede normal ilan gibi duyur (kaynak adı yok)
    await announceNewListing(listing, {});
  }

  res.json({ success: true, listingId: listing.id });
});

// ── Reject ────────────────────────────────────────────────────────
router.post("/admin/pending-jobs/:id/reject", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  await db.update(pendingJobsTable)
    .set({ status: "rejected" })
    .where(eq(pendingJobsTable.id, id));

  const [job] = await db.select({ importedPostId: pendingJobsTable.importedPostId })
    .from(pendingJobsTable).where(eq(pendingJobsTable.id, id));

  if (job?.importedPostId) {
    await db.update(importedPostsTable)
      .set({ status: "rejected" })
      .where(eq(importedPostsTable.id, job.importedPostId));
  }

  res.json({ success: true });
});

// ── Delete ────────────────────────────────────────────────────────
router.delete("/admin/pending-jobs/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(pendingJobsTable).where(eq(pendingJobsTable.id, id));
  res.json({ success: true });
});

export default router;
