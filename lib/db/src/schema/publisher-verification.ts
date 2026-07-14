import { pgTable, text, serial, timestamp, integer, index, boolean } from "drizzle-orm/pg-core";

/** Hesap doğrulama geçmişi */
export const publisherVerificationHistoryTable = pgTable(
  "publisher_verification_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    status: text("status").notNull(),
    verificationType: text("verification_type"),
    note: text("note"),
    verifiedBy: integer("verified_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("publisher_verification_history_user_idx").on(t.userId)],
);

/** İlan kaynak geçmişi / bot ilişkilendirme */
export const listingSourceHistoryTable = pgTable(
  "listing_source_history",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id").notNull(),
    sourceType: text("source_type"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    relatedListingId: integer("related_listing_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_source_history_listing_idx").on(t.listingId)],
);

/** Öncelik geçmişi */
export const listingPriorityHistoryTable = pgTable(
  "listing_priority_history",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id").notNull(),
    priorityType: text("priority_type").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    reason: text("reason"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_priority_history_listing_idx").on(t.listingId)],
);

/** Şüpheli ilan birleştirme inceleme kuyruğu */
export const listingMergeQueueTable = pgTable(
  "listing_merge_queue",
  {
    id: serial("id").primaryKey(),
    primaryListingId: integer("primary_listing_id").notNull(),
    candidateListingId: integer("candidate_listing_id").notNull(),
    score: integer("score").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | merged | rejected
    reason: text("reason"),
    reviewedBy: integer("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    index("listing_merge_queue_status_idx").on(t.status),
  ],
);
