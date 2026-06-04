import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const listingPublishGrantsTable = pgTable("listing_publish_grants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  grantedBy: integer("granted_by").notNull().references(() => usersTable.id),
  grantType: text("grant_type").notNull().default("unlimited"), // "unlimited" | "limited" | "timed"
  usesRemaining: integer("uses_remaining"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
