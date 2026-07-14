import { db, listingsTable, listingSourceHistoryTable, listingPriorityHistoryTable } from "@workspace/db";
import type { ResolvedListingSource } from "./listing-source";

/** Create path sonuçlarını listing insert alanlarına çevir */
export function listingSourceInsertFields(src: ResolvedListingSource) {
  return {
    sourceType: src.sourceType,
    sourceName: src.sourceName,
    sourceUrl: src.sourceUrl,
    sourcePublishedAt: src.sourcePublishedAt,
    verifiedPublisher: src.verifiedPublisher,
    verificationSnapshot: src.verificationSnapshot,
    directPriorityUntil: src.directPriorityUntil,
    freshnessConfirmedAt: src.freshnessConfirmedAt,
    firstSeenAt: src.firstSeenAt,
    lastSeenAt: src.lastSeenAt,
    lastCheckedAt: src.lastCheckedAt,
  };
}

export async function logListingSourceHistory(listingId: number, src: ResolvedListingSource, relatedListingId?: number | null): Promise<void> {
  try {
    await db.insert(listingSourceHistoryTable).values({
      listingId,
      sourceType: src.sourceType,
      sourceName: src.sourceName,
      sourceUrl: src.sourceUrl,
      firstSeenAt: src.firstSeenAt,
      lastSeenAt: src.lastSeenAt,
      relatedListingId: relatedListingId ?? null,
    });
  } catch { /* ignore */ }
}

export async function logListingPriority(
  listingId: number,
  priorityType: string,
  startsAt: Date,
  endsAt: Date | null,
  reason?: string | null,
  createdBy?: number | null,
): Promise<void> {
  try {
    await db.insert(listingPriorityHistoryTable).values({
      listingId,
      priorityType,
      startsAt,
      endsAt,
      reason: reason ?? null,
      createdBy: createdBy ?? null,
    });
  } catch { /* ignore */ }
}

export type RankableListing = typeof listingsTable.$inferSelect;

function hoursAgo(d: Date | null | undefined, now: number): number {
  if (!d) return 9999;
  return Math.max(0, (now - new Date(d).getTime()) / 3_600_000);
}

/** Sunucu tarafı önerilen sıralama skoru (yüksek = önce) */
export function computeRecommendedScore(l: RankableListing, now = Date.now()): number {
  const pub = l.sourcePublishedAt ?? l.firstSeenAt ?? l.createdAt;
  const ageH = hoursAgo(pub, now);
  // Güncellik: son 72 saatte yüksek puan
  let score = Math.max(0, 200 - ageH * 2);

  if (l.directPriorityUntil && new Date(l.directPriorityUntil).getTime() > now) {
    const remainingH = (new Date(l.directPriorityUntil).getTime() - now) / 3_600_000;
    score += 80 + Math.min(40, remainingH);
  }

  if (l.verifiedPublisher && (l.sourceType === "direct_company" || l.sourceType === "direct_user")) {
    score += 50;
  }

  if (l.sourceType === "direct_company") score += 25;
  else if (l.sourceType === "direct_user") score += 15;
  else if (l.sourceType === "admin_created") score += 10;

  if (l.isFeatured) score += 30;
  if (l.salary && !/belirtilmedi|görüşme/i.test(l.salary)) score += 12;
  if (l.companyLogoUrl) score += 8;
  if (l.city && !/belirtilmedi|türkiye/i.test(l.city)) score += 5;

  // Çok eski bot ilanları hafif cezalandır
  if (l.sourceType === "bot_imported" && ageH > 72) score -= 20;

  return score;
}

function isDirectSource(st: string | null | undefined): boolean {
  return st === "direct_user" || st === "direct_company";
}

function companyKey(company: string | null | undefined): string {
  return (company || "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

/**
 * Önerilen sıra: skor + ilk 10'da max ~4 doğrudan + firmadan max 2.
 * featured=true iken priority penceresindeki doğrudanlar öne alınır.
 */
export function rankListingsRecommended(
  rows: RankableListing[],
  opts?: { featured?: boolean; softDirectQuota?: number },
): RankableListing[] {
  const now = Date.now();
  const softDirectQuota = opts?.softDirectQuota ?? 4;
  const scored = [...rows].sort((a, b) => {
    if (opts?.featured) {
      const aPri = a.directPriorityUntil && new Date(a.directPriorityUntil).getTime() > now && isDirectSource(a.sourceType);
      const bPri = b.directPriorityUntil && new Date(b.directPriorityUntil).getTime() > now && isDirectSource(b.sourceType);
      if (aPri !== bPri) return aPri ? -1 : 1;
    }
    const sa = computeRecommendedScore(a, now);
    const sb = computeRecommendedScore(b, now);
    if (sb !== sa) return sb - sa;
    const ta = new Date(a.firstSeenAt ?? a.createdAt).getTime();
    const tb = new Date(b.firstSeenAt ?? b.createdAt).getTime();
    return tb - ta;
  });

  const out: RankableListing[] = [];
  const companyCounts = new Map<string, number>();
  let directInFirst10 = 0;

  const tryPush = (l: RankableListing, force = false): boolean => {
    const ck = companyKey(l.company);
    const cc = companyCounts.get(ck) ?? 0;
    if (ck && cc >= 2 && !force) return false;

    if (out.length < 10 && isDirectSource(l.sourceType)) {
      if (directInFirst10 >= softDirectQuota && !force) return false;
      directInFirst10 += 1;
    }
    if (ck) companyCounts.set(ck, cc + 1);
    out.push(l);
    return true;
  };

  const deferred: RankableListing[] = [];
  for (const l of scored) {
    if (!tryPush(l)) deferred.push(l);
  }
  // Kapıdan dönenleri firmadan 2 kuralını gevşetmeden yeniden dene (quota doluysa direktler sonda)
  for (const l of deferred) {
    const ck = companyKey(l.company);
    const cc = companyCounts.get(ck) ?? 0;
    if (ck && cc >= 2) continue;
    if (ck) companyCounts.set(ck, cc + 1);
    out.push(l);
  }
  // Hâlâ kalan (firmadan 2+) en sonda ekle — sayfalama tutarlılığı
  const pushed = new Set(out.map((x) => x.id));
  for (const l of deferred) {
    if (!pushed.has(l.id)) out.push(l);
  }

  return out;
}

export function publishOrderDate(l: RankableListing): Date {
  return l.sourcePublishedAt ?? l.firstSeenAt ?? l.createdAt;
}
