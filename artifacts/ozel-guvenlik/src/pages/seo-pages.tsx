import { useRoute, Redirect, useLocation } from "wouter";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import {
  SEO_BASE_URL, SEO_OG_IMAGE, buildCompanyDescription, buildCompanyTitle,
  buildListingsDescription, buildListingsTitle, breadcrumbSchema, truncateDescription,
} from "@/lib/seo-config";
import { getSeoCompany } from "@/lib/seo-companies";
import { getSeoKeywordPage } from "@/lib/seo-keywords";
import { getSeoBlogPost, SEO_BLOG_POSTS } from "@/lib/seo-blog";
import { buildCityFaqSchema } from "@/lib/seo-city-long-content";
import { SEO_CITY_CONTENTS, slugToCity } from "@/lib/seo-cities";
import Listings from "@/pages/listings";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { Link } from "wouter";

export function ListingsWithSeo() {
  const [location] = useLocation();
  const pageUrl = `${SEO_BASE_URL}/ilanlar`;
  const hasQuery = location.includes("?");
  useDocumentMeta({
    title: buildListingsTitle(),
    description: buildListingsDescription(),
    canonical: pageUrl,
    robots: hasQuery ? "noindex, follow" : undefined,
    ogImage: SEO_OG_IMAGE,
    ogType: "website",
    jsonLd: [
      breadcrumbSchema([
        { name: "Ana Sayfa", item: SEO_BASE_URL },
        { name: "İş İlanları", item: pageUrl },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: buildListingsTitle(),
        description: buildListingsDescription(),
        url: pageUrl,
      },
    ],
  });
  return <><h1 className="sr-only">Güncel Özel Güvenlik İş İlanları</h1><Listings /></>;
}

/**
 * Tek segment SEO yönlendirici.
 * Not: wouter'da `/:slug-is-ilanlari` kalıbı `/ankara` gibi tüm tek segmentleri
 * yanlışlıkla yakalıyordu (param adı hyphen içeriyor). Bu yüzden pathname parse ediyoruz.
 */
export function SeoPathPage() {
  const [location] = useLocation();
  const path = location.replace(/^\//, "").split("?")[0] ?? "";
  if (!path || path.includes("/")) return <NotFound />;

  const keyword = getSeoKeywordPage(path);
  if (keyword) return <KeywordSeoListings keyword={keyword} />;

  const longCity = path.match(/^([a-z0-9-]+)-ozel-guvenlik-is-ilanlari$/i);
  if (longCity?.[1] && slugToCity(longCity[1])) {
    return <Redirect to={`/${longCity[1]}`} />;
  }

  const companyMatch = path.match(/^([a-z0-9-]+)-is-ilanlari$/i);
  if (companyMatch?.[1]) {
    const company = getSeoCompany(companyMatch[1]);
    if (company) return <CompanySeoListings company={company} />;
  }

  const city = slugToCity(path);
  if (city) return <CityShortSeoPage city={city} slug={path} />;

  return <NotFound />;
}

/** @deprecated — SeoPathPage kullan */
export function SlugIsIlanlariPage() {
  return <SeoPathPage />;
}

/** @deprecated — SeoPathPage kullan */
export function CitySeoListingsEnhanced() {
  return <SeoPathPage />;
}

function KeywordSeoListings({ keyword }: { keyword: NonNullable<ReturnType<typeof getSeoKeywordPage>> }) {
  const pageUrl = `${SEO_BASE_URL}/${keyword.slug}`;
  useDocumentMeta({
    title: keyword.title,
    description: keyword.description,
    canonical: pageUrl,
    ogImage: SEO_OG_IMAGE,
    ogType: "website",
    jsonLd: breadcrumbSchema([
      { name: "Ana Sayfa", item: SEO_BASE_URL },
      { name: "İlanlar", item: `${SEO_BASE_URL}/ilanlar` },
      { name: keyword.h1, item: pageUrl },
    ]),
  });
  return <><h1 className="sr-only">{keyword.h1}</h1><Listings initialSearch={keyword.searchQuery} /></>;
}

function CompanySeoListings({ company }: { company: NonNullable<ReturnType<typeof getSeoCompany>> }) {
  const pageUrl = `${SEO_BASE_URL}/${company.slug}-is-ilanlari`;
  useDocumentMeta({
    title: buildCompanyTitle(company.name),
    description: company.description || buildCompanyDescription(company.name),
    canonical: pageUrl,
    ogImage: SEO_OG_IMAGE,
    ogType: "website",
    jsonLd: breadcrumbSchema([
      { name: "Ana Sayfa", item: SEO_BASE_URL },
      { name: "Firmalar", item: `${SEO_BASE_URL}/ilanlar` },
      { name: company.name, item: pageUrl },
    ]),
  });
  return <><h1 className="sr-only">{company.name} Özel Güvenlik İş İlanları</h1><Listings initialSearch={company.searchTerms[0]} /></>;
}

/** Kısa il sayfası: /ankara, /istanbul, /kocaeli … */
export function CityShortSeoPage({ city, slug }: { city: string; slug: string }) {
  const seo = SEO_CITY_CONTENTS[city];
  const pageUrl = `${SEO_BASE_URL}/${slug}`;

  useDocumentMeta({
    title: seo?.title ?? `${city} Özel Güvenlik İş İlanları`,
    description: seo?.description ?? "Türkiye genelinde özel güvenlik iş ilanları.",
    canonical: pageUrl,
    ogImage: SEO_OG_IMAGE,
    ogType: "website",
    jsonLd: [
      breadcrumbSchema([
        { name: "Ana Sayfa", item: SEO_BASE_URL },
        { name: "İlanlar", item: `${SEO_BASE_URL}/ilanlar` },
        { name: `${city} Özel Güvenlik İş İlanları`, item: pageUrl },
      ]),
      buildCityFaqSchema(city),
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: seo?.title ?? `${city} Özel Güvenlik İş İlanları`,
        description: seo?.description,
        url: pageUrl,
      },
    ],
  });

  return <><h1 className="sr-only">{city} Özel Güvenlik İş İlanları</h1><Listings initialCity={city} /></>;
}

export function BlogIndexPage() {
  const pageUrl = `${SEO_BASE_URL}/blog`;
  useDocumentMeta({
    title: "Özel Güvenlik Blog | İş Arama Rehberi ve Sektör Haberleri",
    description: truncateDescription(
      "Özel güvenlik sektörü blog yazıları: iş arama rehberi, maaş bilgileri, kimlik kartı süreci ve şehir bazlı güvenlik iş ilanları rehberleri.",
    ),
    canonical: pageUrl,
    ogImage: SEO_OG_IMAGE,
    ogType: "website",
    jsonLd: breadcrumbSchema([
      { name: "Ana Sayfa", item: SEO_BASE_URL },
      { name: "Blog", item: pageUrl },
    ]),
  });

  return (
    <Layout>
      <div className="sr-only" aria-hidden="false">
        <h1>Özel Güvenlik Blog</h1>
        <ul>
          {SEO_BLOG_POSTS.map(p => (
            <li key={p.slug}><Link href={`/blog/${p.slug}`}>{p.title}</Link></li>
          ))}
        </ul>
      </div>
      <Listings />
    </Layout>
  );
}

export function BlogPostPage() {
  const [, params] = useRoute("/blog/:postSlug");
  const slug = params?.postSlug ?? "";
  const post = getSeoBlogPost(slug);
  const pageUrl = `${SEO_BASE_URL}/blog/${slug}`;

  useDocumentMeta({
    title: post ? `${post.title} | Özel Güvenlik Blog` : "Blog | Özel Güvenlik",
    description: post?.description ?? "Özel güvenlik sektörü blog yazısı.",
    robots: post ? undefined : "noindex, follow",
    canonical: pageUrl,
    ogImage: SEO_OG_IMAGE,
    ogType: "article",
    jsonLd: post
      ? [
          breadcrumbSchema([
            { name: "Ana Sayfa", item: SEO_BASE_URL },
            { name: "Blog", item: `${SEO_BASE_URL}/blog` },
            { name: post.title, item: pageUrl },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.description,
            datePublished: post.publishedAt,
            author: { "@type": "Organization", name: "Özel Güvenlik Online" },
            publisher: { "@type": "Organization", name: "Özel Güvenlik Online", logo: { "@type": "ImageObject", url: SEO_OG_IMAGE } },
            mainEntityOfPage: pageUrl,
          },
        ]
      : undefined,
  });

  if (!post) return <NotFound />;

  return (
    <Layout>
      <article className="sr-only">
        <h1>{post.title}</h1>
        <p>{post.description}</p>
        {post.content.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
        <p><Link href="/ilanlar">Güncel İlanları Gör</Link></p>
      </article>
      <Listings />
    </Layout>
  );
}
