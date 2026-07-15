import { ChevronRight, Newspaper } from "lucide-react";
import "./home-news-cards.css";

type HomeAnnouncement = {
  id: number;
  content?: string | null;
  createdAt?: string | Date | null;
};

const SAMPLE_NEWS = [
  {
    id: -1,
    content: "Özel Güvenlik Kimlik Yenileme İşlemleri 2026",
    relative: "1 saat önce",
    imageName: "security-id-renewal",
  },
  {
    id: -2,
    content: "2026 Yılı ÖGG Maaşları ve Çalışma Koşulları",
    relative: "3 saat önce",
    imageName: "security-salaries",
  },
  {
    id: -3,
    content: "Güncel Özel Güvenlik Sınav Takvimi Açıklandı",
    relative: "5 saat önce",
    imageName: "security-exam",
  },
] as const;

function relativeDate(value?: string | Date | null): string {
  if (!value) return "Güncel";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Güncel";
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return "Az önce";
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Dün" : `${days} gün önce`;
}

export function HomeNewsCards({ announcements }: { announcements: HomeAnnouncement[] }) {
  const liveItems = announcements.filter((item) => item.content?.trim()).slice(0, 3);
  const items = [
    ...liveItems.map((item, index) => ({
        ...item,
        relative: relativeDate(item.createdAt),
        imageName: SAMPLE_NEWS[index]?.imageName ?? SAMPLE_NEWS[0].imageName,
      })),
    ...SAMPLE_NEWS.slice(liveItems.length),
  ].slice(0, 3);

  return (
    <section className="og-home-news" aria-labelledby="home-news-title">
      <div className="og-home-news__head">
        <h2 id="home-news-title">
          <Newspaper aria-hidden />
          Haberler
        </h2>
        <span className="og-home-news__all" aria-hidden>
          Tümünü Gör <ChevronRight aria-hidden />
        </span>
      </div>
      <div className="og-home-news__grid">
        {items.map((item) => (
          <article
            key={item.id}
            className="og-home-news__card"
          >
            <span className="og-home-news__visual" aria-hidden>
              <picture>
                <source
                  type="image/avif"
                  srcSet={`/news/${item.imageName}-320.avif 320w, /news/${item.imageName}-640.avif 640w`}
                  sizes="33vw"
                />
                <source
                  type="image/webp"
                  srcSet={`/news/${item.imageName}-320.webp 320w, /news/${item.imageName}-640.webp 640w`}
                  sizes="33vw"
                />
                <img
                  src={`/news/${item.imageName}.png`}
                  alt=""
                  width={640}
                  height={280}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <span>HABER</span>
            </span>
            <strong>{item.content!.trim()}</strong>
            <small>{item.relative}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
