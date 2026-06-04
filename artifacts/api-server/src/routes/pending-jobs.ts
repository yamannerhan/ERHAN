import { Router } from "express";
import { db, pendingJobsTable, importedPostsTable, listingsTable, sourcesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authMiddleware, requireAdmin, requireAdminOrModerator } from "../middlewares/auth";
import { extractGender } from "../lib/job-parsing";

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
  // Cinsiyet her zaman gösterilsin; ham metinden çıkar, yoksa "Belirtilmemiş"
  const gender = extractGender(job.rawText) ?? "Belirtilmemiş";
  const [listing] = await db.insert(listingsTable).values({
    title: job.title ?? "Güvenlik Personeli Aranıyor",
    company: job.company ?? "Belirtilmemiş",
    city: job.city ?? "Türkiye",
    salary: job.salary ?? undefined,
    workType: "Tam Zamanlı",
    description: job.description ?? job.rawText,
    requirements: `Cinsiyet: ${gender}\nKaynak: ${platformTag} | ${job.sourceUrl ?? ""}`,
    status: "active",
    sourceTag: job.platform,
    // Başvuru doğrudan iletişim numarasına gitsin (Telegram'a değil); numara yoksa link/kaynağa düş
    applyUrl: job.phone ? `tel:${job.phone}` : (job.applicationUrl ?? job.sourceUrl ?? undefined),
    // Gerçek gönderim tarihini koru (onay anı değil) — sıralama ve "X gün önce" doğru olsun
    ...(job.createdAt ? { createdAt: job.createdAt } : {}),
  }).returning();

  // Update pending job status
  await db.update(pendingJobsTable)
    .set({ status: "published" })
    .where(eq(pendingJobsTable.id, id));

  // Update imported post status if linked
  if (job.importedPostId) {
    await db.update(importedPostsTable)
      .set({ status: "approved" })
      .where(eq(importedPostsTable.id, job.importedPostId));
  }

  res.json({ success: true, listingId: listing?.id });
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
