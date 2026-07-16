import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Newspaper } from "lucide-react";
import "./home-news-cards.css";

type NewsItem = {
  id: number;
  title: string;
  slug: string;
  excerpt?: string | null;
  coverImage?: string | null;
  category?: string | null;
  publishedAt?: string | null;
  sourcePublishedAt?: string | null;
};

function relativeDate(value?: string | null): string {
  if (!value) return "Güncel";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Güncel";
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return "Az önce";
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Dün" : `${days} gün önce`;
}

export function HomeNewsCards() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/news/home");
        const json = await res.json() as { articles?: NewsItem[] };
        if (!cancelled) setItems(Array.isArray(json.articles) ? json.articles.slice(0, 3) : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="og-home-news" aria-labelledby="home-news-title">
      <div className="og-home-news__head">
        <h2 id="home-news-title">
          <Newspaper aria-hidden />
          Haberler
        </h2>
        <Link href="/haberler" className="og-home-news__all">
          Tümünü Gör <ChevronRight aria-hidden />
        </Link>
      </div>
      <div className="og-home-news__grid">
        {loading && [1, 2, 3].map((i) => (
          <article key={i} className="og-home-news__card og-home-news__card--skeleton" aria-hidden>
            <span className="og-home-news__visual" />
            <strong>&nbsp;</strong>
            <small>&nbsp;</small>
          </article>
        ))}
        {!loading && items.length === 0 && (
          <p className="og-home-news__empty">Henüz yayınlanmış haber yok. Yakında güncellenecek.</p>
        )}
        {!loading && items.map((item) => (
          <Link key={item.id} href={`/haberler/${item.slug}`} className="og-home-news__card">
            <span className="og-home-news__visual" aria-hidden>
              {item.coverImage ? (
                <img
                  src={item.coverImage}
                  alt=""
                  width={640}
                  height={280}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { e.currentTarget.remove(); }}
                />
              ) : null}
              <span>{item.category || "HABER"}</span>
            </span>
            <strong>{item.title}</strong>
            {item.excerpt ? <em className="og-home-news__excerpt">{item.excerpt}</em> : null}
            <small>
              {relativeDate(item.publishedAt || item.sourcePublishedAt)}
              <span className="og-home-news__read">Haberi Oku</span>
            </small>
          </Link>
        ))}
      </div>
    </section>
  );
}
