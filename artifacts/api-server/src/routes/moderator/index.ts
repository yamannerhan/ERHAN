import { Router } from "express";
import {
  db,
  listingsTable,
  usersTable,
  companyProfilesTable,
  chatMessagesTable,
  notificationsTable,
  ipBansTable,
  supportTicketsTable,
  supportMessagesTable,
} from "@workspace/db";
import {
  moderationReportsTable,
  moderationActionsTable,
  moderationNotesTable,
  moderationAssignmentsTable,
  auditLogsTable,
  userWarningsTable,
  userSuspensionsTable,
  blacklistEntriesTable,
  filteredWordsTable,
  deviceSessionsTable,
  moderatorSupportTicketsTable,
  announcementTargetsTable,
  announcementsTable,
} from "@workspace/db";
import { eq, desc, and, sql, count, gte, ilike, or, isNull, ne } from "drizzle-orm";
import { authMiddleware } from "../../middlewares/auth";
import {
  requireModeratorPanel,
  requirePermission,
  assertCanActOnUser,
  loadUserPermissions,
  ensureModerationPermissionsSeeded,
} from "../../middlewares/moderation";
import { writeAuditLog } from "../../lib/moderation/audit";
import { moderationRateLimit } from "../../lib/moderation/rate-limit";
import { emitRealtimeToRoom, emitRealtimeToUser } from "../../lib/realtime";

const router = Router();

router.use(authMiddleware, requireModeratorPanel, moderationRateLimit({ windowMs: 60_000, max: 60 }));

async function notifyReportOutcome(opts: {
  report: typeof moderationReportsTable.$inferSelect;
  actorUserId: number;
  status: "resolved" | "rejected";
  message: string;
}): Promise<void> {
  if (!opts.report.reporterUserId) return;
  const title = opts.status === "resolved" ? "İlan Şikâyetiniz Sonuçlandı" : "İlan Şikâyetiniz İncelendi";
  await db.insert(notificationsTable).values({
    userId: opts.report.reporterUserId,
    type: "listing_report_result",
    title,
    message: opts.message,
    relatedId: opts.report.id,
    linkUrl: "/destek",
    isRead: false,
  });
  emitRealtimeToUser(opts.report.reporterUserId, "notification:new", {
    type: "listing_report_result",
    title,
    message: opts.message,
    relatedId: opts.report.id,
    linkUrl: "/destek",
  });

  const [ticket] = await db.select().from(supportTicketsTable)
    .where(and(
      eq(supportTicketsTable.userId, opts.report.reporterUserId),
      ilike(supportTicketsTable.subject, `%Rapor #${opts.report.id}%`),
    ))
    .orderBy(desc(supportTicketsTable.id))
    .limit(1);
  if (!ticket) return;

  const now = new Date();
  const [supportMessage] = await db.insert(supportMessagesTable).values({
    ticketId: ticket.id,
    userId: opts.actorUserId,
    message: opts.message,
    messageType: "text",
    isStaff: true,
    isInternalNote: false,
  }).returning();
  await db.update(supportTicketsTable).set({
    status: "resolved",
    resolvedAt: now,
    lastMessageAt: now,
    updatedAt: now,
  }).where(eq(supportTicketsTable.id, ticket.id));

  const payload = {
    id: supportMessage!.id,
    ticketId: ticket.id,
    userId: opts.actorUserId,
    message: opts.message,
    messageType: "text",
    isStaff: true,
    isInternalNote: false,
    createdAt: supportMessage!.createdAt.toISOString(),
    status: "resolved",
  };
  emitRealtimeToRoom(`support:ticket:${ticket.id}`, "support:message", payload);
  emitRealtimeToUser(opts.report.reporterUserId, "support:message", payload);
}

function maskIp(ip: string | null | undefined, full: boolean): string {
  if (!ip) return "—";
  if (full) return ip;
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  if (ip.includes(":")) return ip.slice(0, 8) + "…";
  return ip.slice(0, 6) + "…";
}

/** Me + permissions */
router.get("/me", async (req, res) => {
  await ensureModerationPermissionsSeeded();
  const permissions = await loadUserPermissions(req.user!.role, req.user!.id);
  res.json({
    id: req.user!.id,
    username: req.user!.username,
    displayName: (req.user as { displayName?: string }).displayName ?? req.user!.username,
    role: req.user!.role,
    avatarUrl: req.user!.avatarUrl,
    permissions,
  });
});

