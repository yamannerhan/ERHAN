import { db, listingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { SEO_BASE_URL, toSlug, ALL_LOCATIONS } from "./seo-render";

const SEO_KEYWORD_SLUGS = [
  "silahli-guvenlik-is-ilanlari",
  "silahsiz-guvenlik-is-ilanlari",
  "avm-guvenlik-is-ilanlari",
  "fabrika-guvenlik-is-ilanlari",
  "site-guvenlik-is-ilanlari",
  "bay-guvenlik-is-ilanlari",
  "bayan-guvenlik-is-ilanlari",
];

const SEO_COMPANY_SLUGS = [
  "securitas", "tepe-savunma", "iss", "g4s", "desmer", "pronet", "koruma-grubu", "prosegur",
];

const SEO_BLOG_SLUGS = [
  "ozel-guvenlik-is-ilanlari-nasil-bulunur",
  "silahli-silahsiz-guvenlik-maaslari",
  "ozel-guvenlik-kimlik-karti-nasil-alinir",
  "istanbul-ozel-guvenlik-is-ilanlari-rehberi",
  "kocaeli-gebze-guvenlik-is-ilanlari",
];

export async function generateSitemapXml(): Promise<string> {
  const staticUrls = [
    { url: `${SEO_BASE_URL}/`, priority: "1.0", changefreq: "daily" },
    { url: `${SEO_BASE_URL}/ilanlar`, priority: "0.9", changefreq: "daily" },
    { url: `${SEO_BASE_URL}/blog`, priority: "0.8", changefreq: "weekly" },
    { url: `${SEO_BASE_URL}/ilan-ekle`, priority: "0.5", changefreq: "monthly" },
    { url: `${SEO_BASE_URL}/cv-olustur`, priority: "0.6", changefreq: "monthly" },
    { url: `${SEO_BASE_URL}/part-time`, priority: "0.6", changefreq: "weekly" },
    { url: `${SEO_BASE_URL}/destek`, priority: "0.5", changefreq: "monthly" },
  ];

  const cityUrls = ALL_LOCATIONS.map(name => ({
    url: `${SEO_BASE_URL}/${toSlug(name)}-ozel-guvenlik-is-ilanlari`,
    priority: "0.8",
    changefreq: "daily",
  }));

  const keywordUrls = SEO_KEYWORD_SLUGS.map(slug => ({
    url: `${SEO_BASE_URL}/${slug}`,
    priority: "0.75",
    changefreq: "weekly",
  }));

  const companyUrls = SEO_COMPANY_SLUGS.map(slug => ({
    url: `${SEO_BASE_URL}/${slug}-is-ilanlari`,
    priority: "0.75",
    changefreq: "weekly",
  }));

  const blogUrls = SEO_BLOG_SLUGS.map(slug => ({
    url: `${SEO_BASE_URL}/blog/${slug}`,
    priority: "0.7",
    changefreq: "monthly",
  }));

  let listingUrls: { url: string; priority: string; changefreq: string; lastmod: string }[] = [];
  try {
    const rows = await db
      .select({ id: listingsTable.id, updatedAt: listingsTable.updatedAt })
      .from(listingsTable)
      .where(eq(listingsTable.status, "active"))
      .orderBy(desc(listingsTable.updatedAt));
    listingUrls = rows.map(r => ({
      url: `${SEO_BASE_URL}/ilan/${r.id}`,
      priority: "0.8",
      changefreq: "daily",
      lastmod: (r.updatedAt ?? new Date()).toISOString(),
    }));
  } catch { /* ignore */ }

  const all = [...staticUrls, ...cityUrls, ...keywordUrls, ...companyUrls, ...blogUrls, ...listingUrls];
  const entries = all.map(u => {
    const lm = "lastmod" in u ? u.lastmod : new Date().toISOString();
    return `  <url>\n    <loc>${u.url}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}
