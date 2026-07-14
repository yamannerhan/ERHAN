import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // user | moderator | senior_moderator | admin
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
  freeFeatureUsed: integer("free_feature_used").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  avatarFrame: text("avatar_frame").notNull().default("none"),
  avatarFrameExpiresAt: timestamp("avatar_frame_expires_at", { withTimezone: true }),
  chatBubble: text("chat_bubble").notNull().default("default"),
  chatBubbleExpiresAt: timestamp("chat_bubble_expires_at", { withTimezone: true }),
  notifListings: boolean("notif_listings").notNull().default(true),
  notifJoin: boolean("notif_join").notNull().default(true),
  notifSite: boolean("notif_site").notNull().default(true),
  notifOther: boolean("notif_other").notNull().default(true),
  notifSound: boolean("notif_sound").notNull().default(true),
  notifChatSound: boolean("notif_chat_sound").notNull().default(true),
  notifOnlyBackground: boolean("notif_only_background").notNull().default(true),
  /** user | bot | system */
  accountType: text("account_type").notNull().default("user"),
  isSystemAccount: boolean("is_system_account").notNull().default(false),
  isVerifiedPublisher: boolean("is_verified_publisher").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: integer("verified_by"),
  /** individual | company | authorized_representative */
  verificationType: text("verification_type"),
  verificationNote: text("verification_note"),
  /** unverified | pending | verified | rejected | suspended */
  verificationStatus: text("verification_status").notNull().default("unverified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
