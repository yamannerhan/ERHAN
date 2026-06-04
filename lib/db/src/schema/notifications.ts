import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // listing | message | admin | system
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  linkUrl: text("link_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminSettingsTable = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  chatLocked: boolean("chat_locked").notNull().default(false),
  fakeOnlineBonus: integer("fake_online_bonus").notNull().default(0),
  fakeOnlineMin: integer("fake_online_min").notNull().default(0),
  fakeOnlineMax: integer("fake_online_max").notNull().default(0),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  welcomeMessage: text("welcome_message"),
  openaiApiKey: text("openai_api_key"),
  spamCooldown: integer("spam_cooldown").notNull().default(3),
  chatAnnounceListings: boolean("chat_announce_listings").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const chatRulesTable = pgTable("chat_rules", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bannedWordsTable = pgTable("banned_words", {
  id: serial("id").primaryKey(),
  word: text("word").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
