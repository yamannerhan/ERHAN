import React from "react";
import { Link, useLocation } from "wouter";
import {
  MapPin, Clock, BadgeCheck, Bookmark, Briefcase,
  User, ArrowRight,
} from "lucide-react";
import { displayCompany } from "@/lib/utils";
import { markListingRead, useListingRead } from "@/lib/read-listings";
import { resolveApplyHref } from "@/lib/apply-url";
import { isRealCompanyLogo, resolveCompanyLogo, useBrandLogoFallback } from "@/lib/brand-logo";
import { listingHref } from "@/lib/listing-seo";
import "./job-card.css";

export type JobCardListing = {
  id: number;
  title: string;
  company: string;
  city: string;
  slug?: string | null;
  seoPath?: string | null;
  salary?: string | null;
  workType?: string | null;
  description?: string | null;
  requirements?: string | null;
  companyLogoUrl?: string | null;
  companyVerified?: boolean;
  applyUrl?: string | null;
  isFeatured?: boolean;
  isFavoritedByMe?: boolean;
  authorId?: number | null;
  sourceTag?: string | null;
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
  createdAt: string;
  /** Yakındaki ilanlar — km (null + sameDistrict = aynı ilçe) */
  distanceKm?: number | null;
  sameDistrict?: boolean;
  approximate?: boolean;
  hasService?: boolean;
};

function splitCity(city: string): { city: string; district: string | null } {
  const parts = city.split(/\s*[\/|,]\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0]!, district: parts[1]! };
  return { city, district: null };
}

function detectShift(blob: string): string | null {
  const t = blob.toLocaleLowerCase("tr-TR");
  if (/2\s*\+\s*2\s*\+\s*2|2\+2\+2/.test(t)) return "2+2+2";
  if (/12\s*[\/\-]\s*24|12\/24/.test(t)) return "12/24 Vardiya";
  if (/24\s*[\/\-]\s*48|24\/48/.test(t)) return "24/48 Vardiya";
  const m = t.match(/(\d{1,2})\s*saat/);
  if (m) return `${m[1]} Saat`;
  if (/vardiya/.test(t)) return "Vardiyalı";
  return null;
}

function detectGender(blob: string): string | null {
  const t = blob.toLocaleLowerCase("tr-TR");
  const male = /\bbay\b|\berkek\b/.test(t);
  const female = /\bbayan\b|\bkad[ıi]n\b/.test(t);
  if (male && female) return "Bay / Bayan";
  if (male) return "Bay";
  if (female) return "Bayan";
  return null;
}

function formatSalary(raw?: string | null): string {
  const s = (raw || "").trim();
  if (!s || /belirtilmedi|g[oö]r[uü][sş]me/i.test(s)) return "Görüşmede";
  return s.replace(/\s+/g, " ").trim();
}

const NEW_LISTING_MS = 24 * 60 * 60 * 1000;

