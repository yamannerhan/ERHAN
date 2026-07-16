import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Newspaper, Search } from "lucide-react";
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

const CATEGORIES = [
  "Tümü",
  "Sektör Haberleri",
  "Mevzuat",
  "Eğitim ve Sınav",
  "Maaş ve Haklar",
  "Teknoloji",
  "Rehberler",
  "Firma ve Kurumlar",
  "Genel Haberler",
];

export default function HaberlerPage() {
  const search = useSearch();
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const qParam = params.get("q") || "";
  const [q, setQ] = useState(qParam);
  const [category, setCategory] = useState("Tümü");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setQ(qParam);
    setPage(1);
  }, [qParam]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ page: String(page), limit: "12" });
        if (q.trim()) sp.set("q", q.trim());
        if (category !== "Tümü") sp.set("category", category);
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
  }, [page, q, category]);

  const totalPages = Math.max(1, Math.ceil(total / 12));

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1rem 1rem 5rem" }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: 8, color: "#0b3d6e", fontSize: "1.35rem", fontWeight: 800 }}>
          <Newspaper className="w-6 h-6 text-sky-600" /> Haberler
        </h1>
        <p style={{ color: "#5a7188", fontSize: 14, marginBottom: 16 }}>Özel güvenlik gündeminden seçilen haberler.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setQ(String(fd.get("q") || ""));
            setPage(1);
          }}
          style={{ display: "flex", gap: 8, marginBottom: 12 }}
        >
          <div style={{ flex: 1, position: "relative" }}>
            <Search style={{ position: "absolute", left: 10, top: 11, width: 16, height: 16, color: "#94a3b8" }} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Haber ara…"
              style={{
                width: "100%",
                padding: "10px 12px 10px 34px",
                borderRadius: 12,
                border: "1px solid #cfe3f8",
                fontSize: 14,
              }}
            />
          </div>
          <button type="submit" style={{ padding: "10px 14px", borderRadius: 12, background: "#0878e8", color: "#fff", fontWeight: 700, border: "none" }}>
            Ara
          </button>
        </form>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setCategory(c); setPage(1); }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #cfe3f8",
                background: category === c ? "#0878e8" : "#fff",
                color: category === c ? "#fff" : "#0b3d6e",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: "#64748b" }}>Yükleniyor…</p>}
        {!loading && items.length === 0 && <p style={{ color: "#64748b" }}>Henüz haber yok.</p>}

        <div className="og-home-news__grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
          {items.map((item) => (
            <Link key={item.id} href={`/haberler/${item.slug}`} className="og-home-news__card">
              <span className="og-home-news__visual" aria-hidden>
                <img
                  src={item.coverImage || "/news/security-exam.png"}
                  alt=""
                  loading="lazy"
                  onError={(e) => { e.currentTarget.src = "/news/security-exam.png"; }}
                />
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