/** Sidebar badge counts */
router.get("/badges", requirePermission("dashboard.view"), async (req, res) => {
  const [[pendingListings], [pendingReports], [companies], [messages], [notifs]] = await Promise.all([
    db.select({ c: count() }).from(listingsTable).where(and(eq(listingsTable.isActive, false), eq(listingsTable.status, "pending"))),
    db.select({ c: count() }).from(moderationReportsTable).where(eq(moderationReportsTable.status, "pending")),
    db.select({ c: count() }).from(companyProfilesTable).where(eq(companyProfilesTable.isVerified, false)),
    db.select({ c: count() }).from(moderationReportsTable).where(and(eq(moderationReportsTable.targetType, "message"), eq(moderationReportsTable.status, "pending"))),
    db.select({ c: count() }).from(notificationsTable).where(and(eq(notificationsTable.userId, req.user!.id), eq(notificationsTable.isRead, false))),
  ]);
  res.json({
    listings: Number(pendingListings?.c ?? 0),
    companies: Number(companies?.c ?? 0),
    users: 0,
    comments: 0,
    messages: Number(messages?.c ?? 0),
    notifications: Math.min(Number(notifs?.c ?? 0), 99),
    reports: Number(pendingReports?.c ?? 0),
  });
});

/** Dashboard aggregate */
router.get("/dashboard", requirePermission("dashboard.view"), async (req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [[totalListings], [weekListings], [activeUsers], [weekUsers], [pendingReports], [pendingApprovals]] = await Promise.all([
    db.select({ c: count() }).from(listingsTable).where(eq(listingsTable.isActive, true)),
    db.select({ c: count() }).from(listingsTable).where(gte(listingsTable.createdAt, weekAgo)),
    db.select({ c: count() }).from(usersTable).where(eq(usersTable.isBanned, false)),
    db.select({ c: count() }).from(usersTable).where(gte(usersTable.createdAt, weekAgo)),
    db.select({ c: count() }).from(moderationReportsTable).where(eq(moderationReportsTable.status, "pending")),
    db.select({ c: count() }).from(listingsTable).where(or(eq(listingsTable.status, "pending"), and(eq(listingsTable.isActive, false), ne(listingsTable.status, "rejected")))),
  ]);

  const reports = await db
    .select()
    .from(moderationReportsTable)
    .where(eq(moderationReportsTable.status, "pending"))
    .orderBy(desc(moderationReportsTable.createdAt))
    .limit(8);

  const activities = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(12);

  // chart: last 7 days listing counts
  const chartDays: { date: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const [row] = await db
      .select({ c: count() })
      .from(listingsTable)
      .where(and(gte(listingsTable.createdAt, d), sql`${listingsTable.createdAt} < ${next}`));
    chartDays.push({
      date: d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
      value: Number(row?.c ?? 0),
    });
  }

  const totalViews = await db
    .select({ s: sql<number>`coalesce(sum(${listingsTable.viewCount}),0)` })
    .from(listingsTable);

  res.json({
    stats: {
      totalListings: Number(totalListings?.c ?? 0),
      listingsDelta: Number(weekListings?.c ?? 0),
      activeUsers: Number(activeUsers?.c ?? 0),
      usersDelta: Number(weekUsers?.c ?? 0),
      reportedContent: Number(pendingReports?.c ?? 0),
      pendingApprovals: Number(pendingApprovals?.c ?? 0),
      views: Number(totalViews[0]?.s ?? 0),
      applications: 0,
      messages: 0,
    },
    reports: reports.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      title: r.titleSnapshot || `#${r.targetId}`,
      reason: r.reason,
      reasonCode: r.reasonCode,
      reporterUserId: r.reporterUserId,
      imageUrl: r.imageUrl,
      createdAt: r.createdAt,
      status: r.status,
    })),
    activities: activities.map((a) => ({
      id: a.id,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      reason: a.reason,
      actorUserId: a.actorUserId,
      createdAt: a.createdAt,
      success: a.success,
    })),
    chart: chartDays,
    health: {
      server: "active",
      database: "active",
      notifications: "active",
      backup: "active",
    },
  });
});

router.get("/health/:kind", requirePermission("dashboard.view"), async (req, res) => {
  const kind = String(req.params.kind);
  try {
    if (kind === "database") {
      await db.execute(sql`SELECT 1`);
    }
    res.json({ status: "active" });
  } catch {
    res.json({ status: "offline" });
  }
});

/** Listings */
router.get("/listings", requirePermission("listings.view"), async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const status = String(req.query.status ?? "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (q) conditions.push(or(ilike(listingsTable.title, `%${q}%`), ilike(listingsTable.city, `%${q}%`), ilike(listingsTable.company, `%${q}%`)));
  if (status === "active") conditions.push(eq(listingsTable.isActive, true));
  if (status === "pending") conditions.push(eq(listingsTable.status, "pending"));
  if (status === "rejected") conditions.push(eq(listingsTable.status, "rejected"));

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select().from(listingsTable).where(where).orderBy(desc(listingsTable.createdAt)).limit(limit).offset(offset);
  const [total] = await db.select({ c: count() }).from(listingsTable).where(where);

  res.json({ items: rows, total: Number(total?.c ?? 0), page, limit });
});

