-- Transaction dışında çalıştırın.

DROP INDEX CONCURRENTLY IF EXISTS sources_platform_active_checked_idx;
DROP INDEX CONCURRENTLY IF EXISTS listings_source_status_idx;
DROP INDEX CONCURRENTLY IF EXISTS pending_jobs_status_created_idx;
DROP INDEX CONCURRENTLY IF EXISTS imported_posts_status_created_idx;
DROP INDEX CONCURRENTLY IF EXISTS sources_platform_url_uidx;
DROP INDEX CONCURRENTLY IF EXISTS pending_jobs_imported_post_uidx;
DROP INDEX CONCURRENTLY IF EXISTS listings_source_message_uidx;
DROP INDEX CONCURRENTLY IF EXISTS imported_posts_source_external_uidx;

-- Bu index uygulamanın exact-content idempotency korumasıdır.
-- Yalnız eski davranışa bilinçli dönüş gerekiyorsa ayrıca çalıştırın:
-- DROP INDEX CONCURRENTLY IF EXISTS imported_posts_duplicate_hash_uidx;
