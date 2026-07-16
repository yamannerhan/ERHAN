import { Bell, FileText, Newspaper, Sparkles } from "lucide-react";
import { Link } from "wouter";
import "./home-ref-ui.css";

type HomeQuickCardsProps = {
  showNewsBadge: boolean;
  onNearClick?: () => void;
};

export function HomeQuickCards({
  showNewsBadge: _showNewsBadge,
  onNearClick: _onNearClick,
}: HomeQuickCardsProps) {
  return (
    <section className="og-ref-quick-row" aria-label="Hızlı erişim">
      <Link href="/bana-uygun-isler" className="og-ref-quick-card" aria-label="Bana uygun işler sayfasını aç">
        <div className="og-ref-quick-icon" aria-hidden>
          <Sparkles className="w-7 h-7" strokeWidth={1.8} />
        </div>
        <div className="og-ref-quick-title">Bana Uygun İşler</div>
        <div className="og-ref-quick-sub">Tercihine göre ilan bul</div>
      </Link>

      <Link href="/haberler" className="og-ref-quick-card" aria-label="Haberler sayfasını aç">
        <div className="og-ref-quick-icon" aria-hidden>
          <Newspaper className="w-7 h-7" strokeWidth={2} />
        </div>
        <div className="og-ref-quick-title">Haberler</div>
        <div className="og-ref-quick-sub">Güncel güvenlik haberleri</div>
      </Link>

      <div className="og-ref-quick-card" aria-label="Bildirimler yakında hizmetinizde">
        <div className="og-ref-quick-icon" aria-hidden>
          <Bell className="w-7 h-7" strokeWidth={2} />
        </div>
        <div className="og-ref-quick-title">Yakında Hizmetinizde</div>
        <div className="og-ref-quick-sub">Bildirimlerle haberdar olun</div>
      </div>

      <Link href="/cv-olustur" className="og-ref-quick-card" aria-label="CV oluşturma sayfasını aç">
        <div className="og-ref-quick-icon" aria-hidden>
          <FileText className="w-7 h-7" strokeWidth={2} />
        </div>
        <div className="og-ref-quick-title">CV Oluştur</div>
        <div className="og-ref-quick-sub">CV'ni hemen hazırla</div>
      </Link>
    </section>
  );
}
