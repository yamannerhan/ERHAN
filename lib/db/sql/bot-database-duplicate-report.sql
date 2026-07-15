-- Salt okunur: unique index migrationından ÖNCE çalıştırın.
-- Satır silmez/değiştirmez.

SELECT duplicate_hash, count(*) AS duplicate_count,
       min(id) AS first_id, array_agg(id ORDER BY id) AS ids
FROM imported_posts
GROUP BY duplicate_hash
HAVING count(*) > 1
ORDER BY duplicate_count DESC, first_id;

SELECT source_id, external_id, count(*) AS duplicate_count,
       array_agg(id ORDER BY id) AS ids
FROM imported_posts
GROUP BY source_id, external_id
HAVING count(*) > 1
ORDER BY duplicate_count DESC, source_id;

SELECT source_id, message_id, count(*) AS duplicate_count,
       array_agg(id ORDER BY id) AS ids
FROM listings
WHERE source_id IS NOT NULL AND message_id IS NOT NULL
GROUP BY source_id, message_id
HAVING count(*) > 1
ORDER BY duplicate_count DESC, source_id;

SELECT imported_post_id, count(*) AS duplicate_count,
       array_agg(id ORDER BY id) AS ids
FROM pending_jobs
WHERE imported_post_id IS NOT NULL
GROUP BY imported_post_id
HAVING count(*) > 1
ORDER BY duplicate_count DESC, imported_post_id;

SELECT platform, url, count(*) AS duplicate_count,
       array_agg(id ORDER BY id) AS ids
FROM sources
GROUP BY platform, url
HAVING count(*) > 1
ORDER BY duplicate_count DESC, platform;
