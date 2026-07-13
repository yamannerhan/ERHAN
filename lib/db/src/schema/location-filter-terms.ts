import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const locationFilterTermsTable = pgTable("location_filter_terms", {
  id: serial("id").primaryKey(),
  province: text("province").notNull(),
  term: text("term").notNull(),
  display: text("display"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLocationFilterTermSchema = createInsertSchema(locationFilterTermsTable).omit({ id: true, createdAt: true });
export type InsertLocationFilterTerm = z.infer<typeof insertLocationFilterTermSchema>;
export type LocationFilterTerm = typeof locationFilterTermsTable.$inferSelect;