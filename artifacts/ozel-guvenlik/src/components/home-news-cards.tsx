import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Newspaper, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

export function HomeNewsCards() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch("/api/news/home");
      const json = await res.json() as { articles?: NewsItem[] };
      setItems(Array.isArray(json.articles) ? json.articles.slice(0, 3) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

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

  const deleteArticle = async (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Bu haber silinsin mi?")) return;
    try {
      const r = await fetch(`/api/admin/news/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) throw new Error("Silinemedi");
      setItems((prev) => prev.filter((a) => a.id !== id));
      void load();
    } catch {
      window.alert("Haber silinemedi");
    }
  };

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
          <div key={item.id} className="og-home-news__card-wrap">
            <Link href={`/haberler/${item.slug}`} className="og-home-news__card">
              <span className="og-home-news__visual" aria-hidden>
                {item.coverImage ? (
                  <img
                    src={item.coverImage}
                    alt=""
                    width={640}
                    height={280}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (img.src.includes("/api/news/image?url=")) {
                        try {
                          const u = new URL(img.src, window.location.origin);
                          const raw = u.searchParams.get("url");
                          if (raw) { img.src = raw; return; }
                        } catch { /* ignore */ }
                      }
                      img.style.opacity = "0";
                    }}
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
            {isAdmin && (
              <button
                type="button"
                className="og-home-news__admin-del"
                title="Haberi sil"
                onClick={(e) => void deleteArticle(item.id, e)}
              >
                <Trash2 aria-hidden /> Sil
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
