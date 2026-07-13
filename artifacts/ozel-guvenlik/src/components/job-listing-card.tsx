import React, { useMemo } from "react";
import { Link } from "wouter";
import {
  MapPin, Clock, BadgeCheck, Bookmark, Building2, Briefcase,
  User, CalendarDays, Utensils, Bus, Shield, Star, ArrowRight,
} from "lucide-react";
import { displayCompany, extractBenefits } from "@/lib/utils";
import { markListingRead, useListingRead } from "@/lib/read-listings";
import { resolveApplyHref } from "@/lib/apply-url";
import { isRealCompanyLogo, resolveCompanyLogo } from "@/lib/brand-logo";
import "./job-card.css";

export type JobCardListing = {
  id: number;
  title: string;
  company: string;
  city: string;
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
  createdAt: string;
};

function isRealLogo(url?: string | null): boolean {
  return isRealCompanyLogo(url);
}

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

function detectExperience(blob: string): string | null {
  const t = blob.toLocaleLowerCase("tr-TR");
  if (/deneyim\s*(şart\s*)?de[ğg]il|tecr[uü]be\s*(şart\s*)?de[ğg]il|deneyimsiz/.test(t)) {
    return "Deneyim Şart Değil";
  }
  if (/deneyimli|tecr[uü]beli|\d+\s*y[ıi]l/.test(t)) return "Deneyimli";
  return null;
}

function formatSalary(raw?: string | null): string {
  const s = (raw || "").trim();
  if (!s || /belirtilmedi|g[oö]r[uü][sş]me/i.test(s)) return "Görüşmede";
  return s.replace(/\s+/g, " ").trim();
}

function formatPostedAt(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
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

function postedBadge(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const hours = (Date.now() - t) / 3_600_000;
  if (hours < 24) return "Bugün";
  if (hours < 48) return "Dün";
  return null;
}

const BENEFIT_ICON: Record<string, typeof Utensils> = {
  Yemek: Utensils,
  "Yemek Kartı": Utensils,
  Servis: Bus,
  SGK: Shield,
  Prim: Star,
  Konaklama: Building2,
  Kıyafet: Briefcase,
  Mesai: Clock,
  Yol: Bus,
};

type Chip = {
  key: string;
  label: string;
  Icon: typeof Clock;
  tone?: "default" | "time" | "shift";
};

type Props = {
  listing: JobCardListing;
  onNavigate?: () => void;
  adminOverlay?: React.ReactNode;
  saved?: boolean;
  onToggleSave?: (e: React.MouseEvent, id: number) => void;
  /** Öne çıkan şerit — kompakt boyut */
  compact?: boolean;
};

/** Referans görsel — normal / öne çıkan ilan kartı */
export function JobListingCard({
  listing,
  onNavigate,
  adminOverlay,
  saved,
  onToggleSave,
  compact = false,
}: Props) {
  const isRead = useListingRead(listing.id);
  const company = displayCompany(listing.company) || (compact ? "ozelguvenlik.online" : "Firma");
  const blob = `${listing.title} ${listing.description ?? ""} ${listing.requirements ?? ""}`;
  const { city, district } = splitCity(listing.city);
  const location = district ? `${city} / ${district}` : city;
  const logo = resolveCompanyLogo(listing.companyLogoUrl);
  const hasOwnLogo = isRealLogo(listing.companyLogoUrl);
  const verified = !!listing.companyVerified || hasOwnLogo;
  const salaryText = formatSalary(listing.salary);
  const posted = formatPostedAt(listing.createdAt);
  const isSaved = saved ?? !!listing.isFavoritedByMe;
  const detailHref = `/ilan/${listing.id}`;

  const resolvedApply = resolveApplyHref({
    applyUrl: listing.applyUrl,
    description: listing.description,
    requirements: listing.requirements,
    title: listing.title,
  });
  const applyHref = resolvedApply && resolvedApply !== "auth_required" ? resolvedApply : detailHref;
  const applyIsTel = applyHref.startsWith("tel:");

  const chips: Chip[] = useMemo(() => {
    const list: Chip[] = [];
    list.push({ key: "loc", label: location, Icon: MapPin });
    if (district) list.push({ key: "dist", label: district, Icon: Building2 });
    const shift = detectShift(blob);
    if (shift) list.push({ key: "shift", label: shift, Icon: Clock, tone: "shift" });
    const workType = (listing.workType || "").trim();
    if (workType) list.push({ key: "work", label: workType, Icon: Briefcase });
    const gender = detectGender(blob);
    if (gender) list.push({ key: "gender", label: gender, Icon: User });
    const day = postedBadge(listing.createdAt);
    if (day) list.push({ key: "day", label: day, Icon: CalendarDays, tone: "time" });
    const benefits = extractBenefits(listing.requirements, listing.description);
    for (const b of benefits.slice(0, compact ? 2 : 4)) {
      list.push({ key: `b-${b}`, label: b, Icon: BENEFIT_ICON[b] || Star });
    }
    const exp = detectExperience(blob);
    if (exp) list.push({ key: "exp", label: exp, Icon: Star });
    return list;
  }, [blob, compact, district, listing.createdAt, listing.description, listing.requirements, listing.workType, location]);

  const visibleChips = compact ? chips.slice(0, 4) : chips;

  const markReadAndNavigate = () => {
    markListingRead(listing.id);
    onNavigate?.();
  };

  return (
    <article className={`og-job${isRead ? " is-read" : ""}${compact ? " og-job--compact" : ""}`}>
      {isRead && <span className="og-job__read">Okundu</span>}
      {adminOverlay ? <div className="og-job__admin">{adminOverlay}</div> : null}

      <div className="og-job__inner">
        <div className="og-job__head">
          <div className="og-job__logo">
            <img src={logo} alt="" loading="lazy" className={hasOwnLogo ? "" : "og-job__logo-brand"} />
          </div>

          <div className="og-job__main">
            <h3 className="og-job__title" title={listing.title}>{listing.title}</h3>
            <div className="og-job__company-row">
              <span className="og-job__company-name" title={company}>{company}</span>
              {verified && (
                <span className="og-job__verified">
                  <BadgeCheck className="og-job__verify" aria-hidden />
                  {!compact && <span>Doğrulanmış</span>}
                </span>
              )}
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
              <span>{compact ? "Başvur" : "Başvur"}</span>
              <ArrowRight className="og-job__btn-ico" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
