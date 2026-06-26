import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const ipBansTable = pgTable("ip_bans", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  reason: text("reason"),
  bannedBy: integer("banned_by").notNull(),
  bannedUntil: timestamp("banned_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deviceBansTable = pgTable("device_bans", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  reason: text("reason"),
  bannedBy: integer("banned_by").notNull(),
  bannedUntil: timestamp("banned_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