router.post("/listings/:id/approve", requirePermission("listings.approve"), async (req, res) => {
  const id = Number(req.params.id);
  const [prev] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!prev) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  const [row] = await db.update(listingsTable).set({ isActive: true, status: "active" }).where(eq(listingsTable.id, id)).returning();
  await writeAuditLog({ req, action: "listings.approve", targetType: "listing", targetId: id, previousData: prev, newData: row, reason: String((req.body as { reason?: string })?.reason ?? "") });
  res.json(row);
});

router.post("/listings/:id/reject", requirePermission("listings.reject"), async (req, res) => {
  const id = Number(req.params.id);
  const reason = String((req.body as { reason?: string })?.reason ?? "").trim();
  if (!reason) { res.status(400).json({ error: "Red nedeni zorunludur" }); return; }
  const [prev] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!prev) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  const [row] = await db.update(listingsTable).set({ isActive: false, status: "rejected" }).where(eq(listingsTable.id, id)).returning();
  await writeAuditLog({ req, action: "listings.reject", targetType: "listing", targetId: id, previousData: prev, newData: row, reason });
  res.json(row);
});

router.post("/listings/:id/archive", requirePermission("listings.archive"), async (req, res) => {
  const id = Number(req.params.id);
  const reason = String((req.body as { reason?: string })?.reason ?? "").trim() || "Arşivlendi";
  const [prev] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!prev) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  const [row] = await db.update(listingsTable).set({ isActive: false, status: "archived" }).where(eq(listingsTable.id, id)).returning();
  await writeAuditLog({ req, action: "listings.archive", targetType: "listing", targetId: id, previousData: prev, newData: row, reason });
  res.json(row);
});

router.post("/listings/:id/soft-delete", requirePermission("listings.soft_delete"), async (req, res) => {
  const id = Number(req.params.id);
  const reason = String((req.body as { reason?: string })?.reason ?? "").trim();
  if (!reason) { res.status(400).json({ error: "Silme nedeni zorunludur" }); return; }
  const [prev] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!prev) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  const [row] = await db.update(listingsTable).set({ isActive: false, status: "deleted" }).where(eq(listingsTable.id, id)).returning();
  await writeAuditLog({ req, action: "listings.soft_delete", targetType: "listing", targetId: id, previousData: prev, newData: row, reason });
  res.json(row);
});

router.post("/listings/:id/feature", requirePermission("listings.feature"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(listingsTable).set({ isFeatured: true, featuredUntil: new Date(Date.now() + 3 * 24 * 3600 * 1000) }).where(eq(listingsTable.id, id)).returning();
  await writeAuditLog({ req, action: "listings.feature", targetType: "listing", targetId: id, newData: row });
  res.json(row);
});

router.post("/listings/:id/unfeature", requirePermission("listings.remove_feature"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(listingsTable).set({ isFeatured: false, featuredUntil: null }).where(eq(listingsTable.id, id)).returning();
  await writeAuditLog({ req, action: "listings.remove_feature", targetType: "listing", targetId: id, newData: row });
  res.json(row);
});

router.post("/listings/bulk", requirePermission("listings.bulk_action"), async (req, res) => {
  const body = req.body as { ids?: number[]; action?: string; reason?: string };
  const ids = body.ids ?? [];
  const action = body.action ?? "";
  const reason = body.reason ?? "";
  if (!ids.length || !action) { res.status(400).json({ error: "ids ve action gerekli" }); return; }
  if (action === "delete") {
    const canDelete = await loadUserPermissions(req.user!.role, req.user!.id);
    if (!canDelete.includes("listings.soft_delete")) {
      res.status(403).json({ error: "Silme yetkiniz yok", code: "FORBIDDEN_PERMISSION", permission: "listings.soft_delete" });
      return;
    }
  }
  let updated = 0;
  for (const id of ids) {
    if (action === "approve") await db.update(listingsTable).set({ isActive: true, status: "active" }).where(eq(listingsTable.id, id));
    else if (action === "reject") await db.update(listingsTable).set({ isActive: false, status: "rejected" }).where(eq(listingsTable.id, id));
    else if (action === "archive") await db.update(listingsTable).set({ isActive: false, status: "archived" }).where(eq(listingsTable.id, id));
    else if (action === "delete") await db.update(listingsTable).set({ isActive: false, status: "deleted" }).where(eq(listingsTable.id, id));
    updated++;
  }
  await writeAuditLog({ req, action: `listings.bulk.${action}`, reason, newData: { ids, updated } });
  res.json({ updated });
});

/** Companies */
router.get("/companies", requirePermission("companies.view"), async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const rows = await db
    .select()
    .from(companyProfilesTable)
    .where(q ? and(ilike(companyProfilesTable.companyName, `%${q}%`), isNull(companyProfilesTable.deletedAt)) : isNull(companyProfilesTable.deletedAt))
    .orderBy(desc(companyProfilesTable.createdAt))
    .limit(50);
  res.json({ items: rows });
});

