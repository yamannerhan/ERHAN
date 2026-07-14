import type { ReactNode } from "react";
import { Briefcase, Newspaper, Calculator, MapPin } from "lucide-react";
import "./home-ref-ui.css";

/** Tasarım hazır olunca ilgili kartı true yapın — link/onClick tekrar açılır */
const QUICK_CARDS_ENABLED = {
  news: false,
  tools: false,
  near: true,
} as const;

type HomeQuickCardsProps = {
  totalCount: number;
  showNewsBadge: boolean;
  onTotalClick?: () => void;
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
  totalCount,
  showNewsBadge,
  onTotalClick,
  onNearClick,
}: HomeQuickCardsProps) {
  return (
    <section className="og-ref-quick-row" aria-label="Hızlı erişim">
      <button type="button" className="og-ref-quick-card" onClick={onTotalClick}>
        <div className="og-ref-quick-icon" aria-hidden>
          <Briefcase className="w-4 h-4" strokeWidth={2.25} />
        </div>
        <div className="og-ref-quick-value">{totalCount.toLocaleString("tr-TR")}</div>
        <div className="og-ref-quick-sub">Toplam İlan</div>
      </button>

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

      {QUICK_CARDS_ENABLED.tools ? (
        <a href="/blog/ozel-guvenlik-kimlik-karti-nasil-alinir" className="og-ref-quick-card">
          <div className="og-ref-quick-icon" aria-hidden>
            <Calculator className="w-4 h-4" strokeWidth={2.25} />
          </div>
          <div className="og-ref-quick-title">ÖGG Araçları</div>
          <div className="og-ref-quick-sub">Hesapla &amp; Kontrol Et</div>
        </a>
      ) : (
        <SoonQuickCard>
          <div className="og-ref-quick-icon" aria-hidden>
            <Calculator className="w-4 h-4" strokeWidth={2.25} />
          </div>
          <div className="og-ref-quick-title">ÖGG Araçları</div>
          <div className="og-ref-quick-sub">Hesapla &amp; Kontrol Et</div>
        </SoonQuickCard>
      )}

      {QUICK_CARDS_ENABLED.near ? (
        <button type="button" className="og-ref-quick-card" onClick={onNearClick}>
          <div className="og-ref-quick-icon" aria-hidden>
            <MapPin className="w-4 h-4" strokeWidth={2.25} />
          </div>
          <div className="og-ref-quick-title">Yakınımdaki İlanlar</div>
          <div className="og-ref-quick-sub">Konumuna en yakın iş fırsatlarını keşfet</div>
          <div className="og-ref-quick-value" style={{ fontSize: "0.7rem", marginTop: 4, opacity: 0.85 }}>10 km çevrende</div>
        </button>
      ) : (
        <SoonQuickCard>
          <div className="og-ref-quick-icon" aria-hidden>
            <MapPin className="w-4 h-4" strokeWidth={2.25} />
          </div>
          <div className="og-ref-quick-title">Yakınımdaki İlanlar</div>
          <div className="og-ref-quick-sub">Konumuna en yakın iş fırsatlarını keşfet</div>
        </SoonQuickCard>
      )}
    </section>
  );
}
