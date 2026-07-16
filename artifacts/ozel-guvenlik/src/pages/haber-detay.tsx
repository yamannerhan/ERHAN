import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { useDocumentMeta } from "@/hooks/use-document-meta";

type Article = {
  id: number;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  coverImage?: string | null;
  category?: string | null;
  publishedAt?: string | null;
  sourcePublishedAt?: string | null;
  publicationType?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  externalUrl?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
};

export default function HaberDetayPage() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      try {
        const res = await fetch(`/api/news/${encodeURIComponent(slug)}`);
        const json = await res.json() as { article?: Article; error?: string };
        if (!res.ok) {
          setError(json.error || "Haber bulunamadı");
          return;
        }
        setArticle(json.article ?? null);
      } catch {
        setError("Bağlantı hatası");
      }
    })();
  }, [slug]);

  const canonical = article
    ? `${window.location.origin}/haberler/${article.slug}`
    : null;

  const jsonLd = useMemo(() => {
    if (!article) return undefined;
    return [
      {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: article.title,
        description: article.metaDescription || article.excerpt || undefined,
        image: article.coverImage || undefined,
        datePublished: article.publishedAt || article.sourcePublishedAt || undefined,
        dateModified: article.publishedAt || article.sourcePublishedAt || undefined,
        mainEntityOfPage: canonical || undefined,
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: `${window.location.origin}/` },
          { "@type": "ListItem", position: 2, name: "Haberler", item: `${window.location.origin}/haberler` },
          { "@type": "ListItem", position: 3, name: article.title, item: canonical },
        ],
      },
    ];
  }, [article, canonical]);

  useDocumentMeta({
    title: article ? `${article.metaTitle || article.title} | Özel Güvenlik` : "Haber",
    description: article?.metaDescription || article?.excerpt || undefined,
    canonical,
    ogImage: article?.coverImage || undefined,
    ogType: "article",
    jsonLd,
  });

  const bodyHtml = article?.content
    || (article?.excerpt ? `<p>${article.excerpt}</p>` : "");

  return (
    <Layout headerVariant="news">
      <article style={{ maxWidth: 760, margin: "0 auto", padding: "1rem 1rem 5rem" }}>
        <Link href="/haberler" style={{ color: "#0878e8", fontSize: 13, fontWeight: 700 }}>← Tüm Haberler</Link>
        {error && <p style={{ color: "#b91c1c", marginTop: 16 }}>{error}</p>}
        {!article && !error && <p style={{ color: "#64748b", marginTop: 16 }}>Yükleniyor…</p>}
        {article && (
          <>
            <p style={{ marginTop: 12, color: "#0878e8", fontSize: 12, fontWeight: 800 }}>{article.category}</p>
            <h1 style={{ color: "#0b3d6e", fontSize: "1.5rem", fontWeight: 850, lineHeight: 1.25, margin: "6px 0 10px" }}>{article.title}</h1>
            <p style={{ color: "#71849b", fontSize: 13, marginBottom: 14 }}>
              {(article.publishedAt || article.sourcePublishedAt)
                ? new Date(article.publishedAt || article.sourcePublishedAt || "").toLocaleString("tr-TR")
                : ""}
              {article.sourceName ? ` · ${article.sourceName}` : ""}
            </p>
            {article.coverImage && (
              <img
                src={article.coverImage}
                alt={article.title}
                referrerPolicy="no-referrer"
                style={{ width: "100%", borderRadius: 16, marginBottom: 16, maxHeight: 420, objectFit: "cover" }}
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src.includes("/api/news/image?url=")) {
                    try {
                      const u = new URL(img.src, window.location.origin);
                      const raw = u.searchParams.get("url");
                      if (raw) { img.src = raw; return; }
                    } catch { /* ignore */ }
                  }
                  img.style.display = "none";
                }}
              />
            )}
            {article.excerpt && article.publicationType !== "full" && (
              <p style={{ color: "#334155", fontSize: 15, lineHeight: 1.55, marginBottom: 14 }}>{article.excerpt}</p>
            )}
            {bodyHtml && (
              <div
                className="og-news-body"
                style={{ color: "#1e293b", fontSize: 15.5, lineHeight: 1.75 }}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            )}
            {article.externalUrl && (
              <p style={{ marginTop: 20 }}>
                <a
                  href={article.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#0878e8",
                    fontWeight: 800,
                    fontSize: 14,
                    textDecoration: "underline",
                  }}
                >
                  Habere git →
                </a>
              </p>
            )}
            <style>{`
              .og-news-body p { margin: 0 0 1em; }
              .og-news-body img { max-width: 100%; height: auto; border-radius: 12px; margin: 12px 0; }
              .og-news-body h2, .og-news-body h3 { color: #0b3d6e; margin: 1.1em 0 0.5em; font-weight: 800; }
              .og-news-body ul, .og-news-body ol { padding-left: 1.25em; margin: 0 0 1em; }
              .og-news-body a { color: #0878e8; }
            `}</style>
          </>
        )}
      </article>
    </Layout>
  );
}
