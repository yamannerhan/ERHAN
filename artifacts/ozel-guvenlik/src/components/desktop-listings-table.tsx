import { Link, useLocation } from "wouter";
import { Bookmark, LayoutGrid, List } from "lucide-react";
import { displayCompany } from "@/lib/utils";
import { markListingRead } from "@/lib/read-listings";
import { resolveApplyHref } from "@/lib/apply-url";
import { isRealCompanyLogo, resolveCompanyLogo, useBrandLogoFallback } from "@/lib/brand-logo";
import type { JobCardListing } from "@/components/job-listing-card";

function formatSalary(raw?: string | null): string {
  const s = (raw || "").trim();
  if (!s || /belirtilmedi|g[oö]r[uü][sş]me/i.test(s)) return "Görüşmede";
  return s.replace(/\s+/g, " ").trim();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

type Props = {
  listings: JobCardListing[];
  totalCount: number;
  sortNewest: "new" | "old";
  sortLabel?: string;
  onToggleSort: () => void;
  onNavigate?: () => void;
  savedIds: Set<number>;
  onToggleSave: (e: React.MouseEvent, id: number) => void;
};

export function DesktopListingsTable({
  listings,
  totalCount,
  sortNewest,
  sortLabel,
  onToggleSort,
  onNavigate,
  savedIds,
  onToggleSave,
}: Props) {
  const [, navigate] = useLocation();

  const openListing = (id: number) => {
    markListingRead(id);
    onNavigate?.();
    navigate(`/ilan/${id}`);
  };

  return (
    <div className="desktop-listings-table desktop-home">
      <div className="desktop-listings-table__toolbar">
        <div className="desktop-listings-table__heading">
          <h2 className="desktop-listings-table__heading-title">Tüm İlanlar</h2>
          <span className="desktop-listings-table__count-badge">{totalCount.toLocaleString("tr-TR")}</span>
        </div>
        <div className="desktop-listings-table__controls">
          <button type="button" className="desktop-listings-table__sort" onClick={onToggleSort}>
            Sırala: <strong>{sortLabel ?? (sortNewest === "new" ? "Yeni Eklenen" : "Eski Önce")}</strong>
          </button>
          <span className="desktop-listings-table__view-toggle" aria-hidden>
            <button type="button" className="desktop-listings-table__view-btn" title="Grid" disabled>
              <LayoutGrid size={16} />
            </button>
            <button type="button" className="desktop-listings-table__view-btn is-active" title="Liste">
              <List size={16} />
            </button>
          </span>
        </div>
      </div>

      <div className="desktop-listings-table__scroll">
        <table>
          <thead>
            <tr>
              <th>İlan Başlığı</th>
              <th>Firma</th>
              <th>Konum</th>
              <th>Çalışma Şekli</th>
              <th>Maaş</th>
              <th className="desktop-listings-table__col-date">Eklenme Tarihi</th>
              <th>Başvur</th>
              <th>Kaydet</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => {
              const company = displayCompany(listing.company) || "Firma";
              const logo = resolveCompanyLogo(listing.companyLogoUrl);
              const hasOwnLogo = isRealCompanyLogo(listing.companyLogoUrl);
              const salary = formatSalary(listing.salary);
              const detailHref = `/ilan/${listing.id}`;
              const resolvedApply = resolveApplyHref({
                applyUrl: listing.applyUrl,
                description: listing.description,
                requirements: listing.requirements,
                title: listing.title,
              });
              const applyHref = resolvedApply && resolvedApply !== "auth_required" ? resolvedApply : detailHref;
              const isSaved = savedIds.has(listing.id) || !!listing.isFavoritedByMe;

              return (
                <tr
                  key={listing.id}
                  className="desktop-listings-table__row-clickable"
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    const t = e.target as HTMLElement;
                    if (t.closest("a, button")) return;
                    openListing(listing.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    const t = e.target as HTMLElement;
                    if (t.closest("a, button")) return;
                    e.preventDefault();
                    openListing(listing.id);
                  }}
                >
                  <td>
                    <Link
                      href={detailHref}
                      className="desktop-listings-table__title-cell"
                      onClick={() => {
                        markListingRead(listing.id);
                        onNavigate?.();
                      }}
                    >
                      <img
                        src={logo}
                        alt=""
                        className={`desktop-listings-table__logo${hasOwnLogo ? "" : " is-brand"}`}
                        loading="lazy"
                        onError={(event) => useBrandLogoFallback(event.currentTarget)}
                      />
                      <span className="desktop-listings-table__title-text">{listing.title}</span>
                    </Link>
                  </td>
                  <td>
                    <span className="desktop-listings-table__company">{company}</span>
                  </td>
                  <td>
                    <span className="desktop-listings-table__location">{listing.city}</span>
                  </td>
                  <td>
                    <span className="desktop-listings-table__type">{listing.workType || "—"}</span>
                  </td>
                  <td>
                    <span className="desktop-listings-table__salary">{salary}</span>
                  </td>
                  <td className="desktop-listings-table__col-date">
                    <span className="desktop-listings-table__date">{formatDate(listing.createdAt)}</span>
                  </td>
                  <td>
                    <div className="desktop-listings-table__actions">
                      <a
                        href={applyHref}
                        className="desktop-listings-table__apply-btn"
                        target={applyHref.startsWith("http") ? "_blank" : undefined}
                        rel={applyHref.startsWith("http") ? "noopener noreferrer" : undefined}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Başvur
                      </a>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`desktop-listings-table__save-btn${isSaved ? " is-saved" : ""}`}
                      aria-label={isSaved ? "Kayıttan çıkar" : "Kaydet"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSave(e, listing.id);
                      }}
                    >
                      <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
