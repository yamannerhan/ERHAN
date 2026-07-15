-- UP: responsive home banner fields
ALTER TABLE banners ADD COLUMN IF NOT EXISTS mobile_image_url TEXT;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS mobile_image_data TEXT;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS cta_label TEXT;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS alt_text TEXT;

-- DOWN (manual rollback; existing banner rows remain intact)
-- ALTER TABLE banners DROP COLUMN IF EXISTS alt_text;
-- ALTER TABLE banners DROP COLUMN IF EXISTS cta_label;
-- ALTER TABLE banners DROP COLUMN IF EXISTS subtitle;
-- ALTER TABLE banners DROP COLUMN IF EXISTS mobile_image_data;
-- ALTER TABLE banners DROP COLUMN IF EXISTS mobile_image_url;
