import type { User } from "@workspace/db";

export type ListingSourceType = "direct_user" | "direct_company" | "bot_imported" | "admin_created";

export const BOT_PLATFORMS = ["telegram", "whatsapp", "eleman", "demo"] as const;

export function platformSourceName(platform: string | null | undefined): string {
  switch ((platform || "").toLowerCase()) {
    case "telegram": return "Telegram";
    case "whatsapp": return "WhatsApp";
    case "eleman": return "Eleman.net";
    case "demo": return "Demo";
    default: return platform?.trim() || "Kaynak";
  }
}

export function isUnverifiableAccount(user: {
  accountType?: string | null;
  isSystemAccount?: boolean | null;
  role?: string | null;
} | null | undefined): boolean {
  if (!user) return true;
  if (user.isSystemAccount) return true;
  const t = (user.accountType || "user").toLowerCase();
  return t === "bot" || t === "system";
}

export function buildVerificationSnapshot(user: Pick<User, "id" | "username" | "isVerifiedPublisher" | "verificationType" | "verifiedAt" | "verificationStatus">): string {
  return JSON.stringify({
    userId: user.id,
    username: user.username,
    isVerifiedPublisher: !!user.isVerifiedPublisher,
    verificationType: user.verificationType ?? null,
    verificationStatus: user.verificationStatus ?? "unverified",
    verifiedAt: user.verifiedAt ? new Date(user.verifiedAt).toISOString() : null,
    capturedAt: new Date().toISOString(),
  });
}

export function computeDirectPriorityUntil(
  sourceType: ListingSourceType,
  verifiedPublisher: boolean,
  from: Date = new Date(),
): Date | null {
  if (sourceType === "bot_imported") return null;
  const hours = verifiedPublisher || sourceType === "direct_company" ? 72
    : sourceType === "direct_user" || sourceType === "admin_created" ? 48
      : 0;
  if (!hours) return null;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function computeRenewPriorityUntil(
  verifiedPublisher: boolean,
  from: Date = new Date(),
): Date {
  const hours = verifiedPublisher ? 24 : 12;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export type ResolveSourceInput = {
  isAdminCreate?: boolean;
  botPlatform?: string | null;
  sourceUrl?: string | null;
  sourcePublishedAt?: Date | null;
  author?: {
    id: number;
    username: string;
    role?: string | null;
    isVerifiedPublisher?: boolean | null;
    verificationType?: string | null;
    verifiedAt?: Date | null;
    verificationStatus?: string | null;
    accountType?: string | null;
    isSystemAccount?: boolean | null;
  } | null;
};

export type ResolvedListingSource = {
  sourceType: ListingSourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  sourcePublishedAt: Date | null;
  verifiedPublisher: boolean;
  verificationSnapshot: string | null;
  directPriorityUntil: Date | null;
  freshnessConfirmedAt: Date | null;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  lastCheckedAt: Date | null;
};

export function resolveListingSourceOnCreate(input: ResolveSourceInput): ResolvedListingSource {
  const now = new Date();

  if (input.botPlatform) {
    return {
      sourceType: "bot_imported",
      sourceName: platformSourceName(input.botPlatform),
      sourceUrl: input.sourceUrl ?? null,
      sourcePublishedAt: input.sourcePublishedAt ?? now,
      verifiedPublisher: false,
      verificationSnapshot: null,
      directPriorityUntil: null,
      freshnessConfirmedAt: null,
      firstSeenAt: now,
      lastSeenAt: now,
      lastCheckedAt: now,
    };
  }

  if (input.isAdminCreate) {
    const sourceType: ListingSourceType = "admin_created";
    return {
      sourceType,
      sourceName: "ozelguvenlik.online",
      sourceUrl: null,
      sourcePublishedAt: now,
      verifiedPublisher: false,
      verificationSnapshot: null,
      directPriorityUntil: computeDirectPriorityUntil(sourceType, false, now),
      freshnessConfirmedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      lastCheckedAt: null,
    };
  }

  const author = input.author;
  const verified = !!(author?.isVerifiedPublisher && author.verificationStatus === "verified");
  const sourceType: ListingSourceType = verified ? "direct_company" : "direct_user";
  const snapshot = author
    ? buildVerificationSnapshot({
      id: author.id,
      username: author.username,
      isVerifiedPublisher: !!author.isVerifiedPublisher,
      verificationType: author.verificationType ?? null,
      verifiedAt: author.verifiedAt ?? null,
      verificationStatus: author.verificationStatus ?? "unverified",
    })
    : null;

  return {
    sourceType,
    sourceName: "ozelguvenlik.online",
    sourceUrl: null,
    sourcePublishedAt: now,
    verifiedPublisher: verified,
    verificationSnapshot: snapshot,
    directPriorityUntil: computeDirectPriorityUntil(sourceType, verified, now),
    freshnessConfirmedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    lastCheckedAt: null,
  };
}

/** FE rozet meta */
export function listingBadgeMeta(listing: {
  sourceType?: string | null;
  sourceName?: string | null;
  verifiedPublisher?: boolean | null;
  lastCheckedAt?: string | Date | null;
  lastSeenAt?: string | Date | null;
}) {
  const st = listing.sourceType || null;
  const verified = !!listing.verifiedPublisher && (st === "direct_company" || st === "direct_user");
  const isBot = st === "bot_imported";
  const isDirect = st === "direct_user" || st === "direct_company";
  const isAdmin = st === "admin_created";
  return {
    sourceType: st,
    showDirect: isDirect,
    showVerified: verified && isDirect,
    showCompiled: isBot,
    showPlatform: isAdmin,
    sourceName: listing.sourceName || (isBot ? "Kaynak" : "ozelguvenlik.online"),
    lastCheckedAt: listing.lastCheckedAt ?? listing.lastSeenAt ?? null,
  };
}
