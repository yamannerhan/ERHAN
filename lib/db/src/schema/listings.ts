import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  city: text("city").notNull(),
  salary: text("salary"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  workType: text("work_type").notNull().default("Tam Zamanlı"),
  description: text("description"),
  requirements: text("requirements"),
  status: text("status").notNull().default("active"),
  isActive: boolean("is_active").notNull().default(true),
  viewCount: integer("view_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),
  isFeatured: boolean("is_featured").notNull().default(false),
  /** Öne çıkarma bitiş zamanı (ücretsiz 3 gün / ücretli) */
  featuredUntil: timestamp("featured_until", { withTimezone: true }),
  /** Bu öne çıkarma ücretsiz kontenjandan mı kullanıldı */
  featuredIsFree: boolean("featured_is_free").notNull().default(false),
  cardTheme: text("card_theme"),
  applyUrl: text("apply_url"),
  // Otomatik içe aktarılan ilanların kaynağı ('telegram'/'facebook'); elle eklenenlerde null
  sourceTag: text("source_tag"),
  sourceId: integer("source_id"),
  messageId: text("message_id"),
  sourceUrl: text("source_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  rawText: text("raw_text"),
  companyLogoUrl: text("company_logo_url"),
  authorId: integer("author_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  autoDeleteOnExpiry: boolean("auto_delete_on_expiry").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const listingLikesTable = pgTable("listing_likes", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const listingFavoritesTable = pgTable("listing_favorites", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
