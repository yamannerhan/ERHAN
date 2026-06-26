import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // user | moderator | admin
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  nameColor: text("name_color"),
  nameAnimated: boolean("name_animated").notNull().default(false),
  isVip: boolean("is_vip").notNull().default(false),
  vipUntil: timestamp("vip_until", { withTimezone: true }),
  displayName: text("display_name"),
  fullName: text("full_name"),
  phone: text("phone"),
  birthDate: text("birth_date"),
  height: text("height"),
  weight: text("weight"),
  address: text("address"),
  maritalStatus: text("marital_status"),
  isBanned: boolean("is_banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpiresAt: timestamp("ban_expires_at", { withTimezone: true }),
  mutedUntil: timestamp("muted_until", { withTimezone: true }),
  lastKnownIp: text("last_known_ip"),
  lastDeviceId: text("last_device_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
