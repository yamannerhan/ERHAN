import { listingsTable } from "@workspace/db";
import { and, eq, gt, isNull, ne, or } from "drizzle-orm";

/** Arama motorlarına açılabilecek yayınlanmış ilanların ortak SEO filtresi. */
export function indexableListingCondition(now = new Date()) {
  return and(
    eq(listingsTable.status, "active"),
    eq(listingsTable.isActive, true),
    or(isNull(listingsTable.sourceTag), ne(listingsTable.sourceTag, "demo")),
    isNull(listingsTable.mergedIntoListingId),
    or(isNull(listingsTable.expiresAt), gt(listingsTable.expiresAt, now)),
  );
}
