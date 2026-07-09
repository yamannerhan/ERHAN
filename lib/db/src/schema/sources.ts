import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const sourcesTable = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  platform: text("platform").notNull(), // 'telegram' | 'facebook'
  url: text("url").notNull(),
  apiToken: text("api_token"),
  active: boolean("active").notNull().default(true),
  status: text("status").notNull().default("active"),
  checkInterval: integer("check_interval").notNull().default(1), // minutes
  autoPublish: boolean("auto_publish").notNull().default(true),
  requireApproval: boolean("require_approval").notNull().default(false),
  targetCities: text("target_cities").array(),
  publishOnlyTargetCities: boolean("publish_only_target_cities").notNull().default(false),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  totalImported: integer("total_imported").notNull().default(0),
  telegramChatId: text("telegram_chat_id"),
  lastTelegramMessageId: text("last_telegram_message_id"),
  /** İlk taramada geriye sayfalama imleci (GramJS offsetId) */
  initialScanOffsetId: text("initial_scan_offset_id"),
  initialScanDone: boolean("initial_scan_done").notNull().default(false),
  lastScanPublished: integer("last_scan_published").notNull().default(0),
  /** Aynı kaynakta eşzamanlı tarama engeli */
  isScanning: boolean("is_scanning").notNull().default(false),
  lastScanMessagesRead: integer("last_scan_messages_read").notNull().default(0),
  lastScanFound: integer("last_scan_found").notNull().default(0),
  lastScanAdded: integer("last_scan_added").notNull().default(0),
  lastScanDuplicates: integer("last_scan_duplicates").notNull().default(0),
  lastScanErrors: integer("last_scan_errors").notNull().default(0),
  /** İlk 30 gün taraması ilerlemesi (1–100) */
  initialScanProgress: integer("initial_scan_progress").notNull().default(0),
  /** backward = 30 gün sınırına git, forward = eskiden yeniye işle */
  initialScanPhase: text("initial_scan_phase"),
  initialScanAnchorId: text("initial_scan_anchor_id"),
  initialScanTopId: text("initial_scan_top_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
