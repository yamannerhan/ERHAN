import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const sourcesTable = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  platform: text("platform").notNull(), // 'telegram' | 'facebook'
  url: text("url").notNull(),
  apiToken: text("api_token"),
  active: boolean("active").notNull().default(true),
  status: text("status").notNull().default("active"),
  checkInterval: integer("check_interval").notNull().default(15), // minutes
  autoPublish: boolean("auto_publish").notNull().default(false),
  requireApproval: boolean("require_approval").notNull().default(true),
  targetCities: text("target_cities").array(),
  publishOnlyTargetCities: boolean("publish_only_target_cities").notNull().default(false),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  totalImported: integer("total_imported").notNull().default(0),
  telegramChatId: text("telegram_chat_id"),
  lastTelegramMessageId: text("last_telegram_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
