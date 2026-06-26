import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { sourcesTable } from "./sources";
import { importedPostsTable } from "./imported-posts";

export const pendingJobsTable = pgTable("pending_jobs", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => sourcesTable.id, { onDelete: "cascade" }),
  importedPostId: integer("imported_post_id").references(() => importedPostsTable.id, { onDelete: "set null" }),
  rawText: text("raw_text").notNull(),
  title: text("title"),
  company: text("company"),
  city: text("city"),
  salary: text("salary"),
  phone: text("phone"),
  description: text("description"),
  applicationUrl: text("application_url"),
  sourceUrl: text("source_url"),
  platform: text("platform").notNull().default("telegram"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | published | error
  duplicateHash: text("duplicate_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
