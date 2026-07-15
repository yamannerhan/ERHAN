-- Transaction dışında çalıştırın: CREATE INDEX CONCURRENTLY transaction kabul etmez.
-- Önce bot-database-duplicate-report.sql çalıştırılmalıdır.
-- Duplicate varsa ilgili UNIQUE komutu güvenli şekilde hata verir; veri silmez.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS imported_posts_source_external_uidx
  ON imported_posts (source_id, external_id);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS imported_posts_duplicate_hash_uidx
  ON imported_posts (duplicate_hash);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS listings_source_message_uidx
  ON listings (source_id, message_id)
  WHERE source_id IS NOT NULL AND message_id IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS pending_jobs_imported_post_uidx
  ON pending_jobs (imported_post_id)
  WHERE imported_post_id IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS sources_platform_url_uidx
  ON sources (platform, url);

CREATE INDEX CONCURRENTLY IF NOT EXISTS imported_posts_status_created_idx
  ON imported_posts (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS pending_jobs_status_created_idx
  ON pending_jobs (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS listings_source_status_idx
  ON listings (source_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS sources_platform_active_checked_idx
  ON sources (platform, active, last_checked_at);
