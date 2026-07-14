-- Location Classifier V2 — extensions + trigram indexes
-- Çalıştırma: psql $DATABASE_URL -f lib/db/sql/locations-v2-extensions.sql
-- veya npm run locations:sync (ensureExtensions içinde otomatik)

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- PostGIS ortamda varsa:
-- CREATE EXTENSION IF NOT EXISTS postgis;

CREATE INDEX IF NOT EXISTS locations_normalized_name_trgm
  ON locations USING gin (normalized_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS location_aliases_normalized_trgm
  ON location_aliases USING gin (normalized_alias gin_trgm_ops);
