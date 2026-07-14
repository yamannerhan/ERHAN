import { db, listingsTable, listingMergeQueueTable, listingSourceHistoryTable } from "@workspace/db";
import { and, eq, or, sql, desc, isNull } from "drizzle-orm";
import { extractPhoneNumbers } from "./job-parsing";

function normalizeCompany(s: string | null | undefined): string {
  return (s || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\b(ltd|şti|sti|a\.?\s*ş\.?|as|aş|guvenlik|güvenlik|özel|ozel)\b/gi, " ")
    .replace(/[^a-z0-9ğüşöçıİ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCity(s: string | null | undefined): string {
  return (s || "").toLocaleLowerCase("tr-TR").split(/[\/|,]/)[0]?.trim() || "";
}

function titleTokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s || "")
      .toLocaleLowerCase("tr-TR")
      .replace(/[^a-z0-9ğüşöçıİ\s]/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export type SimilarityInput = {
  id: number;
  title: string;
  company: string;
  city: string;
  description?: string | null;
  applyUrl?: string | null;
  sourceType?: string | null;
};

/** 0–100 benzerlik skoru */
export function listingSimilarityScore(a: SimilarityInput, b: SimilarityInput): number {
  let score = 0;
  const phonesA = new Set(extractPhoneNumbers(`${a.applyUrl || ""}\n${a.description || ""}`));
  const phonesB = new Set(extractPhoneNumbers(`${b.applyUrl || ""}\n${b.description || ""}`));
  let phoneHit = false;
  for (const p of phonesA) {
    if (phonesB.has(p)) { phoneHit = true; break; }
  }
  if (phoneHit) score += 45;

  const ca = normalizeCompany(a.company);
  const cb = normalizeCompany(b.company);
  if (ca && cb && (ca === cb || ca.includes(cb) || cb.includes(ca))) score += 25;

  const cityA = normalizeCity(a.city);
  const cityB = normalizeCity(b.city);
  if (cityA && cityB && (cityA === cityB || cityA.includes(cityB) || cityB.includes(cityA))) score += 15;

  const titleSim = jaccard(titleTokens(a.title), titleTokens(b.title));
  score += Math.round(titleSim * 20);

  return Math.min(100, score);
}

const AUTO_MERGE_THRESHOLD = 88;
const QUEUE_THRESHOLD = 62;

/**
 * Yeni doğrudan ilan sonrası bot benzerlerini bul.
 * Yüksek skor → güvenli ilişkilendirme (bot history), şüpheli → merge queue.
 */
export async function findAndQueueSimilarBots(directListingId: number): Promise<{ merged: number; queued: number }> {
  const [primary] = await db.select().from(listingsTable).where(eq(listingsTable.id, directListingId)).limit(1);
  if (!primary) return { merged: 0, queued: 0 };
  if (primary.sourceType === "bot_imported") return { merged: 0, queued: 0 };

  const cityHead = normalizeCity(primary.city);
  const candidates = await db
    .select()
    .from(listingsTable)
    .where(and(
      eq(listingsTable.sourceType, "bot_imported"),
      eq(listingsTable.isActive, true),
      or(
        cityHead
          ? sql`lower(${listingsTable.city}) LIKE ${"%" + cityHead + "%"}`
          : sql`true`,
        eq(listingsTable.company, primary.company),
      )!,
    ))
    .orderBy(desc(listingsTable.createdAt))
    .limit(40);

  let merged = 0;
  let queued = 0;
  for (const c of candidates) {
    if (c.id === primary.id) continue;
    const score = listingSimilarityScore(primary, c);
    if (score >= AUTO_MERGE_THRESHOLD) {
      // Güvenli: bot'u doğrudan kayda bağla (pasife alma — sadece history)
      await db.insert(listingSourceHistoryTable).values({
        listingId: primary.id,
        sourceType: c.sourceType,
        sourceName: c.sourceName,
        sourceUrl: c.sourceUrl,
        firstSeenAt: c.firstSeenAt,
        lastSeenAt: c.lastSeenAt,
        relatedListingId: c.id,
      }).catch(() => undefined);
      await db.update(listingsTable)
        .set({ mergedIntoListingId: primary.id })
        .where(eq(listingsTable.id, c.id));
      merged += 1;
    } else if (score >= QUEUE_THRESHOLD) {
      const [existing] = await db
        .select({ id: listingMergeQueueTable.id })
        .from(listingMergeQueueTable)
        .where(and(
          eq(listingMergeQueueTable.primaryListingId, primary.id),
          eq(listingMergeQueueTable.candidateListingId, c.id),
          eq(listingMergeQueueTable.status, "pending"),
        ))
        .limit(1);
      if (!existing) {
        await db.insert(listingMergeQueueTable).values({
          primaryListingId: primary.id,
          candidateListingId: c.id,
          score,
          status: "pending",
          reason: "similarity_auto",
        });
        queued += 1;
      }
    }
  }
  return { merged, queued };
}

export async function ensureMergeQueueReviewed(
  queueId: number,
  action: "merged" | "rejected",
  reviewerId: number,
): Promise<boolean> {
  const [row] = await db.select().from(listingMergeQueueTable).where(eq(listingMergeQueueTable.id, queueId)).limit(1);
  if (!row || row.status !== "pending") return false;

  if (action === "merged") {
    const primaryId = row.primaryListingId;
    const candidateId = row.candidateListingId;
    const [primary] = await db.select().from(listingsTable).where(eq(listingsTable.id, primaryId)).limit(1);
    const [candidate] = await db.select().from(listingsTable).where(eq(listingsTable.id, candidateId)).limit(1);
    if (primary && candidate) {
      // Doğrudan tercih: bot → mergedInto; doğrudan↔doğrudan ise eskiyi bağla
      let keep = primary;
      let hide = candidate;
      if (candidate.sourceType !== "bot_imported" && primary.sourceType === "bot_imported") {
        keep = candidate;
        hide = primary;
      }
      await db.insert(listingSourceHistoryTable).values({
        listingId: keep.id,
        sourceType: hide.sourceType,
        sourceName: hide.sourceName,
        sourceUrl: hide.sourceUrl,
        firstSeenAt: hide.firstSeenAt,
        lastSeenAt: hide.lastSeenAt,
        relatedListingId: hide.id,
      }).catch(() => undefined);
      await db.update(listingsTable)
        .set({ mergedIntoListingId: keep.id, isActive: hide.sourceType === "bot_imported" ? hide.isActive : false })
        .where(eq(listingsTable.id, hide.id));
    }
  }

  await db.update(listingMergeQueueTable).set({
    status: action,
    reviewedBy: reviewerId,
    reviewedAt: new Date(),
  }).where(eq(listingMergeQueueTable.id, queueId));

  return true;
}

/** Periyodik tarama: aktif bot vs doğrudan */
export async function scanListingMerges(limit = 30): Promise<{ checked: number; queued: number }> {
  const directs = await db
    .select()
    .from(listingsTable)
    .where(and(
      eq(listingsTable.isActive, true),
      or(eq(listingsTable.sourceType, "direct_user"), eq(listingsTable.sourceType, "direct_company"))!,
      isNull(listingsTable.mergedIntoListingId),
    ))
    .orderBy(desc(listingsTable.createdAt))
    .limit(limit);

  let queued = 0;
  for (const d of directs) {
    const r = await findAndQueueSimilarBots(d.id);
    queued += r.queued;
  }
  return { checked: directs.length, queued };
}
