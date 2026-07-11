import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // listing | message | admin | system | support
  title: text("title"),
  message: text("message").notNull(),
  relatedId: integer("related_id"),
  isRead: boolean("is_read").notNull().default(false),
  linkUrl: text("link_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isPinned: boolean("is_pinned").notNull().default(false),
  /** home = ana sayfa kayan yazı, chat = sohbet duyurusu */
  placement: text("placement").notNull().default("home"),
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
  /** Sohbet kayan yazı duyurusu */
  chatTickerMessage: text("chat_ticker_message"),
  /** Sohbet sabit duyuru */
  chatPinnedMessage: text("chat_pinned_message"),
  hiddenListingCities: text("hidden_listing_cities").notNull().default("[]"),
  botGuvenlikEnabled: boolean("bot_guvenlik_enabled").notNull().default(true),
  botBilgiEnabled: boolean("bot_bilgi_enabled").notNull().default(true),
  botFakeEnabled: boolean("bot_fake_enabled").notNull().default(true),
  /** Telegram tarama aralığı (dakika): 1, 5, 10 veya 30 */
  telegramScanIntervalMinutes: integer("telegram_scan_interval_minutes").notNull().default(10),
  /** Web Push (PWA/tarayıcı) canlı bildirimler */
  pushEnabled: boolean("push_enabled").notNull().default(true),
  pushOnNewListing: boolean("push_on_new_listing").notNull().default(true),
  pushOnChatReply: boolean("push_on_chat_reply").notNull().default(true),
  pushSoundEnabled: boolean("push_sound_enabled").notNull().default(true),
  /** off | daily | weekly | monthly — özet bildirim */
  pushDigestMode: text("push_digest_mode").notNull().default("off"),
  pushDigestLastSentAt: timestamp("push_digest_last_sent_at", { withTimezone: true }),
  vapidPublicKey: text("vapid_public_key"),
  vapidPrivateKey: text("vapid_private_key"),
  /** Gerçek kullanıcı sohbete katılınca push */
  pushOnUserJoin: boolean("push_on_user_join").notNull().default(true),
  /** Bildirim sesi URL'leri (tür bazlı; boşsa sistem sesi) */
  pushSoundListingUrl: text("push_sound_listing_url"),
  pushSoundJoinUrl: text("push_sound_join_url"),
  pushSoundReplyUrl: text("push_sound_reply_url"),
  pushSoundCampaignUrl: text("push_sound_campaign_url"),
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
