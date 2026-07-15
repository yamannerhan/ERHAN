-- Salt okunur plan kontrolü. Production benzeri veri üzerinde manuel çalıştırın.
-- ANALYZE sorguları SELECT'tir; veri değiştirmez.

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id
FROM imported_posts
WHERE source_id = 1 AND external_id = 'example'
LIMIT 1;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id
FROM listings
WHERE source_id = 1 AND message_id = 'example'
LIMIT 1;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, title, company, city, source_published_at, first_seen_at, created_at
FROM listings
WHERE status = 'active'
  AND is_active = true
  AND merged_into_listing_id IS NULL
  AND (source_tag IS NULL OR source_tag <> 'demo')
  AND COALESCE(first_seen_at, created_at) >= NOW() - INTERVAL '15 days'
ORDER BY COALESCE(source_published_at, first_seen_at, created_at) DESC
LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, source_id, status, created_at
FROM pending_jobs
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, platform, last_checked_at
FROM sources
WHERE platform = 'telegram' AND active = true
ORDER BY last_checked_at NULLS FIRST;
