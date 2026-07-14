import { companyProfilesTable, db, listingsTable } from "@workspace/db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

export type ListingCompanyOverlay = {
  logoPath: string | null;
  isVerified: boolean;
};

type ListingIdentity = Pick<
  typeof listingsTable.$inferSelect,
  "id" | "authorId" | "companyProfileId"
>;

/** İlan tablosundaki eski logo yolunu aktif firma profilindeki güncel logo ile örter. */
export async function loadListingCompanyOverlays(
  listings: ListingIdentity[],
): Promise<Map<number, ListingCompanyOverlay>> {
  if (listings.length === 0) return new Map();

  const profileIds = [...new Set(
    listings.map((listing) => listing.companyProfileId).filter((id): id is number => id != null),
  )];
  const authorIds = [...new Set(
    listings.map((listing) => listing.authorId).filter((id): id is number => id != null),
  )];
  if (profileIds.length === 0 && authorIds.length === 0) return new Map();

  const identityCondition = or(
    ...(profileIds.length ? [inArray(companyProfilesTable.id, profileIds)] : []),
    ...(authorIds.length ? [inArray(companyProfilesTable.userId, authorIds)] : []),
  );
  if (!identityCondition) return new Map();

  const profiles = await db
    .select({
      id: companyProfilesTable.id,
      userId: companyProfilesTable.userId,
      logoPath: companyProfilesTable.logoPath,
      isVerified: companyProfilesTable.isVerified,
    })
    .from(companyProfilesTable)
    .where(and(
      identityCondition,
      eq(companyProfilesTable.isActive, true),
      isNull(companyProfilesTable.deletedAt),
    ));

  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  const overlays = new Map<number, ListingCompanyOverlay>();
  for (const listing of listings) {
    const profile = (listing.companyProfileId ? byId.get(listing.companyProfileId) : undefined)
      ?? (listing.authorId ? byUser.get(listing.authorId) : undefined);
    if (!profile) continue;
    overlays.set(listing.id, {
      logoPath: profile.logoPath,
      isVerified: profile.isVerified,
    });
  }
  return overlays;
}
