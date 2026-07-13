import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let schemaReady = false;

/** company_profiles + listings.company_profile_id — güvenli bootstrap */
export async function ensureCompanySchema(): Promise<void> {
  if (schemaReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS company_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      company_name TEXT NOT NULL,
      legal_name TEXT,
      logo_path TEXT,
      description TEXT,
      website TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      district TEXT,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS company_profiles_user_id_uidx ON company_profiles (user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS company_profiles_company_name_idx ON company_profiles (company_name)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS company_profiles_is_verified_idx ON company_profiles (is_verified)`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS company_profile_id INTEGER`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_company_profile_id_idx ON listings (company_profile_id)`);
  schemaReady = true;
}
