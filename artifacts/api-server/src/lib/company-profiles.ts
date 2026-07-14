import { db, companyProfilesTable, usersTable, listingsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import crypto from "node:crypto";

let schemaReady = false;

function persistentLogoPath(profileId: number, logoData: string): string {
  const version = crypto.createHash("sha256").update(logoData).digest("hex").slice(0, 12);
  return `/api/company-logos/profile_${profileId}_${version}.webp`;
}

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
      logo_data TEXT,
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
  await db.execute(sql`ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS logo_data TEXT`);
  await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS company_profile_id INTEGER`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_company_profile_id_idx ON listings (company_profile_id)`);
  schemaReady = true;
}

function cleanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/^tel:/i, "").trim().slice(0, 40);
  return s || null;
}

/**
 * İlan formundaki temel işveren bilgilerini hatırla (sonraki ilanda otomatik gelsin).
 * Açıklama (listing description) ASLA şirket profiline yazılmaz.
 */
export async function rememberEmployerBasics(
  userId: number,
  opts: {
    companyName?: string | null;
    phone?: string | null;
    logoPath?: string | null;
    contactName?: string | null;
  },
): Promise<{ id: number; logoPath: string | null } | null> {
  await ensureCompanySchema();

  const companyName = (opts.companyName ?? "").trim();
  const phone = cleanPhone(opts.phone);
  const incomingLogo = opts.logoPath?.trim() || null;
  const logoDataMatch = incomingLogo?.match(/^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i);
  const incomingLogoData = logoDataMatch?.[1] ?? null;
  const logoPath = incomingLogoData ? null : incomingLogo;
  const contactName = opts.contactName?.trim().slice(0, 64) || null;
  const usableName = companyName && companyName !== "Belirtilmedi" ? companyName.slice(0, 120) : null;

  const [existing] = await db
    .select()
    .from(companyProfilesTable)
    .where(and(eq(companyProfilesTable.userId, userId), isNull(companyProfilesTable.deletedAt)))
    .limit(1);

  let profileId: number | null = existing?.id ?? null;
  let savedLogoPath: string | null = existing?.logoPath ?? null;

  if (existing) {
    const patch: Partial<typeof companyProfilesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (usableName) patch.companyName = usableName;
    if (phone) patch.phone = phone;
    if (incomingLogoData) {
      savedLogoPath = persistentLogoPath(existing.id, incomingLogoData);
      patch.logoPath = savedLogoPath;
      patch.logoData = incomingLogoData;
    } else if (logoPath) {
      savedLogoPath = logoPath;
      patch.logoPath = logoPath;
    }
    // description dokunulmaz
    if (Object.keys(patch).length > 1) {
      await db.update(companyProfilesTable).set(patch).where(eq(companyProfilesTable.id, existing.id));
    }
  } else if (usableName) {
    const [inserted] = await db
      .insert(companyProfilesTable)
      .values({
        userId,
        companyName: usableName,
        phone,
        logoPath,
        logoData: incomingLogoData,
        isActive: true,
      })
      .returning({ id: companyProfilesTable.id });
    profileId = inserted?.id ?? null;

    if (profileId) {
      if (incomingLogoData) {
        savedLogoPath = persistentLogoPath(profileId, incomingLogoData);
        await db.update(companyProfilesTable)
          .set({ logoPath: savedLogoPath })
          .where(eq(companyProfilesTable.id, profileId));
      } else {
        savedLogoPath = logoPath;
      }
      await db
        .update(listingsTable)
        .set({ companyProfileId: profileId })
        .where(
          and(
            eq(listingsTable.authorId, userId),
            sql`(${listingsTable.companyProfileId} IS NULL OR ${listingsTable.companyProfileId} = ${profileId})`,
          ),
        );
    }
  }

  const userPatch: Partial<typeof usersTable.$inferInsert> = {};
  if (contactName) userPatch.fullName = contactName;
  if (phone) userPatch.phone = phone;
  if (Object.keys(userPatch).length > 0) {
    await db.update(usersTable).set(userPatch).where(eq(usersTable.id, userId));
  }

  return profileId ? { id: profileId, logoPath: savedLogoPath } : null;
}
