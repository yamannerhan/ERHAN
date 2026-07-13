import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

/**
 * Destek talepleri — mevcut tablo genişletildi (runtime ALTER ile uyumlu).
 * status: waiting | reviewing | answered | awaiting_user | resolved | closed | cancelled
 */
export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number"),
  userId: integer("user_id").notNull(),
  category: text("category").notNull().default("Diğer"),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("waiting"),
  priority: text("priority").notNull().default("normal"),
  assignedTo: integer("assigned_to"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const supportMessagesTable = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  userId: integer("user_id").notNull(),
  message: text("message").notNull(),
  messageType: text("message_type").notNull().default("text"),
  isStaff: boolean("is_staff").notNull().default(false),
  isInternalNote: boolean("is_internal_note").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const supportTicketEventsTable = pgTable("support_ticket_events", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  actorId: integer("actor_id"),
  eventType: text("event_type").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportTicketReadsTable = pgTable("support_ticket_reads", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  userId: integer("user_id").notNull(),
  lastReadMessageId: integer("last_read_message_id"),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type SupportMessage = typeof supportMessagesTable.$inferSelect;

export const SUPPORT_ACTIVE_STATUSES = ["waiting", "reviewing", "answered", "awaiting_user"] as const;
export const SUPPORT_CLOSED_STATUSES = ["resolved", "closed", "cancelled"] as const;
export const SUPPORT_CATEGORIES = [
  "Hesap Sorunu",
  "İlan Sorunu",
  "Ödeme / Paket",
  "Teknik Hata",
  "Şikâyet",
  "Öneri",
  "Moderasyon",
  "Diğer",
] as const;
