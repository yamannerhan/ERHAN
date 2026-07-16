import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let listingSourceReady = false;
let publisherVerifyReady = false;
let backfillDone = false;

export async function ensureListingSourceSchema(): Promise<void> {
  if (listingSourceReady) return;
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_type TEXT`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_name TEXT`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_published_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS direct_priority_until TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS freshness_confirmed_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS verified_publisher BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS verification_snapshot TEXT`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS merged_into_listing_id INTEGER`);
  // WhatsApp bot şema alanları — yoksa /api/listings 500 verir
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS content_hash TEXT`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_message_id TEXT`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_chat_id TEXT`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_message_timestamp BIGINT`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_source_type_idx ON listings (source_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_direct_priority_until_idx ON listings (direct_priority_until)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_verified_publisher_idx ON listings (verified_publisher)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_content_hash_idx ON listings (content_hash)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_source_message_id_idx ON listings (source_message_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS listing_source_history (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER NOT NULL,
      source_type TEXT,
      source_name TEXT,
      source_url TEXT,
      first_seen_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      related_listing_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listing_source_history_listing_idx ON listing_source_history (listing_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS listing_priority_history (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER NOT NULL,
      priority_type TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ,
      reason TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listing_priority_history_listing_idx ON listing_priority_history (listing_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS listing_merge_queue (
      id SERIAL PRIMARY KEY,
      primary_listing_id INTEGER NOT NULL,
      candidate_listing_id INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      reviewed_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listing_merge_queue_status_idx ON listing_merge_queue (status)`);

  listingSourceReady = true;
}

export async function ensurePublisherVerifySchema(): Promise<void> {
  if (publisherVerifyReady) return;
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'user'`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system_account BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified_publisher BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_by INTEGER`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_type TEXT`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_note TEXT`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS publisher_verification_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      verification_type TEXT,
      note TEXT,
      verified_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS publisher_verification_history_user_idx ON publisher_verification_history (user_id)`);

  publisherVerifyReady = true;
}

/** Mevcut kayıtlara source_type backfill (bir kez, güvenli) */
export async function backfillListingSourceTypes(): Promise<void> {
  if (backfillDone) return;
  await ensureListingSourceSchema();
  await ensurePublisherVerifySchema();

  await db.execute(sql`
    UPDATE listings SET
      source_type = 'bot_imported',
      source_name = CASE
        WHEN source_tag = 'telegram' THEN 'Telegram'
        WHEN source_tag = 'whatsapp' THEN 'WhatsApp'
        WHEN source_tag = 'eleman' THEN 'Eleman.net'
        ELSE COALESCE(source_tag, 'Kaynak')
      END,
      source_published_at = COALESCE(source_published_at, published_at, first_seen_at, created_at),
      verified_publisher = FALSE
    WHERE source_type IS NULL
      AND source_tag IS NOT NULL
      AND source_tag IN ('telegram', 'whatsapp', 'eleman', 'demo')
  `);

  await db.execute(sql`
    UPDATE listings SET
      source_type = 'direct_company',
      verified_publisher = TRUE,
      source_name = COALESCE(source_name, 'ozelguvenlik.online')
    WHERE source_type IS NULL
      AND author_id IS NOT NULL
      AND (source_tag IS NULL OR source_tag = '')
      AND author_id IN (SELECT id FROM users WHERE is_verified_publisher = TRUE)
  `);

  await db.execute(sql`
    UPDATE listings SET
      source_type = 'admin_created',
      source_name = COALESCE(source_name, 'ozelguvenlik.online'),
      verified_publisher = FALSE
    WHERE source_type IS NULL
      AND author_id IS NOT NULL
      AND (source_tag IS NULL OR source_tag = '')
      AND author_id IN (SELECT id FROM users WHERE role IN ('admin', 'moderator', 'senior_moderator'))
  `);

  await db.execute(sql`
    UPDATE listings SET
      source_type = 'direct_user',
      source_name = COALESCE(source_name, 'ozelguvenlik.online'),
      verified_publisher = FALSE
    WHERE source_type IS NULL
      AND author_id IS NOT NULL
      AND (source_tag IS NULL OR source_tag = '')
  `);

  await db.execute(sql`
    UPDATE listings SET
      source_type = 'bot_imported',
      source_name = COALESCE(source_name, 'Kaynak'),
      verified_publisher = FALSE
    WHERE source_type IS NULL
  `);

  backfillDone = true;
}
