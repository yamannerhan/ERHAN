import { Router } from "express";
import {
  db,
  usersTable,
  publisherVerificationHistoryTable,
  companyProfilesTable,
  listingMergeQueueTable,
  listingsTable,
} from "@workspace/db";
import { and, desc, eq, sql, or, ilike } from "drizzle-orm";
import { authMiddleware, requireAdmin, requireAdminOrModerator } from "../middlewares/auth";
import { writeAuditLog } from "../lib/moderation/audit";
import { isUnverifiableAccount } from "../lib/listing-source";
import { ensurePublisherVerifySchema, ensureListingSourceSchema } from "../lib/listing-source-schema";
import { ensureMergeQueueReviewed } from "../lib/listing-merge";

const router = Router();

function safeId(raw: unknown): number | null {
  const n = parseInt(String(Array.isArray(raw) ? raw[0] : raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function writeVerifyHistory(opts: {
  userId: number;
  status: string;
  verificationType?: string | null;
  note?: string | null;
  verifiedBy?: number | null;
}) {
  await db.insert(publisherVerificationHistoryTable).values({
    userId: opts.userId,
    status: opts.status,
    verificationType: opts.verificationType ?? null,
    note: opts.note ?? null,
    verifiedBy: opts.verifiedBy ?? null,
  });
}

/** Admin onay — bot/system reddedilir */
router.patch("/admin/users/:id/verify-publisher", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  await ensurePublisherVerifySchema();
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const { verificationType, note, syncCompanyProfile } = req.body as {
    verificationType?: string;
    note?: string;
    syncCompanyProfile?: boolean;
  };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }
  if (isUnverifiableAccount(user)) {
    res.status(400).json({ error: "Bot veya sistem hesapları doğrulanamaz" }); return;
  }

  const vType = verificationType || "individual";
  const now = new Date();
  const prev = {
    isVerifiedPublisher: user.isVerifiedPublisher,
    verificationStatus: user.verificationStatus,
    verificationType: user.verificationType,
  };

  await db.update(usersTable).set({
    isVerifiedPublisher: true,
    verifiedAt: now,
    verifiedBy: req.user!.id,
    verificationType: vType,
    verificationNote: note ?? null,
    verificationStatus: "verified",
    updatedAt: now,
  }).where(eq(usersTable.id, id));

  if (syncCompanyProfile !== false && (vType === "company" || vType === "authorized_representative")) {
    try {
      await db.update(companyProfilesTable)
        .set({ isVerified: true, updatedAt: now })
        .where(eq(companyProfilesTable.userId, id));
    } catch { /* ignore */ }
  }

  await writeVerifyHistory({
    userId: id,
    status: "verified",
    verificationType: vType,
    note: note ?? null,
    verifiedBy: req.user!.id,
  });

  await writeAuditLog({
    req,
    action: "publisher.verify",
    targetType: "user",
    targetId: id,
    previousData: prev,
    newData: { isVerifiedPublisher: true, verificationStatus: "verified", verificationType: vType },
    reason: note ?? null,
  });

  res.json({ success: true, isVerifiedPublisher: true, verificationStatus: "verified" });
});

router.patch("/admin/users/:id/remove-verification", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  await ensurePublisherVerifySchema();
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { note, stripActiveListingBadges } = req.body as { note?: string; stripActiveListingBadges?: boolean };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }

  const now = new Date();
  await db.update(usersTable).set({
    isVerifiedPublisher: false,
    verificationStatus: "unverified",
    verificationNote: note ?? user.verificationNote,
    updatedAt: now,
  }).where(eq(usersTable.id, id));

  if (stripActiveListingBadges) {
    await ensureListingSourceSchema();
    await db.update(listingsTable)
      .set({ verifiedPublisher: false })
      .where(and(eq(listingsTable.authorId, id), eq(listingsTable.isActive, true)));
  }

  try {
    await db.update(companyProfilesTable)
      .set({ isVerified: false, updatedAt: now })
      .where(eq(companyProfilesTable.userId, id));
  } catch { /* ignore */ }

  await writeVerifyHistory({
    userId: id,
    status: "unverified",
    note: note ?? null,
    verifiedBy: req.user!.id,
  });
  await writeAuditLog({
    req,
    action: "publisher.remove_verification",
    targetType: "user",
    targetId: id,
    reason: note ?? null,
  });

  res.json({ success: true, isVerifiedPublisher: false });
});

