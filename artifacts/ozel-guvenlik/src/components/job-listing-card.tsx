import React from "react";
import { Link } from "wouter";
import {
  MapPin, Building2, Clock, Briefcase, User, Calendar,
  Utensils, Bus, Shield, Star, ArrowRight, BadgeCheck,
} from "lucide-react";
import { displayCompany } from "@/lib/utils";
import { getListingImage } from "@/lib/listing-image";
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
  applyUrl?: string | null;
  isFeatured?: boolean;
  authorId?: number | null;
  sourceTag?: string | null;
  createdAt: string;
};

function detectGender(blob: string): string {
  const t = blob.toLowerCase();
  const bay = /\bbay\b|\berkek\b/.test(t);
  const bayan = /\bbayan\b|\bkad[iı]n\b/.test(t);
  if (bay && bayan) return "Bay / Bayan";
  if (bayan) return "Bayan";
  if (bay) return "Bay";
  return "Bay / Bayan";
}

function detectHours(blob: string): string | null {
  const m = blob.match(/(\d{1,2})\s*saat/i);
  return m ? `${m[1]} Saat` : null;
}

function detectBenefits(blob: string): Array<{ key: string; label: string; Icon: typeof Utensils }> {
  const t = blob.toLowerCase();
  const out: Array<{ key: string; label: string; Icon: typeof Utensils }> = [];
  if (/yemek|öğün|ogun|yemekhane/.test(t)) out.push({ key: "meal", label: "Yemek", Icon: Utensils });
  if (/servis|shuttle|ulaş[ıi]m|servisi/.test(t)) out.push({ key: "shuttle", label: "Servis", Icon: Bus });
  if (/\bsgk\b|sigorta/.test(t)) out.push({ key: "sgk", label: "SGK", Icon: Shield });
  if (/deneyim\s*(şart\s*)?de[gğ]il|tecr[uü]be\s*(aranm|gerekmez|şart\s*de[gğ]il)/.test(t)) {
    out.push({ key: "exp", label: "Deneyim Şart Değil", Icon: Star });
  }
  return out.slice(0, 4);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Dün";
  if (days < 7) return `${days} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function splitCity(city: string): { city: string; district: string | null } {
  const parts = city.split(/\s*[\/|,]\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0]!, district: parts[1]! };
  return { city, district: null };
}

type Props = {
  listing: JobCardListing;
  onNavigate?: () => void;
  adminOverlay?: React.ReactNode;
};

/** İş ilanı kartı — mevcut liste kolon genişliğini doldurur */
export function JobListingCard({ listing, onNavigate, adminOverlay }: Props) {
  const isRead = useListingRead(listing.id);
  const company = displayCompany(listing.company) || "Firma";
  const initials = company.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "G";
  const blob = `${listing.title} ${listing.description ?? ""} ${listing.requirements ?? ""}`;
  const hours = detectHours(blob);
  const gender = detectGender(blob);
  const benefits = detectBenefits(blob);
  const { city, district } = splitCity(listing.city);
  const img = getListingImage(listing.title, listing.company, listing.companyLogoUrl, listing.id);
  const verified = !!(listing.companyLogoUrl || listing.authorId);
  const salary = (listing.salary || "").trim() || "Belirtilmedi";
  const detailHref = `/ilan/${listing.id}`;
  const resolvedApply = resolveApplyHref({
    applyUrl: listing.applyUrl,
    description: listing.description,
    requirements: listing.requirements,
    title: listing.title,
  });
  const applyHref = resolvedApply && resolvedApply !== "auth_required" ? resolvedApply : detailHref;
  const applyIsTel = applyHref.startsWith("tel:");
  const postedLabel = relativeTime(listing.createdAt);
  const isToday =
    postedLabel === "Az önce" ||
    postedLabel.includes("dk") ||
    postedLabel.includes("saat");

  const markReadAndNavigate = () => {
    markListingRead(listing.id);
    onNavigate?.();
  };

  return (
    <article className={`job-card${isRead ? " job-card--read" : ""}`}>
      {isRead && <span className="job-card__read-badge">Okundu</span>}
      {adminOverlay ? <div className="job-card__admin">{adminOverlay}</div> : null}

      <div className="job-card__header">
        <div className="job-card__logo" aria-hidden>
          {listing.companyLogoUrl ? (
            <img src={listing.companyLogoUrl} alt="" />
          ) : img ? (
            <img src={img} alt="" />
          ) : (
            <span className="job-card__logo-fallback">{initials}</span>
          )}
        </div>

        <div className="job-card__main">
          <h3 className="job-card__title">{listing.title}</h3>
          <div className="job-card__company-row">
            <span className="job-card__company">{company}</span>
            {verified && (
              <span className="job-card__verified">
                <BadgeCheck className="job-card__verified-icon" aria-hidden />
                Doğrulanmış
              </span>
            )}
          </div>
        </div>

        <div className="job-card__salary" title={salary}>{salary}</div>
      </div>

      <div className="job-card__meta">
        <span className="job-tag">
          <MapPin className="job-tag__icon job-tag__icon--amber" aria-hidden />
          <span className="job-tag__text">{district ? `${city} / ${district}` : city}</span>
        </span>
        {(district || city) && (
          <span className="job-tag">
            <Building2 className="job-tag__icon" aria-hidden />
            <span className="job-tag__text">{district || city}</span>
          </span>
        )}
        {hours && (
          <span className="job-tag">
            <Clock className="job-tag__icon job-tag__icon--sky" aria-hidden />
            <span className="job-tag__text">{hours}</span>
          </span>
        )}
        <span className="job-tag">
          <Briefcase className="job-tag__icon job-tag__icon--amber" aria-hidden />
          <span className="job-tag__text">{listing.workType || "Tam Zamanlı"}</span>
        </span>
        <span className="job-tag">
          <User className="job-tag__icon" aria-hidden />
          <span className="job-tag__text">{gender}</span>
        </span>
        <span className="job-tag">
          <Calendar className="job-tag__icon job-tag__icon--green" aria-hidden />
          <span className="job-tag__text">{isToday ? "Bugün" : postedLabel}</span>
        </span>
      </div>

      {benefits.length > 0 && (
        <>
          <div className="job-card__divider" aria-hidden />
          <div className="job-card__benefits">
            {benefits.map((b) => (
              <span key={b.key} className="job-benefit">
                <b.Icon className="job-benefit__icon" aria-hidden />
                <span className="job-benefit__text">{b.label}</span>
              </span>
            ))}
          </div>
        </>
      )}

      <div className="job-card__footer">
        <span className="job-card__date">
          <Clock className="job-card__date-icon" aria-hidden />
          {postedLabel}
        </span>
        <div className="job-card__actions">
          <Link href={detailHref} onClick={markReadAndNavigate} className="btn-details">
            Detaylar
          </Link>
          <a
            href={applyHref}
            className="btn-apply"
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
            Başvur <ArrowRight className="btn-apply__arrow" aria-hidden />
          </a>
        </div>
      </div>
    </article>
  );
}
