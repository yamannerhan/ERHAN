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

function formatCheckedAt(iso?: string | Date | null): string | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const showCompiled = b?.showCompiled ?? st === "bot_imported";
  const showPlatform = b?.showPlatform ?? st === "admin_created";
  const sourceName = b?.sourceName || listing.sourceName || (showCompiled ? "Kaynak" : "ozelguvenlik.online");
  const checked = formatCheckedAt(
    (b?.lastCheckedAt as string | null | undefined) ?? listing.lastCheckedAt ?? listing.lastSeenAt,
  );

  if (!showDirect && !showVerified && !showCompiled && !showPlatform) return null;

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
      {showCompiled && (
        <>
          <span
            className="lsb__badge lsb__badge--compiled"
            title="Bu ilan açık bir iş ilanı kaynağından derlenmiştir. Başvuru öncesinde ilan detaylarını kontrol ediniz."
          >
            KAYNAĞINDAN DERLENDİ
          </span>
          {!compact && (
            <span className="lsb__meta">
              Kaynak: {sourceName}
              {checked ? ` · Son kontrol: ${checked}` : ""}
            </span>
          )}
        </>
      )}
      {showPlatform && (
        <span className="lsb__badge lsb__badge--platform">PLATFORM TARAFINDAN YAYINLANDI</span>
      )}
    </div>
  );
}

export function ListingSourceInfoCard({ listing }: { listing: ListingSourceBadgeFields & { sourceUrl?: string | null } }) {
  const st = listing.sourceType;
  if (!st) return null;
  return (
    <section className="lsb-card">
      <h3 className="lsb-card__title">İlan Kaynağı</h3>
      <ListingSourceBadges listing={listing} />
      <p className="lsb-card__description">
        {st === "bot_imported"
          ? "Bu ilan açık bir iş ilanı kaynağından derlenmiştir."
          : st === "admin_created"
            ? "Bu ilan ozelguvenlik.online yönetimi tarafından yayınlanmıştır."
            : "Bu ilan ozelguvenlik.online üzerinden doğrudan yayınlandı."}
      </p>
      {st === "bot_imported" && listing.sourceUrl && (
        <a
          className="lsb-card__link"
          href={listing.sourceUrl}
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          Orijinal İlanı Gör
        </a>
      )}
    </section>
  );
}
