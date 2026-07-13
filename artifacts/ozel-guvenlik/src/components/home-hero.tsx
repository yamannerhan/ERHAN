import { BRAND_LOGO_URL } from "@/lib/brand-logo";
import "./home-hero.css";

type Props = {
  totalCount?: number;
};

export function HomeHero({ totalCount = 0 }: Props) {
  return (
    <section className="og-home-hero" aria-label="ozelguvenlik.online">
      <img
        src={BRAND_LOGO_URL}
        alt="ozelguvenlik.online logosu"
        className="og-home-hero__logo"
        width={72}
        height={72}
        decoding="async"
      />
      <div className="og-home-hero__body">
        <h1 className="og-home-hero__title">
          <span>ozelguvenlik</span>.online
        </h1>
        <p className="og-home-hero__sub">
          Türkiye&apos;nin özel güvenlik iş ilanları platformu — bay &amp; bayan personel alımları
        </p>
        {totalCount > 0 && (
          <div className="og-home-hero__stats">
            <span className="og-home-hero__pill">{totalCount.toLocaleString("tr-TR")} aktif ilan</span>
            <span className="og-home-hero__pill">Ücretsiz başvuru</span>
          </div>
        )}
      </div>
    </section>
  );
}
