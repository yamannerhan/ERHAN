import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const sourcesTable = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  platform: text("platform").notNull(), // 'telegram' | 'facebook'
  url: text("url").notNull(),
  active: boolean("active").notNull().default(true),
  checkInterval: integer("check_interval").notNull().default(15), // minutes
  autoPublish: boolean("auto_publish").notNull().default(false),
  requireApproval: boolean("require_approval").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  totalImported: integer("total_imported").notNull().default(0),
  telegramChatId: text("telegram_chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
