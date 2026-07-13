import React from "react";
import { Link } from "wouter";
import {
  MapPin, Clock, BadgeCheck, Bookmark, Eye, Send, Shield, Users, CalendarDays,
} from "lucide-react";
import { displayCompany } from "@/lib/utils";
import { markListingRead, useListingRead } from "@/lib/read-listings";
import { resolveApplyHref } from "@/lib/apply-url";
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
  if (!url) return false;
  const u = url.trim();
  if (!u || u.startsWith("data:image/svg")) return false;
  if (/unsplash\.com|randomuser\.me|picsum/i.test(u)) return false;
  return (
    u.startsWith("/api/company-logos/") ||
    u.startsWith("/api/listing-images/") ||
    u.startsWith("data:image/") ||
    u.startsWith("http")
  );
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

function formatSalary(raw?: string | null): { amount: string; period: string } {
  const s = (raw || "").trim();
  if (!s || /belirtilmedi|g[oö]r[uü][sş]me/i.test(s)) {
    return { amount: "Maaş görüşmede", period: "" };
  }
  let period = "Aylık";
  if (/g[uü]nl[uü]k/i.test(s)) period = "Günlük";
  else if (/haftal[iı]k/i.test(s)) period = "Haftalık";
  else if (/\bnet\b/i.test(s)) period = "Net";
  else if (/br[uü]t/i.test(s)) period = "Brüt";
  const amount = s
    .replace(/\b(ayl[iı]k|g[uü]nl[uü]k|haftal[iı]k|net|br[uü]t)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || s;
  return { amount, period };
}

type Props = {
  listing: JobCardListing;
  onNavigate?: () => void;
  adminOverlay?: React.ReactNode;
  saved?: boolean;
  onToggleSave?: (e: React.MouseEvent, id: number) => void;
  /** Öne çıkan şerit — 2'li kompakt boyut */
  compact?: boolean;
};

/** Referans görsel — normal ilan kartı */
export function JobListingCard({
  listing,
  onNavigate,
  adminOverlay,
  saved,
  onToggleSave,
  compact = false,
}: Props) {
  const isRead = useListingRead(listing.id);
  const company = compact
    ? (displayCompany(listing.company) ?? "ozelguvenlik.online")
    : (displayCompany(listing.company) || "Firma");
  const blob = `${listing.title} ${listing.description ?? ""} ${listing.requirements ?? ""}`;
  const { city, district } = splitCity(listing.city);
  const location = district ? `${city} / ${district}` : city;
  const logo = isRealLogo(listing.companyLogoUrl) ? listing.companyLogoUrl! : null;
  const verified = !!listing.companyVerified || !!logo;
  const shiftLabel = detectShift(blob);
  const genderLabel = detectGender(blob);
  const workType = (listing.workType || "").trim() || null;
  const { amount: salaryAmount, period: salaryPeriod } = formatSalary(listing.salary);
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

  const tags: Array<{ key: string; label: string; Icon: typeof Clock }> = [];
  if (shiftLabel) tags.push({ key: "shift", label: shiftLabel, Icon: Clock });
  if (genderLabel) tags.push({ key: "gender", label: genderLabel, Icon: Users });
  if (workType) tags.push({ key: "work", label: workType, Icon: CalendarDays });

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
            {logo ? (
              <img src={logo} alt="" loading="lazy" />
            ) : (
              <>
                <Shield className="og-job__logo-shield" aria-hidden />
                <span className="og-job__logo-label">FİRMA</span>
              </>
            )}
          </div>

          <div className="og-job__main">
            <div className="og-job__company-row">
              <span className="og-job__company-name">{company}</span>
              {verified && (
                <BadgeCheck className="og-job__verify" aria-label="Doğrulanmış firma" />
              )}
            </div>
            <h3 className="og-job__title">{listing.title}</h3>
            <div className="og-job__location">
              <MapPin className="og-job__loc-ico" aria-hidden />
              <span>{location}</span>
            </div>
          </div>

          <div className="og-job__aside">
            <button
              type="button"
              className={`og-job__bookmark${isSaved ? " is-on" : ""}`}
              aria-label={isSaved ? "Kayıttan çıkar" : "Kaydet"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSave?.(e, listing.id);
              }}
            >
              <Bookmark className="og-job__bookmark-ico" aria-hidden />
            </button>
            <div className="og-job__salary-box">
              <span className="og-job__salary-amount">{salaryAmount}</span>
              {salaryPeriod ? (
                <span className="og-job__salary-period">{salaryPeriod}</span>
              ) : null}
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="og-job__tags">
            {tags.map((t) => (
              <span key={t.key} className="og-job__tag">
                <t.Icon className="og-job__tag-ico" aria-hidden />
                {t.label}
              </span>
            ))}
          </div>
        )}

        <div className="og-job__actions">
          <Link href={detailHref} onClick={markReadAndNavigate} className="og-job__btn-detail">
            <Eye className="og-job__btn-ico" aria-hidden />
            <span>{compact ? "Detay" : "İlanın Detayını Gör"}</span>
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
            <Send className="og-job__btn-ico" aria-hidden />
            <span>{compact ? "Başvur" : "Hemen Başvur"}</span>
          </a>
        </div>
      </div>
    </article>
  );
}