router.patch("/admin/users/:id/suspend-verification", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  await ensurePublisherVerifySchema();
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { note } = req.body as { note?: string };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }

  await db.update(usersTable).set({
    isVerifiedPublisher: false,
    verificationStatus: "suspended",
    verificationNote: note ?? user.verificationNote,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, id));

  await writeVerifyHistory({
    userId: id,
    status: "suspended",
    note: note ?? null,
    verifiedBy: req.user!.id,
  });
  await writeAuditLog({
    req,
    action: "publisher.suspend_verification",
    targetType: "user",
    targetId: id,
    reason: note ?? null,
  });

  res.json({ success: true, verificationStatus: "suspended" });
});

/** Moderatör: bekleyen talebe not (onay yok) */
router.patch("/admin/users/:id/verification-note", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  await ensurePublisherVerifySchema();
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { note, markPending } = req.body as { note?: string; markPending?: boolean };
  if (!note?.trim()) { res.status(400).json({ error: "Not gerekli" }); return; }

  const updates: Partial<typeof usersTable.$inferInsert> = {
    verificationNote: note.trim(),
    updatedAt: new Date(),
  };
  if (markPending) updates.verificationStatus = "pending";

  await db.update(usersTable).set(updates).where(eq(usersTable.id, id));
  await writeVerifyHistory({
    userId: id,
    status: markPending ? "pending" : "note",
    note: note.trim(),
    verifiedBy: req.user!.id,
  });
  res.json({ success: true });
});

router.get("/admin/verified-publishers", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  await ensurePublisherVerifySchema();
  const status = (req.query["status"] as string | undefined) || undefined;
  const search = req.query["search"] as string | undefined;
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status === "verified") {
    conditions.push(eq(usersTable.isVerifiedPublisher, true));
  } else if (status) {
    conditions.push(eq(usersTable.verificationStatus, status));
  } else {
    conditions.push(or(
      eq(usersTable.isVerifiedPublisher, true),
      eq(usersTable.verificationStatus, "pending"),
      eq(usersTable.verificationStatus, "suspended"),
      eq(usersTable.verificationStatus, "rejected"),
    )!);
  }
  if (search) {
    conditions.push(or(
      ilike(usersTable.username, `%${search}%`),
      ilike(usersTable.email, `%${search}%`),
      ilike(usersTable.displayName, `%${search}%`),
    )!);
  }

  const where = and(...conditions);
  const [rows, countResult] = await Promise.all([
    db.select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
      accountType: usersTable.accountType,
      isSystemAccount: usersTable.isSystemAccount,
      isVerifiedPublisher: usersTable.isVerifiedPublisher,
      verifiedAt: usersTable.verifiedAt,
      verifiedBy: usersTable.verifiedBy,
      verificationType: usersTable.verificationType,
      verificationNote: usersTable.verificationNote,
      verificationStatus: usersTable.verificationStatus,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(where).orderBy(desc(usersTable.verifiedAt), desc(usersTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(where),
  ]);

  res.json({
    publishers: rows.map((u) => ({
      ...u,
      verifiedAt: u.verifiedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  });
});

router.get("/admin/verified-publishers/:id/history", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  await ensurePublisherVerifySchema();
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const rows = await db
    .select()
    .from(publisherVerificationHistoryTable)
    .where(eq(publisherVerificationHistoryTable.userId, id))
    .orderBy(desc(publisherVerificationHistoryTable.createdAt))
    .limit(50);
  res.json({
    history: rows.map((h) => ({
      id: h.id,
      status: h.status,
      verificationType: h.verificationType,
      note: h.note,
      verifiedBy: h.verifiedBy,
      createdAt: h.createdAt.toISOString(),
    })),
  });
});

router.get("/admin/listing-merge-queue", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  await ensureListingSourceSchema();
  const status = (req.query["status"] as string) || "pending";
  const rows = await db
    .select()
    .from(listingMergeQueueTable)
    .where(eq(listingMergeQueueTable.status, status))
    .orderBy(desc(listingMergeQueueTable.createdAt))
    .limit(50);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      primaryListingId: r.primaryListingId,
      candidateListingId: r.candidateListingId,
      score: r.score,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  });
});

router.patch("/admin/listing-merge-queue/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  await ensureListingSourceSchema();
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const { action } = req.body as { action?: "merged" | "rejected" };
  if (action !== "merged" && action !== "rejected") {
    res.status(400).json({ error: "action: merged | rejected" }); return;
  }
  const ok = await ensureMergeQueueReviewed(id, action, req.user!.id);
  if (!ok) { res.status(404).json({ error: "Kayıt bulunamadı veya işlenmiş" }); return; }
  await writeAuditLog({
    req,
    action: `listing_merge.${action}`,
    targetType: "listing_merge",
    targetId: id,
  });
  res.json({ success: true });
});

export default router;