router.post("/companies/:id/verify", requirePermission("companies.verify"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(companyProfilesTable).set({ isVerified: true }).where(eq(companyProfilesTable.id, id)).returning();
  await writeAuditLog({ req, action: "companies.verify", targetType: "company", targetId: id, newData: row });
  res.json(row);
});

router.post("/companies/:id/unverify", requirePermission("companies.reject"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(companyProfilesTable).set({ isVerified: false }).where(eq(companyProfilesTable.id, id)).returning();
  await writeAuditLog({ req, action: "companies.reject", targetType: "company", targetId: id, newData: row, reason: String((req.body as { reason?: string })?.reason ?? "") });
  res.json(row);
});

router.post("/companies/:id/suspend", requirePermission("companies.suspend"), async (req, res) => {
  const id = Number(req.params.id);
  const reason = String((req.body as { reason?: string })?.reason ?? "").trim();
  if (!reason) { res.status(400).json({ error: "Sebep zorunlu" }); return; }
  const [row] = await db.update(companyProfilesTable).set({ isActive: false }).where(eq(companyProfilesTable.id, id)).returning();
  await writeAuditLog({ req, action: "companies.suspend", targetType: "company", targetId: id, newData: row, reason });
  res.json(row);
});

router.post("/companies/:id/unsuspend", requirePermission("companies.unsuspend"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(companyProfilesTable).set({ isActive: true }).where(eq(companyProfilesTable.id, id)).returning();
  await writeAuditLog({ req, action: "companies.unsuspend", targetType: "company", targetId: id, newData: row });
  res.json(row);
});

/** Users */
router.get("/users", requirePermission("users.view"), async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const rows = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
      avatarUrl: usersTable.avatarUrl,
      isBanned: usersTable.isBanned,
      banReason: usersTable.banReason,
      banExpiresAt: usersTable.banExpiresAt,
      createdAt: usersTable.createdAt,
      lastKnownIp: usersTable.lastKnownIp,
    })
    .from(usersTable)
    .where(q ? or(ilike(usersTable.username, `%${q}%`), ilike(usersTable.email, `%${q}%`), ilike(usersTable.displayName, `%${q}%`)) : undefined)
    .orderBy(desc(usersTable.createdAt))
    .limit(50);
  res.json({
    items: rows.map((u) => ({
      ...u,
      lastKnownIp: maskIp(u.lastKnownIp, req.user!.role === "admin" || req.user!.role === "senior_moderator"),
    })),
  });
});

