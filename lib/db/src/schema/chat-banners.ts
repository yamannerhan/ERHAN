import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Sohbet penceresi — otomatik kayan duyuru bannerları */
export const chatBannersTable = pgTable("chat_banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("megaphone"),
  iconColor: text("icon_color").notNull().default("#F5C518"),
  titleColor: text("title_color").notNull().default("#F5C518"),
  linkType: text("link_type"),
  linkUrl: text("link_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertChatBannerSchema = createInsertSchema(chatBannersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertChatBanner = z.infer<typeof insertChatBannerSchema>;
export type ChatBanner = typeof chatBannersTable.$inferSelect;
