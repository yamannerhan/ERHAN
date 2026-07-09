import { useRoute } from "wouter";
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
  const pageUrl = `${SEO_BASE_URL}/ilanlar`;
  useDocumentMeta({
    title: buildListingsTitle(),
    description: buildListingsDescription(),
    canonical: pageUrl,
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
  return <Listings />;
}

export function SlugIsIlanlariPage() {
  const [, params] = useRoute("/:slug-is-ilanlari");
  const slug = params?.slug ?? "";
  const keyword = getSeoKeywordPage(slug);
  const company = getSeoCompany(slug);
  if (keyword) return <KeywordSeoListings keyword={keyword} />;
  if (company) return <CompanySeoListings company={company} />;
  return <NotFound />;
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
  return <Listings initialSearch={keyword.searchQuery} />;
}

function CompanySeoListings({ company }: { company: NonNullable<ReturnType<typeof getSeoCompany>> }) {
  const pageUrl = `${SEO_BASE_URL}/${company.slug}-is-ilanlari`;
  useDocumentMeta({
    title: buildCompanyTitle(company.name),
    description: buildCompanyDescription(company.name),
    canonical: pageUrl,
    ogImage: SEO_OG_IMAGE,
    ogType: "website",
    jsonLd: breadcrumbSchema([
      { name: "Ana Sayfa", item: SEO_BASE_URL },
      { name: "Firmalar", item: `${SEO_BASE_URL}/ilanlar` },
      { name: company.name, item: pageUrl },
    ]),
  });
  return <Listings initialSearch={company.searchTerms[0]} />;
}

export function CitySeoListingsEnhanced() {
  const [, params] = useRoute("/:slug-ozel-guvenlik-is-ilanlari");
  const slug = params?.slug ?? "";
  const city = slugToCity(slug);
  const seo = city ? SEO_CITY_CONTENTS[city] : null;
  const pageUrl = `${SEO_BASE_URL}/${slug}-ozel-guvenlik-is-ilanlari`;

  useDocumentMeta({
    title: seo?.title ?? `Özel Güvenlik İş İlanları`,
    description: seo?.description ?? "Türkiye genelinde özel güvenlik iş ilanları.",
    keywords: seo?.keywords,
    canonical: pageUrl,
    ogImage: SEO_OG_IMAGE,
    ogType: "website",
    jsonLd: city
      ? [
          breadcrumbSchema([
            { name: "Ana Sayfa", item: SEO_BASE_URL },
            { name: city, item: pageUrl },
            { name: "İş İlanları", item: `${SEO_BASE_URL}/ilanlar?city=${encodeURIComponent(city)}` },
          ]),
          buildCityFaqSchema(city),
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: seo?.title ?? `${city} Özel Güvenlik İş İlanları`,
            description: seo?.description,
            url: pageUrl,
          },
        ]
      : undefined,
  });

  if (!city) return <NotFound />;
  return <Listings initialCity={city} />;
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
