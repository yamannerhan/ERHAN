-- Bana Uygun İşler tercihleri
CREATE TABLE IF NOT EXISTS user_job_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  preferred_cities JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_districts JSONB NOT NULL DEFAULT '[]'::jsonb,
  nearby_districts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  maximum_distance INTEGER,
  security_license_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  security_license_expiry TEXT,
  employment_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  shift_preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
  project_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  minimum_salary INTEGER,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience_level TEXT,
  preferred_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  driving_license BOOLEAN NOT NULL DEFAULT FALSE,
  driving_license_type TEXT,
  drives_actively BOOLEAN NOT NULL DEFAULT FALSE,
  src_certificate BOOLEAN NOT NULL DEFAULT FALSE,
  military_status TEXT,
  height TEXT,
  weight TEXT,
  education_level TEXT,
  experience_years TEXT,
  preferences_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_job_preferences_user_uidx ON user_job_preferences (user_id);
CREATE INDEX IF NOT EXISTS user_job_preferences_completed_idx ON user_job_preferences (preferences_completed);

CREATE INDEX IF NOT EXISTS listings_city_active_idx ON listings (city) WHERE status = 'active' AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS listings_work_type_idx ON listings (work_type);
CREATE INDEX IF NOT EXISTS listings_published_at_idx ON listings (published_at);
CREATE INDEX IF NOT EXISTS listings_status_active_idx ON listings (status, is_active);
