import { Router } from "express";
import { db, supportTicketsTable, supportMessagesTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { authMiddleware, requireAdmin, requireAdminOrModerator } from "../middlewares/auth";

const router = Router();

// ── User: create ticket ────────────────────────────────────────────────────────
router.post("/support", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { subject, message } = req.body as { subject?: string; message?: string };

  if (!subject?.trim()) { res.status(400).json({ error: "Konu zorunludur" }); return; }
  if (!message?.trim()) { res.status(400).json({ error: "Mesaj zorunludur" }); return; }

  const [ticket] = await db.insert(supportTicketsTable).values({
    userId,
    subject: subject.trim(),
    status: "waiting",
  }).returning();

  await db.insert(supportMessagesTable).values({
    ticketId: ticket!.id,
    userId,
    message: message.trim(),
    isStaff: false,
  });

  // Notify all admins & moderators
  const staff = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`${usersTable.role} IN ('admin','moderator')`);

  if (staff.length > 0) {
    await db.insert(notificationsTable).values(
      staff.map(s => ({
        userId: s.id,
        type: "support",
        title: "Yeni Destek Talebi",
        message: `#${ticket!.id} — ${subject.trim()}`,
        relatedId: ticket!.id,
        linkUrl: "/admin",
        isRead: false,
      }))
    );
  }

  res.status(201).json({ id: ticket!.id, subject: ticket!.subject, status: ticket!.status });
});

// ── User: list own tickets ─────────────────────────────────────────────────────
router.get("/support", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const tickets = await db.select().from(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, userId))
    .orderBy(desc(supportTicketsTable.updatedAt));

  res.json(tickets.map(t => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  })));
});

// ── User: get ticket messages ──────────────────────────────────────────────────
router.get("/support/:id", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const isStaff = ["admin", "moderator"].includes(req.user!.role ?? "");
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Bulunamadı" }); return; }
  if (ticket.userId !== userId && !isStaff) { res.status(403).json({ error: "Erişim reddedildi" }); return; }

  const messages = await db.select({
    id: supportMessagesTable.id,
    message: supportMessagesTable.message,
    isStaff: supportMessagesTable.isStaff,
    userId: supportMessagesTable.userId,
    createdAt: supportMessagesTable.createdAt,
    username: usersTable.username,
  })
  .from(supportMessagesTable)
  .leftJoin(usersTable, eq(supportMessagesTable.userId, usersTable.id))
  .where(eq(supportMessagesTable.ticketId, id))
  .orderBy(supportMessagesTable.createdAt);

  res.json({
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    userId: ticket.userId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    messages: messages.map(m => ({
      id: m.id,
      message: m.message,
      isStaff: m.isStaff,
      userId: m.userId,
      username: m.username,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// ── User/Staff: reply to ticket ───────────────────────────────────────────────
router.post("/support/:id/reply", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const isStaff = ["admin", "moderator"].includes(req.user!.role ?? "");
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const { message } = req.body as { message?: string };
  if (!message?.trim()) { res.status(400).json({ error: "Mesaj zorunludur" }); return; }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Bulunamadı" }); return; }
  if (ticket.userId !== userId && !isStaff) { res.status(403).json({ error: "Erişim reddedildi" }); return; }
  if (ticket.status === "resolved") { res.status(400).json({ error: "Çözülmüş talebe yanıt verilemez" }); return; }

  const [msg] = await db.insert(supportMessagesTable).values({
    ticketId: id,
    userId,
    message: message.trim(),
    isStaff,
  }).returning();

  if (isStaff) {
    await db.update(supportTicketsTable)
      .set({ status: "answered" })
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.status, "waiting")));

    await db.insert(notificationsTable).values({
      userId: ticket.userId,
      type: "support",
      title: "Destek Talebiniz Yanıtlandı",
      message: `#${id} numaralı talebinize yanıt geldi.`,
      relatedId: id,
      linkUrl: "/destek",
      isRead: false,
    });
  } else {
    // User replied back → mark as waiting again
    await db.update(supportTicketsTable)
      .set({ status: "waiting" })
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.status, "answered")));

    const staff = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`${usersTable.role} IN ('admin','moderator')`);

    if (staff.length > 0) {
      await db.insert(notificationsTable).values(
        staff.map(s => ({
          userId: s.id,
          type: "support",
          title: "Destek Talebi Güncellendi",
          message: `#${id} nolu talebe kullanıcı yanıt verdi.`,
          relatedId: id,
          linkUrl: "/admin",
          isRead: false,
        }))
      );
    }
  }

  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId));

  res.status(201).json({
    id: msg!.id,
    message: msg!.message,
    isStaff,
    userId,
    username: user?.username ?? null,
    createdAt: msg!.createdAt.toISOString(),
  });
});

// ── Staff: change status ───────────────────────────────────────────────────────
router.patch("/support/:id/status", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const { status } = req.body as { status?: string };
  if (!status || !["waiting", "answered", "resolved"].includes(status)) {
    res.status(400).json({ error: "Geçersiz durum" }); return;
  }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Bulunamadı" }); return; }

  await db.update(supportTicketsTable).set({ status }).where(eq(supportTicketsTable.id, id));

  const statusLabels: Record<string, string> = {
    waiting: "Bekleniyor",
    answered: "Yanıtlandı",
    resolved: "Çözüldü",
  };

  await db.insert(notificationsTable).values({
    userId: ticket.userId,
    type: "support",
    title: "Destek Talebi Güncellendi",
    message: `#${id} talebinizin durumu "${statusLabels[status]}" olarak güncellendi.`,
    relatedId: id,
    linkUrl: "/destek",
    isRead: false,
  });

  res.json({ success: true, status });
});

// ── Admin: list all tickets ────────────────────────────────────────────────────
router.get("/admin/support", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  const status = req.query["status"] as string | undefined;
  const conditions = status ? [eq(supportTicketsTable.status, status)] : [];
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const tickets = await db.select({
    id: supportTicketsTable.id,
    subject: supportTicketsTable.subject,
    status: supportTicketsTable.status,
    userId: supportTicketsTable.userId,
    createdAt: supportTicketsTable.createdAt,
    updatedAt: supportTicketsTable.updatedAt,
    username: usersTable.username,
    msgCount: sql<number>`(SELECT COUNT(*)::int FROM support_messages WHERE ticket_id = ${supportTicketsTable.id})`,
  })
  .from(supportTicketsTable)
  .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
  .where(whereClause)
  .orderBy(desc(supportTicketsTable.updatedAt));

  res.json(tickets.map(t => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    userId: t.userId,
    username: t.username,
    msgCount: t.msgCount,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  })));
});

export default router;