function formatPostedAt(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  // İlerideki kaynak saati (saat farkı) → az önce
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Dün";
  if (days < 7) return `${days} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/** YENİ = "Az önce / X dk / X saat" ile aynı pencere (gelecek saat dahil) */
function isWithinNewWindow(publishedAt: string, now = Date.now()): boolean {
  const ms = new Date(publishedAt).getTime();
  if (!Number.isFinite(ms)) return false;
  // ageMs negatif (gelecek) veya < 24 saat → yeni
  return now - ms < NEW_LISTING_MS;
}

type Chip = { key: string; label: string; Icon: typeof Clock; tone?: "shift" };

type Props = {
  listing: JobCardListing;
  onNavigate?: () => void;
  adminOverlay?: React.ReactNode;
  saved?: boolean;
  onToggleSave?: (e: React.MouseEvent, id: number) => void;
  compact?: boolean;
};

/** YENİ — senkron hesap (state gecikmesi yok); 24s sonra kalkar */
function useIsNewListing(publishedAt: string): boolean {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const ms = new Date(publishedAt).getTime();
    if (!Number.isFinite(ms)) return;
    const remaining = ms + NEW_LISTING_MS - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), Math.min(remaining + 100, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [publishedAt, tick]);
  return isWithinNewWindow(publishedAt);
}

function isListingUrgentText(listing: {
  title?: string | null;
  description?: string | null;
  requirements?: string | null;
}): boolean {
  const blob = `${listing.title ?? ""} ${listing.description ?? ""} ${listing.requirements ?? ""}`;
  return /acil|urgent/i.test(blob);
}

/** Referans düzen — hafif (az ikon, kısa metin taraması) */
export function JobListingCard({
  listing,
  onNavigate,
  adminOverlay,
  saved,
  onToggleSave,
  compact = false,
}: Props) {
  const [, navigate] = useLocation();
  const isRead = useListingRead(listing.id);
  const company = displayCompany(listing.company) || (compact ? "ozelguvenlik.online" : "Firma");
  // Uzun description tüm kartlarda tekrar regex'lenmesin
  const blob = `${listing.title} ${(listing.requirements ?? "").slice(0, 400)} ${(listing.description ?? "").slice(0, 400)}`;
  const { city, district } = splitCity(listing.city || "");
  const location = district ? `${city} / ${district}` : city;
  const logo = resolveCompanyLogo(listing.companyLogoUrl);
  const hasOwnLogo = isRealCompanyLogo(listing.companyLogoUrl);
  const salaryText = formatSalary(listing.salary);
  // API createdAt = kaynak paylaşım tarihi (bot) veya ilan oluşturma (kullanıcı)
  const posted = formatPostedAt(listing.createdAt);
  const isNew = useIsNewListing(listing.createdAt);
  const isUrgent = isListingUrgentText(listing);
  const isSaved = saved ?? !!listing.isFavoritedByMe;
  const detailHref = listingHref(listing);

  const resolvedApply = resolveApplyHref({
    applyUrl: listing.applyUrl,
    description: listing.description,
    requirements: listing.requirements,
    title: listing.title,
  });
  const applyHref = resolvedApply && resolvedApply !== "auth_required" ? resolvedApply : detailHref;
  const applyIsTel = applyHref.startsWith("tel:");

  const chips: Chip[] = [];
  if (listing.sameDistrict && listing.distanceKm == null) {
    chips.push({ key: "dist", label: "Aynı ilçede", Icon: MapPin, tone: "shift" });
  } else if (typeof listing.distanceKm === "number" && Number.isFinite(listing.distanceKm)) {
    const d = listing.distanceKm;
    const distLabel =
      d < 1
        ? `${Math.round(d * 1000)} metre uzakta`
        : listing.approximate
          ? `${d.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km uzaklıkta`
          : `${d.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km uzakta`;
    chips.push({ key: "dist", label: distLabel, Icon: MapPin, tone: "shift" });
  }
  chips.push({ key: "loc", label: location, Icon: MapPin });
  const shift = detectShift(blob);
  if (shift) chips.push({ key: "shift", label: shift, Icon: Clock, tone: "shift" });
  const workType = (listing.workType || "").trim();
  if (workType) chips.push({ key: "work", label: workType, Icon: Briefcase });
  const gender = detectGender(blob);
  if (gender) chips.push({ key: "gender", label: gender, Icon: User });
  if (listing.hasService) chips.push({ key: "svc", label: "Servis Var", Icon: BadgeCheck, tone: "shift" });
  const visibleChips = chips.slice(0, compact ? 3 : 5);

  const markReadAndNavigate = () => {
    markListingRead(listing.id);
    onNavigate?.();
  };

  const openDetails = () => {
    markReadAndNavigate();
    navigate(detailHref);
  };

  return (
    <article
      className={`og-job${isRead ? " is-read" : ""}${compact ? " og-job--compact" : ""}`}
      role="link"
      tabIndex={0}
      aria-label={`${listing.title} ilan detayını aç`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, select, textarea, [role='button']")) return;
        openDetails();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      }}
    >
      {isRead && <span className="og-job__read">Okundu</span>}
      {adminOverlay ? <div className="og-job__admin">{adminOverlay}</div> : null}

      <div className="og-job__inner">
        <div className="og-job__head">
          <div className="og-job__logo-wrap">
            {isUrgent && <span className="og-job__urgent-label">ACİL</span>}
            <div className="og-job__logo">
              <img
                src={logo}
                alt=""
                loading="lazy"
                decoding="async"
                className={hasOwnLogo ? "" : "og-job__logo-brand"}
                onError={(event) => useBrandLogoFallback(event.currentTarget)}
              />
            </div>
            {isNew && <span className="og-job__new-label">YENİ</span>}
          </div>

          <div className="og-job__main">
            <h3 className="og-job__title" title={listing.title}>{listing.title}</h3>
            <div className="og-job__company-row">
              <span className="og-job__company-name" title={company}>{company}</span>
            </div>
          </div>

          <div className="og-job__aside">
            {onToggleSave && (
              <button
                type="button"
                className={`og-job__bookmark${isSaved ? " is-on" : ""}`}
                aria-label={isSaved ? "Kayıttan çıkar" : "Kaydet"}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSave(e, listing.id);
                }}
              >
                <Bookmark className="og-job__bookmark-ico" aria-hidden />
              </button>
            )}
            <div className="og-job__salary-box" title={salaryText}>
              <span className="og-job__salary-amount">{salaryText}</span>
            </div>
          </div>
        </div>

        {visibleChips.length > 0 && (
          <div className="og-job__tags">
            {visibleChips.map((t) => (
              <span key={t.key} className={`og-job__tag${t.tone ? ` og-job__tag--${t.tone}` : ""}`}>
                <t.Icon className="og-job__tag-ico" aria-hidden />
                <span className="og-job__tag-label">{t.label}</span>
              </span>
            ))}
          </div>
        )}

        <div className="og-job__foot">
          {posted ? (
            <div className="og-job__posted">
              <Clock className="og-job__posted-ico" aria-hidden />
              <span>{posted}</span>
            </div>
          ) : (
            <span className="og-job__posted-spacer" />
          )}

          <div className="og-job__actions">
            <Link href={detailHref} onClick={markReadAndNavigate} className="og-job__btn-detail">
              <span>{compact ? "Detay" : "Detaylar"}</span>
            </Link>
            <a
              href={applyHref}
              className="og-job__btn-apply"
              onClick={(e) => {
                markListingRead(listing.id);
                if (resolvedApply === "auth_required") {
                  e.preventDefault();
                  window.location.assign("/giris");
                  return;
                }
                if (!applyIsTel) {
                  e.preventDefault();
                  markReadAndNavigate();
                  window.location.assign(detailHref);
                }
              }}
            >
              <span>Başvur</span>
              <ArrowRight className="og-job__btn-ico" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
