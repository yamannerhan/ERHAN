import type { ReactNode } from "react";
import { Briefcase, Newspaper, FileText, MapPin } from "lucide-react";
import "./home-ref-ui.css";

/** Tasarım hazır olunca ilgili kartı true yapın — link/onClick tekrar açılır */
const QUICK_CARDS_ENABLED = {
  news: false,
  near: true,
} as const;

type HomeQuickCardsProps = {
  showNewsBadge: boolean;
  onNearClick?: () => void;
};

function SoonQuickCard({ children }: { children: ReactNode }) {
  return (
    <div className="og-ref-quick-card og-ref-quick-card--soon" aria-disabled="true">
      <div className="og-ref-quick-soon-overlay">
        <span>Çok yakında hizmetinizde</span>
      </div>
      {children}
    </div>
  );
}

export function HomeQuickCards({
  showNewsBadge,
  onNearClick,
}: HomeQuickCardsProps) {
  return (
    <section className="og-ref-quick-row" aria-label="Hızlı erişim">
      <div className="og-ref-quick-card og-ref-quick-card--disabled" aria-disabled="true">
        <div className="og-ref-quick-icon" aria-hidden>
          <Briefcase className="w-4 h-4" strokeWidth={2.25} />
        </div>
        <div className="og-ref-quick-title">Bana Uygun İş İlanları</div>
        <div className="og-ref-quick-sub">Yakında</div>
      </div>

      {QUICK_CARDS_ENABLED.news ? (
        <a href="/blog" className="og-ref-quick-card">
          {showNewsBadge && <span className="og-ref-quick-badge">Yeni</span>}
          <div className="og-ref-quick-icon" aria-hidden>
            <Newspaper className="w-4 h-4" strokeWidth={2.25} />
          </div>
          <div className="og-ref-quick-title">Haberler</div>
          <div className="og-ref-quick-sub">Güncel</div>
        </a>
      ) : (
        <SoonQuickCard>
          <div className="og-ref-quick-icon" aria-hidden>
            <Newspaper className="w-4 h-4" strokeWidth={2.25} />
          </div>
          <div className="og-ref-quick-title">Haberler</div>
          <div className="og-ref-quick-sub">Güncel</div>
        </SoonQuickCard>
      )}

      {QUICK_CARDS_ENABLED.near ? (
        <button type="button" className="og-ref-quick-card" onClick={onNearClick}>
          <div className="og-ref-quick-icon" aria-hidden>
            <MapPin className="w-4 h-4" strokeWidth={2.25} />
          </div>
          <div className="og-ref-quick-title">Yakınımda</div>
          <div className="og-ref-quick-sub">Yakındaki ilanları keşfet</div>
        </button>
      ) : (
        <SoonQuickCard>
          <div className="og-ref-quick-icon" aria-hidden>
            <MapPin className="w-4 h-4" strokeWidth={2.25} />
          </div>
          <div className="og-ref-quick-title">Yakınımda</div>
          <div className="og-ref-quick-sub">Yakındaki ilanları keşfet</div>
        </SoonQuickCard>
      )}

      <a href="/cv-olustur" className="og-ref-quick-card">
        <div className="og-ref-quick-icon" aria-hidden>
          <FileText className="w-4 h-4" strokeWidth={2.25} />
        </div>
        <div className="og-ref-quick-title">CV Oluştur</div>
        <div className="og-ref-quick-sub">CV'ni hemen hazırla</div>
      </a>
    </section>
  );
}