router.post("/users/:id/warn", requirePermission("users.warn"), async (req, res) => {
  const id = Number(req.params.id);
  const reason = String((req.body as { reason?: string })?.reason ?? "").trim();
  if (!reason) { res.status(400).json({ error: "Uyarı nedeni zorunlu" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!target) { res.status(404).json({ error: "Kullanıcı yok" }); return; }
  if (!assertCanActOnUser(req.user!.role, target.role)) {
    res.status(403).json({ error: "Bu kullanıcıya işlem yapılamaz" }); return;
  }
  const [row] = await db.insert(userWarningsTable).values({ userId: id, issuedById: req.user!.id, reason }).returning();
  await writeAuditLog({ req, action: "users.warn", targetType: "user", targetId: id, reason });
  res.json(row);
});

router.post("/users/:id/suspend", requirePermission("users.suspend_temporarily"), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { reason?: string; hours?: number };
  const reason = String(body.reason ?? "").trim();
  const hours = Math.max(1, Math.min(24 * 30, Number(body.hours) || 24));
  if (!reason) { res.status(400).json({ error: "Sebep zorunlu" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!target) { res.status(404).json({ error: "Kullanıcı yok" }); return; }
  if (!assertCanActOnUser(req.user!.role, target.role)) {
    res.status(403).json({ error: "Bu kullanıcıya işlem yapılamaz" }); return;
  }
  const endsAt = new Date(Date.now() + hours * 3600 * 1000);
  await db.update(usersTable).set({ isBanned: true, banReason: reason, banExpiresAt: endsAt }).where(eq(usersTable.id, id));
  const [row] = await db.insert(userSuspensionsTable).values({
    userId: id, issuedById: req.user!.id, reason, endsAt, isActive: true,
  }).returning();
  await writeAuditLog({ req, action: "users.suspend_temporarily", targetType: "user", targetId: id, reason, newData: { hours, endsAt } });
  res.json(row);
});

router.post("/users/:id/unsuspend", requirePermission("users.unsuspend"), async (req, res) => {
  const id = Number(req.params.id);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!target) { res.status(404).json({ error: "Kullanıcı yok" }); return; }
  if (!assertCanActOnUser(req.user!.role, target.role)) {
    res.status(403).json({ error: "Bu kullanıcıya işlem yapılamaz" }); return;
  }
  await db.update(usersTable).set({ isBanned: false, banReason: null, banExpiresAt: null }).where(eq(usersTable.id, id));
  await db.update(userSuspensionsTable).set({ isActive: false, liftedById: req.user!.id, liftedAt: new Date() })
    .where(and(eq(userSuspensionsTable.userId, id), eq(userSuspensionsTable.isActive, true)));
  await writeAuditLog({ req, action: "users.unsuspend", targetType: "user", targetId: id });
  res.json({ ok: true });
});

/** Reports */
router.get("/reports", requirePermission("reports.view"), async (req, res) => {
  const status = String(req.query.status ?? "");
  const where = status ? eq(moderationReportsTable.status, status) : undefined;
  const rows = await db.select().from(moderationReportsTable).where(where).orderBy(desc(moderationReportsTable.createdAt)).limit(100);
  res.json({ items: rows });
});

router.get("/reports/:id", requirePermission("reports.view"), async (req, res) => {
  const id = Number(req.params.id);
  const [report] = await db.select().from(moderationReportsTable).where(eq(moderationReportsTable.id, id)).limit(1);
  if (!report) { res.status(404).json({ error: "Rapor yok" }); return; }
  const actions = await db.select().from(auditLogsTable)
    .where(and(eq(auditLogsTable.targetType, "report"), eq(auditLogsTable.targetId, id)))
    .orderBy(desc(auditLogsTable.createdAt)).limit(50);
  res.json({ report, actions });
});

router.post("/reports", requirePermission("reports.view"), async (req, res) => {
  // Allow staff to create report entries (and system seeding)
  const body = req.body as {
    targetType: string; targetId: number; reason: string; reasonCode?: string;
    titleSnapshot?: string; contentSnapshot?: string; imageUrl?: string;
  };
  if (!body.targetType || !body.targetId || !body.reason) {
    res.status(400).json({ error: "targetType, targetId, reason gerekli" }); return;
  }
  const [row] = await db.insert(moderationReportsTable).values({
    targetType: body.targetType,
    targetId: body.targetId,
    reporterUserId: req.user!.id,
    reason: body.reason,
    reasonCode: body.reasonCode ?? null,
    titleSnapshot: body.titleSnapshot ?? null,
    contentSnapshot: body.contentSnapshot ?? null,
    imageUrl: body.imageUrl ?? null,
    status: "pending",
  }).returning();
  res.status(201).json(row);
});

router.post("/reports/:id/resolve", requirePermission("reports.resolve"), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { note?: string; userMessage?: string };
  const note = String(body.note ?? "").trim();
  const userMessage = String(body.userMessage ?? note).trim();
  if (!userMessage) { res.status(400).json({ error: "Kullanıcıya gönderilecek sonuç mesajı zorunlu" }); return; }
  const [row] = await db.update(moderationReportsTable).set({
    status: "resolved", resolvedById: req.user!.id, resolutionNote: note, resolvedAt: new Date(),
  }).where(eq(moderationReportsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Rapor yok" }); return; }
  await db.insert(moderationActionsTable).values({
    reportId: id, actorUserId: req.user!.id, action: "resolve", targetType: "report", targetId: id, reason: note || null,
  });
  if (note) {
    await db.insert(moderationNotesTable).values({
      reportId: id, authorId: req.user!.id, note, isInternal: true,
    });
  }
  await writeAuditLog({ req, action: "reports.resolve", targetType: "report", targetId: id, reason: note });
  await notifyReportOutcome({ report: row, actorUserId: req.user!.id, status: "resolved", message: userMessage });
  res.json(row);
});

router.post("/reports/:id/reject", requirePermission("reports.reject"), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { reason?: string; userMessage?: string };
  const reason = String(body.reason ?? "").trim();
  const userMessage = String(body.userMessage ?? reason).trim();
  if (!reason) { res.status(400).json({ error: "Sebep zorunlu" }); return; }
  if (!userMessage) { res.status(400).json({ error: "Kullanıcıya gönderilecek sonuç mesajı zorunlu" }); return; }
  const [row] = await db.update(moderationReportsTable).set({
    status: "rejected", resolvedById: req.user!.id, resolutionNote: reason, resolvedAt: new Date(),
  }).where(eq(moderationReportsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Rapor yok" }); return; }
  await db.insert(moderationActionsTable).values({
    reportId: id, actorUserId: req.user!.id, action: "reject", targetType: "report", targetId: id, reason,
  });
  await writeAuditLog({ req, action: "reports.reject", targetType: "report", targetId: id, reason });
  await notifyReportOutcome({ report: row, actorUserId: req.user!.id, status: "rejected", message: userMessage });
  res.json(row);
});

router.post("/reports/:id/escalate", requirePermission("reports.escalate"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(moderationReportsTable).set({ status: "escalated" }).where(eq(moderationReportsTable.id, id)).returning();
  await db.insert(moderationActionsTable).values({
    reportId: id, actorUserId: req.user!.id, action: "escalate", targetType: "report", targetId: id,
  });
  await writeAuditLog({ req, action: "reports.escalate", targetType: "report", targetId: id });
  res.json(row);
});

router.post("/reports/:id/assign", requirePermission("reports.assign"), async (req, res) => {
  const id = Number(req.params.id);
  const moderatorId = Number((req.body as { moderatorId?: number })?.moderatorId) || req.user!.id;
  const [row] = await db.update(moderationReportsTable).set({
    assignedModeratorId: moderatorId, status: "investigating",
  }).where(eq(moderationReportsTable.id, id)).returning();
  await db.insert(moderationAssignmentsTable).values({
    reportId: id, moderatorId, assignedById: req.user!.id,
  });
  await db.insert(moderationActionsTable).values({
    reportId: id, actorUserId: req.user!.id, action: "assign", targetType: "report", targetId: id,
    meta: { moderatorId },
  });
  await writeAuditLog({ req, action: "reports.assign", targetType: "report", targetId: id, newData: { moderatorId } });
  res.json(row);
});

/** Comments / messages (chat soft-delete) */
router.get("/comments", requirePermission("comments.view"), async (_req, res) => {
  const rows = await db.select().from(chatMessagesTable)
    .where(eq(chatMessagesTable.isDeleted, false))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(50);
  res.json({ items: rows });
});

router.post("/comments/:id/hide", requirePermission("comments.hide"), async (req, res) => {
  const id = Number(req.params.id);
  const reason = String((req.body as { reason?: string })?.reason ?? "").trim();
  if (!reason) { res.status(400).json({ error: "Sebep zorunlu" }); return; }
  const [row] = await db.update(chatMessagesTable).set({ isDeleted: true }).where(eq(chatMessagesTable.id, id)).returning();
  await writeAuditLog({ req, action: "comments.hide", targetType: "message", targetId: id, reason });
  res.json(row);
});

router.post("/comments/:id/restore", requirePermission("comments.restore"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(chatMessagesTable).set({ isDeleted: false }).where(eq(chatMessagesTable.id, id)).returning();
  await writeAuditLog({ req, action: "comments.restore", targetType: "message", targetId: id });
  res.json(row);
});

/** IP / devices */
router.get("/ip-devices", requirePermission("ip_devices.view"), async (req, res) => {
  const fullIp = req.user!.role === "admin" || req.user!.role === "senior_moderator";
  const sessions = await db.select().from(deviceSessionsTable).orderBy(desc(deviceSessionsTable.lastSeenAt)).limit(100);
  const fallback = await db
    .select({
      id: usersTable.id,
      userId: usersTable.id,
      username: usersTable.username,
      ip: usersTable.lastKnownIp,
      deviceId: usersTable.lastDeviceId,
    })
    .from(usersTable)
    .where(sql`${usersTable.lastKnownIp} is not null`)
    .limit(50);

  res.json({
    items: sessions.length
      ? sessions.map((s) => ({ ...s, ip: maskIp(s.ip, fullIp) }))
      : fallback.map((u) => ({
          id: u.id,
          userId: u.userId,
          username: u.username,
          ip: maskIp(u.ip, fullIp),
          deviceId: u.deviceId,
          riskScore: 0,
          isFlagged: false,
          lastSeenAt: null,
        })),
  });
});

router.post("/ip-devices/:id/flag", requirePermission("ip_devices.flag"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(deviceSessionsTable).set({ isFlagged: true }).where(eq(deviceSessionsTable.id, id)).returning();
  await writeAuditLog({ req, action: "ip_devices.flag", targetType: "device_session", targetId: id });
  res.json(row ?? { ok: true });
});

router.post("/ip-devices/:id/block", requirePermission("ip_devices.block"), async (req, res) => {
  const id = Number(req.params.id);
  const reason = String((req.body as { reason?: string })?.reason ?? "").trim() || "IP/cihaz engeli";
  const [session] = await db.select().from(deviceSessionsTable).where(eq(deviceSessionsTable.id, id)).limit(1);
  if (!session?.ip) {
    res.status(404).json({ error: "Oturum veya IP bulunamadı" });
    return;
  }
  const [ban] = await db.insert(ipBansTable).values({
    ip: session.ip,
    reason,
    bannedBy: req.user!.id,
  }).returning();
  await db.update(deviceSessionsTable).set({ isFlagged: true, riskScore: 100 }).where(eq(deviceSessionsTable.id, id));
  await db.insert(blacklistEntriesTable).values({
    entryType: "ip",
    value: session.ip,
    reason,
    createdById: req.user!.id,
  });
  await writeAuditLog({ req, action: "ip_devices.block", targetType: "device_session", targetId: id, reason, newData: ban });
  res.json({ ban, sessionId: id });
});

/** Blacklist */
router.get("/blacklist", requirePermission("blacklist.view"), async (_req, res) => {
  const rows = await db.select().from(blacklistEntriesTable).where(eq(blacklistEntriesTable.isActive, true)).orderBy(desc(blacklistEntriesTable.createdAt)).limit(200);
  res.json({ items: rows });
});

router.post("/blacklist", requirePermission("blacklist.add"), async (req, res) => {
  const body = req.body as { entryType?: string; value?: string; reason?: string };
  if (!body.entryType || !body.value) { res.status(400).json({ error: "Tür ve değer zorunlu" }); return; }
  const [row] = await db.insert(blacklistEntriesTable).values({
    entryType: body.entryType,
    value: body.value.trim(),
    reason: body.reason ?? null,
    createdById: req.user!.id,
  }).returning();
  await writeAuditLog({ req, action: "blacklist.add", targetType: "blacklist", targetId: row.id, newData: row, reason: body.reason });
  res.status(201).json(row);
});

router.delete("/blacklist/:id", requirePermission("blacklist.remove"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(blacklistEntriesTable).set({ isActive: false }).where(eq(blacklistEntriesTable.id, id)).returning();
  await writeAuditLog({ req, action: "blacklist.remove", targetType: "blacklist", targetId: id });
  res.json(row);
});

/** Word filter */
router.get("/word-filter", requirePermission("word_filter.view"), async (_req, res) => {
  const rows = await db.select().from(filteredWordsTable).where(eq(filteredWordsTable.isActive, true)).orderBy(desc(filteredWordsTable.createdAt)).limit(300);
  res.json({ items: rows });
});

router.post("/word-filter", requirePermission("word_filter.add"), async (req, res) => {
  const body = req.body as { word?: string; category?: string; action?: string; isRegex?: boolean };
  if (!body.word?.trim()) { res.status(400).json({ error: "Kelime zorunlu" }); return; }
  if (body.isRegex && body.word.length > 120) { res.status(400).json({ error: "Regex çok uzun" }); return; }
  const [row] = await db.insert(filteredWordsTable).values({
    word: body.word.trim(),
    category: body.category ?? "custom",
    action: body.action ?? "log",
    isRegex: !!body.isRegex,
    createdById: req.user!.id,
  }).returning();
  await writeAuditLog({ req, action: "word_filter.add", targetType: "filtered_word", targetId: row.id, newData: row });
  res.status(201).json(row);
});

router.patch("/word-filter/:id", requirePermission("word_filter.edit"), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { word?: string; category?: string; action?: string; isActive?: boolean };
  const [row] = await db.update(filteredWordsTable).set({
    ...(body.word != null ? { word: body.word } : {}),
    ...(body.category != null ? { category: body.category } : {}),
    ...(body.action != null ? { action: body.action } : {}),
    ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
  }).where(eq(filteredWordsTable.id, id)).returning();
  await writeAuditLog({ req, action: "word_filter.edit", targetType: "filtered_word", targetId: id, newData: row });
  res.json(row);
});

router.delete("/word-filter/:id", requirePermission("word_filter.remove"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(filteredWordsTable).set({ isActive: false }).where(eq(filteredWordsTable.id, id)).returning();
  await writeAuditLog({ req, action: "word_filter.remove", targetType: "filtered_word", targetId: id });
  res.json(row);
});

/** Logs (read-only) */
router.get("/logs", requirePermission("logs.view"), async (req, res) => {
  const action = String(req.query.action ?? "");
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(action ? eq(auditLogsTable.action, action) : undefined)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(150);
  res.json({ items: rows });
});

/** Announcements */
router.get("/announcements", requirePermission("announcements.view"), async (_req, res) => {
  const rows = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt)).limit(50);
  res.json({ items: rows });
});

router.post("/announcements", requirePermission("announcements.create"), async (req, res) => {
  const body = req.body as { content?: string; isActive?: boolean; isPinned?: boolean; targetType?: string; targetValue?: string };
  if (!body.content?.trim()) { res.status(400).json({ error: "İçerik zorunlu" }); return; }
  const [row] = await db.insert(announcementsTable).values({
    content: body.content.trim(),
    isActive: body.isActive !== false,
    isPinned: !!body.isPinned,
  }).returning();
  await db.insert(announcementTargetsTable).values({
    announcementId: row.id,
    targetType: body.targetType ?? "all",
    targetValue: body.targetValue ?? null,
  });
  await writeAuditLog({ req, action: "announcements.create", targetType: "announcement", targetId: row.id, newData: row });
  res.status(201).json(row);
});

router.delete("/announcements/:id", requirePermission("announcements.delete"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(announcementsTable).set({ isActive: false }).where(eq(announcementsTable.id, id)).returning();
  await writeAuditLog({ req, action: "announcements.delete", targetType: "announcement", targetId: id });
  res.json(row);
});

router.patch("/announcements/:id", requirePermission("announcements.edit"), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { content?: string; isActive?: boolean; isPinned?: boolean };
  const [row] = await db.update(announcementsTable).set({
    ...(body.content != null ? { content: body.content } : {}),
    ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    ...(typeof body.isPinned === "boolean" ? { isPinned: body.isPinned } : {}),
  }).where(eq(announcementsTable.id, id)).returning();
  await writeAuditLog({ req, action: "announcements.edit", targetType: "announcement", targetId: id, newData: row });
  res.json(row);
});

