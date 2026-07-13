import { Router } from "express";
import {
  db,
  supportTicketsTable,
  supportMessagesTable,
  supportTicketEventsTable,
  notificationsTable,
  usersTable,
  SUPPORT_ACTIVE_STATUSES,
  SUPPORT_CATEGORIES,
} from "@workspace/db";
import { eq, desc, and, sql, inArray, isNull } from "drizzle-orm";
import { authMiddleware, requireAdminOrModerator } from "../middlewares/auth";
import { emitRealtime } from "../lib/realtime";

const router = Router();

const ACTIVE = [...SUPPORT_ACTIVE_STATUSES];
const ALL_STATUSES = [
  "waiting", "reviewing", "answered", "awaiting_user", "resolved", "closed", "cancelled",
];

function sanitizeText(input: string, max: number): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

async function ensureSupportSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS support_messages (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      is_staff BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const alters = [
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_number TEXT`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Diğer'`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to INTEGER`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'`,
    `ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS is_internal_note BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`,
    `ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  ];
  for (const q of alters) {
    await db.execute(sql.raw(q));
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS support_ticket_events (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL,
      actor_id INTEGER,
      event_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      metadata TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS support_ticket_reads (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      last_read_message_id INTEGER,
      read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_support_tickets_number ON support_tickets(ticket_number)`);
}

async function nextTicketNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTicketsTable);
  const n = (Number(count) || 0) + 1;
  return `DST-${year}-${String(n).padStart(6, "0")}`;
}

async function logEvent(
  ticketId: number,
  actorId: number | null,
  eventType: string,
  oldValue?: string | null,
  newValue?: string | null,
) {
  try {
    await db.insert(supportTicketEventsTable).values({
      ticketId,
      actorId,
      eventType,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
    });
  } catch {
    /* ignore */
  }
}

async function notifyStaff(opts: {
  title: string;
  message: string;
  relatedId: number;
}): Promise<void> {
  const staff = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`${usersTable.role} IN ('admin','moderator')`);

  if (staff.length === 0) return;

  await db.insert(notificationsTable).values(
    staff.map(s => ({
      userId: s.id,
      type: "support",
      title: opts.title,
      message: opts.message,
      relatedId: opts.relatedId,
      linkUrl: "/admin",
      isRead: false,
    })),
  );

  emitRealtime("notification:new", {
    type: "support",
    title: opts.title,
    message: opts.message,
    relatedId: opts.relatedId,
    linkUrl: "/admin",
    adminOnly: true,
    createdAt: new Date().toISOString(),
  });
}

function isStaffRole(role?: string | null) {
  return role === "admin" || role === "moderator";
}

function mapTicket(t: typeof supportTicketsTable.$inferSelect, extra: Record<string, unknown> = {}) {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber ?? `DST-${t.id}`,
    userId: t.userId,
    category: t.category ?? "Diğer",
    subject: t.subject,
    status: t.status,
    priority: t.priority ?? "normal",
    assignedTo: t.assignedTo,
    lastMessageAt: t.lastMessageAt?.toISOString?.() ?? t.lastMessageAt,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ...extra,
  };
}

