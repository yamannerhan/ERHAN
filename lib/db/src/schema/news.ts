import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";

export const newsSourcesTable = pgTable(
  "news_sources",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    listingUrl: text("listing_url"),
    providerKey: text("provider_key").notNull().default("ozel_guvenlik_ajans"),
    isActive: boolean("is_active").notNull().default(true),
    scanIntervalMinutes: integer("scan_interval_minutes").notNull().default(30),
    initialLookbackDays: integer("initial_lookback_days").notNull().default(10),
    /** full | excerpt */
    importMode: text("import_mode").notNull().default("full"),
    downloadImages: boolean("download_images").notNull().default(false),
    showSource: boolean("show_source").notNull().default(false),
    showSourceLink: boolean("show_source_link").notNull().default(false),
    /** auto | draft */
    publishMode: text("publish_mode").notNull().default("auto"),
    lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    initialScanDone: boolean("initial_scan_done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("news_sources_active_idx").on(t.isActive),
    index("news_sources_provider_idx").on(t.providerKey),
  ],
);

export const newsArticlesTable = pgTable(
  "news_articles",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt"),
    content: text("content"),
    coverImage: text("cover_image"),
    category: text("category").notNull().default("Genel Haberler"),
    authorName: text("author_name"),
    sourceId: integer("source_id"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    canonicalUrl: text("canonical_url"),
    sourceExternalId: text("source_external_id"),
    sourceHash: text("source_hash").notNull(),
    sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    /** draft | published | hidden | archived | failed */
    status: text("status").notNull().default("draft"),
    /** full | excerpt | manual */
    publicationType: text("publication_type").notNull().default("excerpt"),
    isManual: boolean("is_manual").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    viewCount: integer("view_count").notNull().default(0),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    tags: jsonb("tags").$type<string[]>().default([]),
    createdBy: integer("created_by"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("news_articles_slug_uidx").on(t.slug),
    uniqueIndex("news_articles_source_url_uidx").on(t.sourceUrl),
    uniqueIndex("news_articles_source_hash_uidx").on(t.sourceHash),
    index("news_articles_status_pub_idx").on(t.status, t.publishedAt),
    index("news_articles_category_idx").on(t.category),
  ],
);

export const newsImportLogsTable = pgTable(
  "news_import_logs",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("running"),
    discoveredCount: integer("discovered_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    errorMessage: text("error_message"),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
  },
  (t) => [
    index("news_import_logs_source_idx").on(t.sourceId),
    index("news_import_logs_started_idx").on(t.startedAt),
  ],
);

/** Admin silinen haberler — reset/tarama sonrası geri yüklenmez */
export const newsDeletedUrlsTable = pgTable(
  "news_deleted_urls",
  {
    id: serial("id").primaryKey(),
    sourceUrl: text("source_url").notNull(),
    canonicalUrl: text("canonical_url"),
    sourceHash: text("source_hash"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
    deletedBy: integer("deleted_by"),
    reason: text("reason"),
  },
  (t) => [
    uniqueIndex("news_deleted_urls_source_url_uidx").on(t.sourceUrl),
  ],
);

export type NewsSource = typeof newsSourcesTable.$inferSelect;
export type NewsArticle = typeof newsArticlesTable.$inferSelect;
export type NewsImportLog = typeof newsImportLogsTable.$inferSelect;
export type NewsDeletedUrl = typeof newsDeletedUrlsTable.$inferSelect;
