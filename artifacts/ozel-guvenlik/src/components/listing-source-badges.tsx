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
  const b = listing.badges;
  const st = listing.sourceType;
  const showDirect = b?.showDirect ?? (st === "direct_user" || st === "direct_company");
  const showVerified =
    b?.showVerified ??
    (!!listing.verifiedPublisher && (st === "direct_company" || st === "direct_user"));

  // Bot/admin kaynak bilgileri iç sistem verisidir; kullanıcı ilan kartında gösterilmez.
  if (!showDirect && !showVerified) return null;

  return (
    <div className={`lsb${compact ? " lsb--compact" : ""}`} aria-label="İlan kaynağı">
      {showDirect && (
        <span
          className="lsb__badge lsb__badge--direct"
          title="Bu ilan, ilan sahibi tarafından ozelguvenlik.online üzerinden doğrudan yayınlanmıştır."
        >
          DOĞRUDAN YAYINLANDI
        </span>
      )}
      {showVerified && (
        <span
          className="lsb__badge lsb__badge--verified"
          title="Bu ilanı yayınlayan hesabın bilgileri platform yönetimi tarafından incelenmiştir."
        >
          DOĞRULANMIŞ HESAP
        </span>
      )}
    </div>
  );
}

export function ListingSourceInfoCard({ listing }: { listing: ListingSourceBadgeFields & { sourceUrl?: string | null } }) {
  const st = listing.sourceType;
  if (!st || st === "bot_imported" || st === "admin_created") return null;
  return (
    <section className="lsb-card">
      <h3 className="lsb-card__title">İlan Kaynağı</h3>
      <ListingSourceBadges listing={listing} />
      <p className="lsb-card__description">
        Bu ilan ozelguvenlik.online üzerinden doğrudan yayınlandı.
      </p>
    </section>
  );
}
