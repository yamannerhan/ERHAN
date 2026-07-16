import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Newspaper } from "lucide-react";
import "@/components/home-news-cards.css";

type NewsItem = {
  id: number;
  title: string;
  slug: string;
  excerpt?: string | null;
  coverImage?: string | null;
  category?: string | null;
  publishedAt?: string | null;
};

export default function HaberlerPage() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ page: String(page), limit: "12" });
        const res = await fetch(`/api/news?${sp}`);
        const json = await res.json() as { articles?: NewsItem[]; total?: number };
        if (!cancelled) {
          setItems(json.articles ?? []);
          setTotal(json.total ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / 12));

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1rem 1rem 5rem" }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: 8, color: "#0b3d6e", fontSize: "1.35rem", fontWeight: 800 }}>
          <Newspaper className="w-6 h-6 text-sky-600" /> Haberler
        </h1>
        <p style={{ color: "#5a7188", fontSize: 14, marginBottom: 16 }}>Özel güvenlik gündeminden seçilen haberler.</p>

        {loading && <p style={{ color: "#64748b" }}>Yükleniyor…</p>}
        {!loading && items.length === 0 && <p style={{ color: "#64748b" }}>Henüz haber yok.</p>}

        <div className="og-home-news__grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
          {items.map((item) => (
            <Link key={item.id} href={`/haberler/${item.slug}`} className="og-home-news__card">
              <span className="og-home-news__visual" aria-hidden>
                {item.coverImage ? (
                  <img
                    src={item.coverImage}
                    alt=""
                    loading="lazy"
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
                {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("tr-TR") : ""}
                <span className="og-home-news__read">Haberi Oku</span>
              </small>
            </Link>
          ))}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center" }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #cfe3f8" }}>Önceki</button>
            <span style={{ alignSelf: "center", color: "#64748b", fontSize: 13 }}>{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #cfe3f8" }}>Sonraki</button>
          </div>
        )}
      </div>
    </Layout>
  );
}
