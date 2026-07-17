import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

let ready = false;

export async function ensureNewsSchema(): Promise<void> {
  if (ready) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS news_sources (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        listing_url TEXT,
        provider_key TEXT NOT NULL DEFAULT 'ozel_guvenlik_ajans',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        scan_interval_minutes INTEGER NOT NULL DEFAULT 30,
        initial_lookback_days INTEGER NOT NULL DEFAULT 10,
        import_mode TEXT NOT NULL DEFAULT 'full',
        download_images BOOLEAN NOT NULL DEFAULT FALSE,
        show_source BOOLEAN NOT NULL DEFAULT FALSE,
        show_source_link BOOLEAN NOT NULL DEFAULT FALSE,
        publish_mode TEXT NOT NULL DEFAULT 'auto',
        last_scan_at TIMESTAMPTZ,
        last_success_at TIMESTAMPTZ,
        last_error TEXT,
        initial_scan_done BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS news_articles (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        excerpt TEXT,
        content TEXT,
        cover_image TEXT,
        category TEXT NOT NULL DEFAULT 'Genel Haberler',
        author_name TEXT,
        source_id INTEGER,
        source_name TEXT,
        source_url TEXT,
        canonical_url TEXT,
        source_external_id TEXT,
        source_hash TEXT NOT NULL,
        source_published_at TIMESTAMPTZ,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ,
        archived_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL DEFAULT 'draft',
        publication_type TEXT NOT NULL DEFAULT 'excerpt',
        is_manual BOOLEAN NOT NULL DEFAULT FALSE,
        is_featured BOOLEAN NOT NULL DEFAULT FALSE,
        view_count INTEGER NOT NULL DEFAULT 0,
        meta_title TEXT,
        meta_description TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        created_by INTEGER,
        last_checked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS news_import_logs (
        id SERIAL PRIMARY KEY,
        source_id INTEGER,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'running',
        discovered_count INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        duplicate_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        details JSONB DEFAULT '{}'::jsonb
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS news_articles_slug_uidx ON news_articles (slug)`);
    await db.execute(sql`DROP INDEX IF EXISTS news_articles_source_url_uidx`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS news_articles_source_url_uidx
      ON news_articles (source_url) WHERE source_url IS NOT NULL
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS news_articles_source_hash_uidx ON news_articles (source_hash)`);
    await db.execute(sql`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS news_articles_status_pub_idx ON news_articles (status, published_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS news_articles_archived_idx ON news_articles (status, archived_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS news_sources_active_idx ON news_sources (is_active)`);
    await db.execute(sql`ALTER TABLE news_sources ALTER COLUMN initial_lookback_days SET DEFAULT 10`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS news_deleted_urls (
        id SERIAL PRIMARY KEY,
        source_url TEXT NOT NULL,
        canonical_url TEXT,
        source_hash TEXT,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_by INTEGER,
        reason TEXT
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS news_deleted_urls_source_url_uidx
      ON news_deleted_urls (source_url)
    `);
    ready = true;
  } catch (e) {
    logger.warn({ err: e }, "news: schema ensure failed");
  }
}
