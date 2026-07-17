import { pgTable, text, serial, timestamp, boolean, integer, index, numeric, bigint, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const listingsTable = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    city: text("city").notNull(),
    /** SEO slug: baslik-ilce-sehir — unique, not null (backfill sonrası) */
    slug: text("slug").notNull().default("ilan"),
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
    featuredUntil: timestamp("featured_until", { withTimezone: true }),
    featuredIsFree: boolean("featured_is_free").notNull().default(false),
    cardTheme: text("card_theme"),
    applyUrl: text("apply_url"),
    // Platform etiketi: telegram | whatsapp | eleman | demo | null
    sourceTag: text("source_tag"),
    sourceId: integer("source_id"),
    messageId: text("message_id"),
    sourceUrl: text("source_url"),
    /** direct_user | direct_company | bot_imported | admin_created */
    sourceType: text("source_type"),
    /** Bot / platform adı: Telegram, WhatsApp, Eleman.net, ... */
    sourceName: text("source_name"),
    sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    directPriorityUntil: timestamp("direct_priority_until", { withTimezone: true }),
    freshnessConfirmedAt: timestamp("freshness_confirmed_at", { withTimezone: true }),
    verifiedPublisher: boolean("verified_publisher").notNull().default(false),
    /** Yayın anındaki doğrulama bilgisi JSON */
    verificationSnapshot: text("verification_snapshot"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    rawText: text("raw_text"),
    companyLogoUrl: text("company_logo_url"),
    companyProfileId: integer("company_profile_id"),
    authorId: integer("author_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    autoDeleteOnExpiry: boolean("auto_delete_on_expiry").notNull().default(true),
    lastRenewedAt: timestamp("last_renewed_at", { withTimezone: true }),
    mergedIntoListingId: integer("merged_into_listing_id"),
    /** Normalize edilmiş ilan metni hash (WhatsApp çapraz-grup dedup) */
    contentHash: text("content_hash"),
    /** Kaynak WhatsApp mesaj kimliği (message.id._serialized) */
    sourceMessageId: text("source_message_id"),
    /** Kaynak WhatsApp chat/group JID */
    sourceChatId: text("source_chat_id"),
    /** Kaynak mesaj Unix ms */
    sourceMessageTimestamp: bigint("source_message_timestamp", { mode: "number" }),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    locationAccuracy: text("location_accuracy"),
    locationSource: text("location_source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("listings_company_profile_id_idx").on(t.companyProfileId),
    index("listings_lat_lng_idx").on(t.latitude, t.longitude),
    index("listings_source_type_idx").on(t.sourceType),
    index("listings_direct_priority_until_idx").on(t.directPriorityUntil),
    index("listings_verified_publisher_idx").on(t.verifiedPublisher),
    index("listings_content_hash_idx").on(t.contentHash),
    index("listings_source_message_id_idx").on(t.sourceMessageId),
    uniqueIndex("listings_slug_uidx").on(t.slug),
  ],
);

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