router.post("/announcements/:id/publish", requirePermission("announcements.publish"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(announcementsTable).set({ isActive: true }).where(eq(announcementsTable.id, id)).returning();
  await writeAuditLog({ req, action: "announcements.publish", targetType: "announcement", targetId: id });
  res.json(row);
});

router.post("/announcements/:id/unpublish", requirePermission("announcements.unpublish"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(announcementsTable).set({ isActive: false }).where(eq(announcementsTable.id, id)).returning();
  await writeAuditLog({ req, action: "announcements.unpublish", targetType: "announcement", targetId: id });
  res.json(row);
});

/** Statistics */
router.get("/statistics", requirePermission("statistics.view"), async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 7));
  const series: { date: string; listings: number; users: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const [l] = await db.select({ c: count() }).from(listingsTable).where(and(gte(listingsTable.createdAt, d), sql`${listingsTable.createdAt} < ${next}`));
    const [u] = await db.select({ c: count() }).from(usersTable).where(and(gte(usersTable.createdAt, d), sql`${usersTable.createdAt} < ${next}`));
    series.push({
      date: d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
      listings: Number(l?.c ?? 0),
      users: Number(u?.c ?? 0),
    });
  }
  res.json({ series, days });
});

/** Search */
router.get("/search", requirePermission("dashboard.view"), async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { res.json({ users: [], listings: [], companies: [], reports: [] }); return; }
  const [users, listings, companies, reports] = await Promise.all([
    db.select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName })
      .from(usersTable).where(or(ilike(usersTable.username, `%${q}%`), ilike(usersTable.displayName, `%${q}%`))).limit(8),
    db.select({ id: listingsTable.id, title: listingsTable.title, city: listingsTable.city })
      .from(listingsTable).where(ilike(listingsTable.title, `%${q}%`)).limit(8),
    db.select({ id: companyProfilesTable.id, companyName: companyProfilesTable.companyName })
      .from(companyProfilesTable).where(ilike(companyProfilesTable.companyName, `%${q}%`)).limit(8),
    db.select({ id: moderationReportsTable.id, titleSnapshot: moderationReportsTable.titleSnapshot, reason: moderationReportsTable.reason })
      .from(moderationReportsTable).where(ilike(moderationReportsTable.reason, `%${q}%`)).limit(8),
  ]);
  res.json({ users, listings, companies, reports });
});

