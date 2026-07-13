import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { sourcesTable } from "./sources";

export const importedPostsTable = pgTable("imported_posts", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => sourcesTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  externalId: text("external_id").notNull(),
  rawText: text("raw_text").notNull(),
  sourceUrl: text("source_url"),
  duplicateHash: text("duplicate_hash").notNull(),
  isJob: boolean("is_job").notNull().default(false),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
