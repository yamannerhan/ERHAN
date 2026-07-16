import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/** Kalıcı WhatsApp oturum meta verisi (auth dosyaları volume'da). */
export const whatsappSessionsTable = pgTable("whatsapp_sessions", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("IDLE"),
  connectionMode: text("connection_mode"),
  phoneMasked: text("phone_masked"),
  lastError: text("last_error"),
  clientInstanceId: text("client_instance_id"),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * Manuel seçilen WhatsApp grup kaynakları.
 * chat_id kalıcı kimliktir; grup adı değişse bile aynı satır güncellenir.
 */
export const whatsappSourcesTable = pgTable(
  "whatsapp_sources",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    chatId: text("chat_id").notNull(),
    chatName: text("chat_name").notNull(),
    sourceType: text("source_type").notNull().default("group"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    initialScanStatus: text("initial_scan_status").notNull().default("pending"),
    initialScanStartedAt: timestamp("initial_scan_started_at", { withTimezone: true }),
    initialScanCompletedAt: timestamp("initial_scan_completed_at", { withTimezone: true }),
    oldestReachedAt: timestamp("oldest_reached_at", { withTimezone: true }),
    /** WhatsApp message.id._serialized */
    latestScannedMessageId: text("latest_scanned_message_id"),
    /** Unix saniye (whatsapp-web.js message.timestamp) */
    latestScannedTimestamp: bigint("latest_scanned_timestamp", { mode: "number" }),
    latestScannedAt: timestamp("latest_scanned_at", { withTimezone: true }),
    lastError: text("last_error"),
    /** sources tablosu ile processMessage uyumu */
    legacySourceId: integer("legacy_source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("whatsapp_sources_session_chat_uidx").on(t.sessionId, t.chatId),
    index("whatsapp_sources_enabled_idx").on(t.isEnabled),
    index("whatsapp_sources_scan_status_idx").on(t.initialScanStatus),
  ],
);

export const whatsappProcessedMessagesTable = pgTable(
  "whatsapp_processed_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    chatId: text("chat_id").notNull(),
    messageId: text("message_id").notNull(),
    messageTimestamp: bigint("message_timestamp", { mode: "number" }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    result: text("result").notNull(),
    jobPostingId: integer("job_posting_id"),
    contentHash: text("content_hash"),
  },
  (t) => [
    uniqueIndex("whatsapp_processed_msg_uidx").on(t.sessionId, t.chatId, t.messageId),
    index("whatsapp_processed_hash_idx").on(t.contentHash),
  ],
);

export const whatsappScanJobsTable = pgTable(
  "whatsapp_scan_jobs",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    sourceId: integer("source_id"),
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("whatsapp_scan_jobs_status_idx").on(t.status),
    index("whatsapp_scan_jobs_source_idx").on(t.sourceId),
    index("whatsapp_scan_jobs_type_idx").on(t.type),
  ],
);

export type WhatsAppSession = typeof whatsappSessionsTable.$inferSelect;
export type WhatsAppSource = typeof whatsappSourcesTable.$inferSelect;
export type WhatsAppProcessedMessage = typeof whatsappProcessedMessagesTable.$inferSelect;
export type WhatsAppScanJob = typeof whatsappScanJobsTable.$inferSelect;
