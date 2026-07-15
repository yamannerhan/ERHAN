-- Performans migrationı: veri/kolon değiştirmez.
-- CONCURRENTLY nedeniyle transaction dışında çalıştırılmalıdır.

CREATE INDEX CONCURRENTLY IF NOT EXISTS listings_active_feed_date_idx
  ON listings ((COALESCE(source_published_at, first_seen_at, created_at)) DESC)
  WHERE status = 'active'
    AND is_active = true
    AND merged_into_listing_id IS NULL
    AND (source_tag IS NULL OR source_tag <> 'demo');

CREATE INDEX CONCURRENTLY IF NOT EXISTS listings_active_city_date_idx
  ON listings (city, (COALESCE(source_published_at, first_seen_at, created_at)) DESC)
  WHERE status = 'active'
    AND is_active = true
    AND merged_into_listing_id IS NULL
    AND (source_tag IS NULL OR source_tag <> 'demo');

CREATE INDEX CONCURRENTLY IF NOT EXISTS listings_active_featured_date_idx
  ON listings (is_featured, (COALESCE(source_published_at, first_seen_at, created_at)) DESC)
  WHERE status = 'active'
    AND is_active = true
    AND merged_into_listing_id IS NULL
    AND (source_tag IS NULL OR source_tag <> 'demo');

CREATE INDEX CONCURRENTLY IF NOT EXISTS listing_likes_user_listing_idx
  ON listing_likes (user_id, listing_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS listing_favorites_user_listing_idx
  ON listing_favorites (user_id, listing_id);
