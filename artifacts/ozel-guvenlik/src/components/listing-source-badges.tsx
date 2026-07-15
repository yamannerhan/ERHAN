import React from "react";
import "./listing-source-badges.css";

export type ListingSourceBadgeFields = {
  sourceType?: string | null;
  sourceName?: string | null;
  verifiedPublisher?: boolean | null;
  lastCheckedAt?: string | null;
  lastSeenAt?: string | null;
  badges?: {
    showDirect?: boolean;
    showVerified?: boolean;
    showCompiled?: boolean;
    showPlatform?: boolean;
    sourceName?: string;
    lastCheckedAt?: string | Date | null;
  } | null;
};

/** Kaynak / doğrulanmış hesap rozetleri — mevcut logo “Doğrulanmış” ile karışmaz */
export function ListingSourceBadges({
  listing,
  compact = false,
}: {
  listing: ListingSourceBadgeFields;
  compact?: boolean;
}) {
  const st = listing.sourceType;
  // Yalnızca doğrulanmış bir hesabın bu site üzerinden verdiği ilanda göster.
  // API'den gelen showVerified override'ı bot/admin ilanını doğrulanmış yapamaz.
  const showVerified =
    !!listing.verifiedPublisher && (st === "direct_company" || st === "direct_user");

  if (!showVerified) return null;

  return (
    <div className={`lsb${compact ? " lsb--compact" : ""}`} aria-label="İlan kaynağı">
      <span
        className="lsb__badge lsb__badge--verified"
        title="Bu ilanı yayınlayan hesabın bilgileri platform yönetimi tarafından incelenmiştir."
      >
        DOĞRULANMIŞ HESAP
      </span>
    </div>
  );
}

export function ListingSourceInfoCard({ listing }: { listing: ListingSourceBadgeFields & { sourceUrl?: string | null } }) {
  return <ListingSourceBadges listing={listing} />;
}
