/**
 * Kaynak / doğrulama / sıralama / yenileme kurallarının birim doğrulaması (DB yok).
 * Çalıştır: npx tsx scripts/test-listing-source.ts
 */
import {
  resolveListingSourceOnCreate,
  computeDirectPriorityUntil,
  computeRenewPriorityUntil,
  isUnverifiableAccount,
  listingBadgeMeta,
  platformSourceName,
} from "../src/lib/listing-source";
import { computeRecommendedScore, rankListingsRecommended, publishOrderDate } from "../src/lib/listing-rank";
import { listingSimilarityScore } from "../src/lib/listing-merge";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

// Bot hesabı doğrulanamaz
assert(isUnverifiableAccount({ accountType: "bot" }), "bot unverifiable");
assert(isUnverifiableAccount({ isSystemAccount: true }), "system unverifiable");
assert(!isUnverifiableAccount({ accountType: "user", isSystemAccount: false }), "normal user verifiable");

// Bot create
const bot = resolveListingSourceOnCreate({
  botPlatform: "telegram",
  sourceUrl: "https://t.me/x/1",
  sourcePublishedAt: new Date("2026-01-01T12:00:00Z"),
});
assert(bot.sourceType === "bot_imported", "bot sourceType");
assert(bot.verifiedPublisher === false, "bot never verified");
assert(bot.directPriorityUntil === null, "bot no priority");
assert(bot.sourceName === "Telegram", "telegram name");

// Admin create
const admin = resolveListingSourceOnCreate({ isAdminCreate: true });
assert(admin.sourceType === "admin_created", "admin sourceType");
assert(admin.verifiedPublisher === false, "admin not verified publisher");
assert(admin.directPriorityUntil != null, "admin has priority");

// Verified user → direct_company
const verified = resolveListingSourceOnCreate({
  author: {
    id: 1,
    username: "firma",
    isVerifiedPublisher: true,
    verificationStatus: "verified",
    verificationType: "company",
    verifiedAt: new Date(),
  },
});
assert(verified.sourceType === "direct_company", "verified → direct_company");
assert(verified.verifiedPublisher === true, "verified flag");
assert(verified.directPriorityUntil != null, "verified priority");
const vHours = (verified.directPriorityUntil!.getTime() - Date.now()) / 3_600_000;
assert(vHours > 70 && vHours < 73, `verified ~72h got ${vHours}`);

// Normal user → direct_user 48h
const normal = resolveListingSourceOnCreate({
  author: { id: 2, username: "uye", isVerifiedPublisher: false, verificationStatus: "unverified" },
});
assert(normal.sourceType === "direct_user", "normal direct_user");
assert(normal.verifiedPublisher === false, "normal not verified");
const nHours = (normal.directPriorityUntil!.getTime() - Date.now()) / 3_600_000;
assert(nHours > 46 && nHours < 49, `normal ~48h got ${nHours}`);

// Priority helpers
assert(computeDirectPriorityUntil("bot_imported", false) === null, "bot priority null");
const renewV = computeRenewPriorityUntil(true);
const renewN = computeRenewPriorityUntil(false);
assert((renewV.getTime() - Date.now()) / 3_600_000 > 23, "renew verified 24h");
assert((renewN.getTime() - Date.now()) / 3_600_000 > 11, "renew normal 12h");

// Badges
const badgesBot = listingBadgeMeta({ sourceType: "bot_imported", sourceName: "WhatsApp", lastCheckedAt: new Date() });
assert(badgesBot.showCompiled && !badgesBot.showDirect && !badgesBot.showVerified, "bot badges");
const badgesDirect = listingBadgeMeta({ sourceType: "direct_company", verifiedPublisher: true });
assert(badgesDirect.showDirect && badgesDirect.showVerified, "verified direct badges");
assert(platformSourceName("eleman") === "Eleman.net", "eleman name");

// Ranking: newest vs recommended — skorlu sıra
const now = new Date();
const mk = (partial: Record<string, unknown>) =>
  ({
    id: 0,
    title: "t",
    company: "c",
    city: "İstanbul",
    salary: null,
    workType: "Tam Zamanlı",
    description: null,
    requirements: null,
    status: "active",
    isActive: true,
    viewCount: 0,
    likeCount: 0,
    isFeatured: false,
    featuredUntil: null,
    featuredIsFree: false,
    cardTheme: null,
    applyUrl: null,
    sourceTag: null,
    sourceId: null,
    messageId: null,
    sourceUrl: null,
    sourceType: "bot_imported",
    sourceName: "Telegram",
    sourcePublishedAt: now,
    lastCheckedAt: now,
    directPriorityUntil: null,
    freshnessConfirmedAt: null,
    verifiedPublisher: false,
    verificationSnapshot: null,
    publishedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    rawText: null,
    companyLogoUrl: null,
    companyProfileId: null,
    authorId: null,
    expiresAt: null,
    autoDeleteOnExpiry: true,
    lastRenewedAt: null,
    mergedIntoListingId: null,
    latitude: null,
    longitude: null,
    locationAccuracy: null,
    locationSource: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }) as never;

const oldBot = mk({
  id: 1,
  sourceType: "bot_imported",
  sourcePublishedAt: new Date(Date.now() - 48 * 3600_000),
  firstSeenAt: new Date(Date.now() - 48 * 3600_000),
  createdAt: new Date(Date.now() - 48 * 3600_000),
  company: "A",
});
const newDirect = mk({
  id: 2,
  sourceType: "direct_company",
  verifiedPublisher: true,
  directPriorityUntil: new Date(Date.now() + 70 * 3600_000),
  sourcePublishedAt: now,
  firstSeenAt: now,
  createdAt: now,
  company: "B",
  salary: "45.000 TL",
});
assert(computeRecommendedScore(newDirect) > computeRecommendedScore(oldBot), "recommended prefers priority verified");

const ranked = rankListingsRecommended([oldBot, newDirect]);
assert(ranked[0]!.id === 2, "ranked direct first");

// newest date uses sourcePublishedAt
assert(publishOrderDate(oldBot).getTime() < publishOrderDate(newDirect).getTime(), "publish order");

// Similarity
const sim = listingSimilarityScore(
  { id: 1, title: "Özel Güvenlik", company: "ABC Güvenlik", city: "İstanbul / Şişli", applyUrl: "tel:05071234567", description: "Ara 0507 123 45 67" },
  { id: 2, title: "Özel Güvenlik Görevlisi", company: "ABC Guvenlik Ltd", city: "İstanbul", applyUrl: "tel:+905071234567", description: "Tel" },
);
assert(sim >= 62, `similarity high enough got ${sim}`);

console.log("ALL OK listing-source / ranking / merge heuristics");
