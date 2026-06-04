import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partTimeWorkersTable = pgTable("part_time_workers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fullName: text("full_name").notNull(),
  age: integer("age").notNull(),
  isRetired: boolean("is_retired").notNull().default(false),
  gender: text("gender").notNull().default("Bay"), // Bay | Bayan
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  district: text("district").notNull(),
  hasVehicle: text("has_vehicle").notNull().default("Yok"), // Yok | Motor | Araba
  description: text("description"),
  photoUrl: text("photo_url"),
  isFeatured: boolean("is_featured").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  banReason: text("ban_reason"),
  status: text("status").notNull().default("active"), // active | banned
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartTimeWorkerSchema = createInsertSchema(partTimeWorkersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartTimeWorker = z.infer<typeof insertPartTimeWorkerSchema>;
export type PartTimeWorker = typeof partTimeWorkersTable.$inferSelect;
