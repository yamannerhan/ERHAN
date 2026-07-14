import { Link } from "wouter";
import { Bookmark, LayoutGrid, List } from "lucide-react";
import { displayCompany } from "@/lib/utils";
import { markListingRead } from "@/lib/read-listings";
import { resolveApplyHref } from "@/lib/apply-url";
import { isRealCompanyLogo, resolveCompanyLogo } from "@/lib/brand-logo";
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
  onToggleSort: () => void;
  onNavigate?: () => void;
  savedIds: Set<number>;
  onToggleSave: (e: React.MouseEvent, id: number) => void;
};

export function DesktopListingsTable({
  listings,
  totalCount,
  sortNewest,
  onToggleSort,
  onNavigate,
  savedIds,
  onToggleSave,
}: Props) {
  return (
    <div className="desktop-listings-table desktop-home">
      <div className="desktop-listings-table__toolbar">
        <h2 className="desktop-listings-table__title">
          Tüm İlanlar
          <span className="desktop-listings-table__badge">{totalCount.toLocaleString("tr-TR")}</span>
        </h2>
        <div className="desktop-listings-table__tools">
          <button type="button" className="desktop-listings-table__sort" onClick={onToggleSort}>
            Sırala: <strong>{sortNewest === "new" ? "Yeni Eklenen" : "Eski Önce"}</strong>
          </button>
          <span className="desktop-listings-table__view-btns" aria-hidden>
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
        <table className="desktop-listings-table__table">
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
                <tr key={listing.id}>
                  <td>
                    <Link
                      href={detailHref}
                      className="desktop-listings-table__job"
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
                      />
                      <span className="desktop-listings-table__job-title">{listing.title}</span>
                    </Link>
                  </td>
                  <td>
                    <span className="desktop-listings-table__muted">{company}</span>
                  </td>
                  <td>
                    <span className="desktop-listings-table__muted">{listing.city}</span>
                  </td>
                  <td>
                    <span className="desktop-listings-table__muted">{listing.workType || "—"}</span>
                  </td>
                  <td>
                    <span className="desktop-listings-table__salary">{salary}</span>
                  </td>
                  <td className="desktop-listings-table__col-date">
                    <span className="desktop-listings-table__muted">{formatDate(listing.createdAt)}</span>
                  </td>
                  <td>
                    <a
                      href={applyHref}
                      className="desktop-listings-table__apply"
                      target={applyHref.startsWith("http") ? "_blank" : undefined}
                      rel={applyHref.startsWith("http") ? "noopener noreferrer" : undefined}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Başvur
                    </a>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`desktop-listings-table__save${isSaved ? " is-on" : ""}`}
                      aria-label={isSaved ? "Kayıttan çıkar" : "Kaydet"}
                      onClick={(e) => onToggleSave(e, listing.id)}
                    >
                      <Bookmark size={16} />
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
