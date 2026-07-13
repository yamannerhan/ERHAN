import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Hamburger menü — Yönetim Ekibi (admin panelinden yönetilir) */
export const managementTeamTable = pgTable("management_team", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  displayName: text("display_name").notNull(),
  roleName: text("role_name").notNull().default("Moderatör"),
  title: text("title"),
  avatarPath: text("avatar_path"),
  nameColor: text("name_color").notNull().default("#F5C518"),
  badgeColor: text("badge_color").notNull().default("#94A3B8"),
  profileUrl: text("profile_url"),
  isOnlineVisible: boolean("is_online_visible").notNull().default(true),
  isVisible: boolean("is_visible").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertManagementTeamSchema = createInsertSchema(managementTeamTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertManagementTeam = z.infer<typeof insertManagementTeamSchema>;
export type ManagementTeam = typeof managementTeamTable.$inferSelect;