/** Support tickets (mod → admin) */
router.post("/support-tickets", requirePermission("settings.profile"), async (req, res) => {
  const body = req.body as { subject?: string; category?: string; priority?: string; description?: string; screenshotUrl?: string };
  if (!body.subject?.trim() || !body.description?.trim()) {
    res.status(400).json({ error: "Konu ve açıklama zorunlu" }); return;
  }
  const [row] = await db.insert(moderatorSupportTicketsTable).values({
    authorId: req.user!.id,
    subject: body.subject.trim(),
    category: body.category ?? "other",
    priority: body.priority ?? "normal",
    description: body.description.trim(),
    screenshotUrl: body.screenshotUrl ?? null,
  }).returning();
  await writeAuditLog({ req, action: "moderator.support_ticket", targetType: "mod_support", targetId: row.id, newData: row });
  res.status(201).json(row);
});

/** Notifications list (own) */
router.get("/notifications", requirePermission("notifications.view"), async (req, res) => {
  const rows = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, req.user!.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json({ items: rows });
});

router.post("/notifications/send", requirePermission("notifications.send"), async (req, res) => {
  const body = req.body as { title?: string; message?: string; userId?: number; userIds?: number[] };
  const title = String(body.title ?? "").trim() || "Moderatör bildirimi";
  const message = String(body.message ?? "").trim();
  if (!message) { res.status(400).json({ error: "Mesaj zorunlu" }); return; }
  const ids = Array.isArray(body.userIds)
    ? body.userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : body.userId
      ? [Number(body.userId)]
      : [];
  if (!ids.length) { res.status(400).json({ error: "Hedef kullanıcı gerekli" }); return; }
  const created = [];
  for (const userId of [...new Set(ids)].slice(0, 100)) {
    const [row] = await db.insert(notificationsTable).values({
      userId,
      type: "admin",
      title,
      message,
    }).returning();
    created.push(row);
  }
  await writeAuditLog({
    req,
    action: "notifications.send",
    targetType: "notification",
    newData: { count: created.length, userIds: ids },
    reason: title,
  });
  res.status(201).json({ sent: created.length, items: created });
});

export default router;