// ── User: create ticket (tek açık talep — transaction + FOR UPDATE) ───────────
router.post("/support", authMiddleware, async (req, res): Promise<void> => {
  try {
    await ensureSupportSchema();
    if (isStaffRole(req.user!.role)) {
      res.status(403).json({
        error: "Admin ve yetkili hesaplar destek talebi açamaz. Talepleri Admin panelinden yanıtlayın.",
      });
      return;
    }
    const userId = req.user!.id;
    const body = req.body as {
      subject?: string;
      message?: string;
      category?: string;
    };

    const subject = sanitizeText(String(body.subject ?? ""), 120);
    const message = sanitizeText(String(body.message ?? ""), 2000);
    const category = String(body.category ?? "Diğer").trim();

    if (subject.length < 5) {
      res.status(400).json({ error: "Başlık en az 5 karakter olmalı" });
      return;
    }
    if (message.length < 10) {
      res.status(400).json({ error: "Mesaj en az 10 karakter olmalı" });
      return;
    }
    if (!SUPPORT_CATEGORIES.includes(category as typeof SUPPORT_CATEGORIES[number]) && category !== "Diğer") {
      // allow listed or Diğer
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);

      const openRows = await tx.select()
        .from(supportTicketsTable)
        .where(and(
          eq(supportTicketsTable.userId, userId),
          isNull(supportTicketsTable.deletedAt),
          inArray(supportTicketsTable.status, ACTIVE),
        ))
        .orderBy(desc(supportTicketsTable.id))
        .limit(1);

      const existing = openRows[0];
      if (existing) {
        return {
          blocked: true as const,
          existingId: existing.id,
          ticketNumber: existing.ticketNumber ?? `DST-${existing.id}`,
          subject: existing.subject,
          status: existing.status,
        };
      }

      const ticketNumber = await nextTicketNumber();
      const [ticket] = await tx.insert(supportTicketsTable).values({
        userId,
        ticketNumber,
        category: category || "Diğer",
        subject,
        status: "waiting",
        priority: "normal",
        lastMessageAt: new Date(),
      }).returning();

      await tx.insert(supportMessagesTable).values({
        ticketId: ticket!.id,
        userId,
        message,
        isStaff: false,
        messageType: "text",
      });

      await tx.insert(supportTicketEventsTable).values({
        ticketId: ticket!.id,
        actorId: userId,
        eventType: "created",
        newValue: "waiting",
      });

      return { blocked: false as const, ticket: ticket! };
    });

    if (result.blocked) {
      res.status(409).json({
        error: "Zaten açık bir destek talebiniz bulunuyor. Yeni talep açmadan önce mevcut talebinizin sonuçlanmasını bekleyin.",
        existingTicketId: result.existingId,
        ticketNumber: result.ticketNumber,
        subject: result.subject,
        status: result.status,
      });
      return;
    }

    const ticket = result.ticket;
    const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId));
    await notifyStaff({
      title: "Yeni Destek Talebi",
      message: `${user?.username ?? "Kullanıcı"}: ${ticket.ticketNumber ?? `#${ticket.id}`} — ${subject}`,
      relatedId: ticket.id,
    });

    res.status(201).json(mapTicket(ticket));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/support", authMiddleware, async (req, res): Promise<void> => {
  try {
    await ensureSupportSchema();
    const userId = req.user!.id;
    const tickets = await db.select().from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.userId, userId), isNull(supportTicketsTable.deletedAt)))
      .orderBy(desc(supportTicketsTable.updatedAt));

    res.json(tickets.map(t => mapTicket(t)));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/support/active", authMiddleware, async (req, res): Promise<void> => {
  try {
    await ensureSupportSchema();
    const userId = req.user!.id;
    const [ticket] = await db.select().from(supportTicketsTable)
      .where(and(
        eq(supportTicketsTable.userId, userId),
        isNull(supportTicketsTable.deletedAt),
        inArray(supportTicketsTable.status, ACTIVE),
      ))
      .orderBy(desc(supportTicketsTable.id))
      .limit(1);
    res.json({ ticket: ticket ? mapTicket(ticket) : null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/support/:id", authMiddleware, async (req, res): Promise<void> => {
  try {
    await ensureSupportSchema();
    const userId = req.user!.id;
    const staff = isStaffRole(req.user!.role);
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const id = parseInt(rawId ?? "", 10);
    if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

    const [ticket] = await db.select().from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), isNull(supportTicketsTable.deletedAt)));
    if (!ticket) { res.status(404).json({ error: "Bulunamadı" }); return; }
    if (ticket.userId !== userId && !staff) { res.status(403).json({ error: "Erişim reddedildi" }); return; }

    const messages = await db.select({
      id: supportMessagesTable.id,
      message: supportMessagesTable.message,
      isStaff: supportMessagesTable.isStaff,
      isInternalNote: supportMessagesTable.isInternalNote,
      userId: supportMessagesTable.userId,
      createdAt: supportMessagesTable.createdAt,
      username: usersTable.username,
      avatarUrl: usersTable.avatarUrl,
      role: usersTable.role,
    })
      .from(supportMessagesTable)
      .leftJoin(usersTable, eq(supportMessagesTable.userId, usersTable.id))
      .where(and(
        eq(supportMessagesTable.ticketId, id),
        isNull(supportMessagesTable.deletedAt),
        staff ? sql`TRUE` : eq(supportMessagesTable.isInternalNote, false),
      ))
      .orderBy(supportMessagesTable.createdAt);

    res.json({
      ...mapTicket(ticket),
      messages: messages.map(m => ({
        id: m.id,
        message: m.message,
        isStaff: m.isStaff,
        isInternalNote: m.isInternalNote ?? false,
        userId: m.userId,
        username: m.username,
        avatarUrl: m.avatarUrl,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/support/:id/reply", authMiddleware, async (req, res): Promise<void> => {
  try {
    await ensureSupportSchema();
    const userId = req.user!.id;
    const staff = isStaffRole(req.user!.role);
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const id = parseInt(rawId ?? "", 10);
    if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

    const body = req.body as { message?: string; isInternalNote?: boolean };
    const message = sanitizeText(String(body.message ?? ""), 2000);
    const isInternalNote = !!(staff && body.isInternalNote);
    if (message.length < 1) { res.status(400).json({ error: "Mesaj zorunludur" }); return; }

    const [ticket] = await db.select().from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), isNull(supportTicketsTable.deletedAt)));
    if (!ticket) { res.status(404).json({ error: "Bulunamadı" }); return; }
    if (ticket.userId !== userId && !staff) { res.status(403).json({ error: "Erişim reddedildi" }); return; }

    const closed = ["resolved", "closed", "cancelled"].includes(ticket.status);
    if (closed && !staff) {
      res.status(400).json({ error: "Kapalı talebe yanıt verilemez" });
      return;
    }

    const [msg] = await db.insert(supportMessagesTable).values({
      ticketId: id,
      userId,
      message,
      isStaff: staff,
      isInternalNote,
      messageType: isInternalNote ? "internal_note" : "text",
    }).returning();

    const patch: Partial<typeof supportTicketsTable.$inferInsert> = {
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    };

    if (!isInternalNote) {
      if (staff) {
        patch.status = "answered";
        if (!ticket.firstResponseAt) patch.firstResponseAt = new Date();
        await db.insert(notificationsTable).values({
          userId: ticket.userId,
          type: "support",
          title: "Destek Talebiniz Yanıtlandı",
          message: `${ticket.ticketNumber ?? `#${id}`} numaralı talebinize yanıt geldi.`,
          relatedId: id,
          linkUrl: "/destek",
          isRead: false,
        });
        emitRealtime("notification:new", {
          type: "support",
          title: "Destek Talebiniz Yanıtlandı",
          message: `${ticket.ticketNumber ?? `#${id}`} numaralı talebinize yanıt geldi.`,
          relatedId: id,
          linkUrl: "/destek",
          userId: ticket.userId,
          createdAt: new Date().toISOString(),
        });
      } else {
        patch.status = ticket.status === "answered" || ticket.status === "awaiting_user"
          ? "reviewing"
          : "waiting";
        await notifyStaff({
          title: "Destek Talebi Güncellendi",
          message: `${ticket.ticketNumber ?? `#${id}`} nolu talebe kullanıcı yanıt verdi.`,
          relatedId: id,
        });
      }
    }

    await db.update(supportTicketsTable).set(patch).where(eq(supportTicketsTable.id, id));
    await logEvent(id, userId, isInternalNote ? "internal_note" : "reply", ticket.status, patch.status ?? ticket.status);

    const [user] = await db.select({ username: usersTable.username, avatarUrl: usersTable.avatarUrl, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, userId));

    res.status(201).json({
      id: msg!.id,
      message: msg!.message,
      isStaff: staff,
      isInternalNote,
      userId,
      username: user?.username ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      role: user?.role ?? null,
      createdAt: msg!.createdAt.toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/support/:id/close", authMiddleware, async (req, res): Promise<void> => {
  try {
    await ensureSupportSchema();
    const userId = req.user!.id;
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const id = parseInt(rawId ?? "", 10);
    if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

    const [ticket] = await db.select().from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), isNull(supportTicketsTable.deletedAt)));
    if (!ticket) { res.status(404).json({ error: "Bulunamadı" }); return; }
    if (ticket.userId !== userId) { res.status(403).json({ error: "Erişim reddedildi" }); return; }
    if (!ACTIVE.includes(ticket.status)) {
      res.status(400).json({ error: "Bu talep zaten kapatılmış" });
      return;
    }

    await db.update(supportTicketsTable).set({
      status: "closed",
      closedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(supportTicketsTable.id, id));
    await logEvent(id, userId, "status_change", ticket.status, "closed");

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/support/:id/status", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  try {
    await ensureSupportSchema();
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const id = parseInt(rawId ?? "", 10);
    if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

    const { status, assignedTo } = req.body as { status?: string; assignedTo?: number | null };
    if (status && !ALL_STATUSES.includes(status)) {
      res.status(400).json({ error: "Geçersiz durum" }); return;
    }

    const [ticket] = await db.select().from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), isNull(supportTicketsTable.deletedAt)));
    if (!ticket) { res.status(404).json({ error: "Bulunamadı" }); return; }

    const patch: Partial<typeof supportTicketsTable.$inferInsert> = { updatedAt: new Date() };
    if (status) {
      patch.status = status;
      if (status === "resolved") patch.resolvedAt = new Date();
      if (status === "closed" || status === "cancelled") patch.closedAt = new Date();
      if (["waiting", "reviewing", "answered", "awaiting_user"].includes(status) && ["resolved", "closed", "cancelled"].includes(ticket.status)) {
        patch.reopenedAt = new Date();
      }
    }
    if (assignedTo !== undefined) patch.assignedTo = assignedTo;

    await db.update(supportTicketsTable).set(patch).where(eq(supportTicketsTable.id, id));
    if (status) await logEvent(id, req.user!.id, "status_change", ticket.status, status);

    if (status) {
      const statusLabels: Record<string, string> = {
        waiting: "Bekliyor",
        reviewing: "İnceleniyor",
        answered: "Yanıtlandı",
        awaiting_user: "Kullanıcı Yanıtı Bekleniyor",
        resolved: "Çözüldü",
        closed: "Kapatıldı",
        cancelled: "İptal Edildi",
      };
      await db.insert(notificationsTable).values({
        userId: ticket.userId,
        type: "support",
        title: "Destek Talebi Güncellendi",
        message: `${ticket.ticketNumber ?? `#${id}`} talebinizin durumu "${statusLabels[status]}" olarak güncellendi.`,
        relatedId: id,
        linkUrl: "/destek",
        isRead: false,
      });
      emitRealtime("notification:new", {
        type: "support",
        title: "Destek Talebi Güncellendi",
        message: `${ticket.ticketNumber ?? `#${id}`} talebinizin durumu "${statusLabels[status]}" olarak güncellendi.`,
        relatedId: id,
        linkUrl: "/destek",
        userId: ticket.userId,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, status: status ?? ticket.status });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/support", authMiddleware, requireAdminOrModerator, async (req, res): Promise<void> => {
  try {
    await ensureSupportSchema();
    const status = req.query["status"] as string | undefined;
    const conditions = [
      isNull(supportTicketsTable.deletedAt),
      ...(status ? [eq(supportTicketsTable.status, status)] : []),
    ];

    const tickets = await db.select({
      id: supportTicketsTable.id,
      ticketNumber: supportTicketsTable.ticketNumber,
      subject: supportTicketsTable.subject,
      category: supportTicketsTable.category,
      status: supportTicketsTable.status,
      priority: supportTicketsTable.priority,
      assignedTo: supportTicketsTable.assignedTo,
      userId: supportTicketsTable.userId,
      createdAt: supportTicketsTable.createdAt,
      updatedAt: supportTicketsTable.updatedAt,
      lastMessageAt: supportTicketsTable.lastMessageAt,
      username: usersTable.username,
      msgCount: sql<number>`(SELECT COUNT(*)::int FROM support_messages WHERE ticket_id = ${supportTicketsTable.id} AND deleted_at IS NULL)`,
    })
      .from(supportTicketsTable)
      .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(supportTicketsTable.updatedAt));

    res.json(tickets.map(t => ({
      ...mapTicket({
        id: t.id,
        ticketNumber: t.ticketNumber,
        userId: t.userId!,
        category: t.category ?? "Diğer",
        subject: t.subject!,
        status: t.status!,
        priority: t.priority ?? "normal",
        assignedTo: t.assignedTo,
        lastMessageAt: t.lastMessageAt,
        firstResponseAt: null,
        resolvedAt: null,
        closedAt: null,
        reopenedAt: null,
        createdAt: t.createdAt!,
        updatedAt: t.updatedAt!,
        deletedAt: null,
      }, {
        username: t.username,
        msgCount: t.msgCount,
      }),
    })));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/support/stats", authMiddleware, requireAdminOrModerator, async (_req, res): Promise<void> => {
  try {
    await ensureSupportSchema();
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'waiting' AND deleted_at IS NULL)::int AS waiting,
        COUNT(*) FILTER (WHERE status = 'reviewing' AND deleted_at IS NULL)::int AS reviewing,
        COUNT(*) FILTER (WHERE status = 'awaiting_user' AND deleted_at IS NULL)::int AS awaiting_user,
        COUNT(*) FILTER (WHERE status = 'answered' AND deleted_at IS NULL)::int AS answered,
        COUNT(*) FILTER (WHERE status = 'resolved' AND deleted_at IS NULL)::int AS resolved,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE AND deleted_at IS NULL)::int AS today
      FROM support_tickets
    `);
    const r = ((rows as { rows?: Array<Record<string, number>> }).rows?.[0])
      ?? (Array.isArray(rows) ? (rows as Array<Record<string, number>>)[0] : {})
      ?? {};
    res.json({
      waiting: Number(r.waiting ?? 0),
      reviewing: Number(r.reviewing ?? 0),
      awaitingUser: Number(r.awaiting_user ?? 0),
      answered: Number(r.answered ?? 0),
      resolved: Number(r.resolved ?? 0),
      today: Number(r.today ?? 0),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
