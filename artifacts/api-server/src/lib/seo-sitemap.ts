import { db, listingsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { ALL_LOCATIONS, SEO_BASE_URL, toSlug } from "./seo-render";
import { logger } from "./logger";

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

type SitemapEntry = {
  url: string;
  priority: string;
  changefreq: string;
  lastmod?: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatLastmod(value?: Date | string | null): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function buildSitemapXml(entries: SitemapEntry[]): string {
  const body = entries.map((entry) => {
    const lastmod = formatLastmod(entry.lastmod);
    return [
      "  <url>",
      `    <loc>${escapeXml(entry.url)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${entry.changefreq}</changefreq>`,
      `    <priority>${entry.priority}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

function getStaticSitemapEntries(): SitemapEntry[] {
  const staticUrls: SitemapEntry[] = [
    { url: `${SEO_BASE_URL}/`, priority: "1.0", changefreq: "daily" },
    { url: `${SEO_BASE_URL}/ilanlar`, priority: "0.9", changefreq: "daily" },
    { url: `${SEO_BASE_URL}/blog`, priority: "0.8", changefreq: "weekly" },
    { url: `${SEO_BASE_URL}/ilan-ekle`, priority: "0.5", changefreq: "monthly" },
    { url: `${SEO_BASE_URL}/cv-olustur`, priority: "0.6", changefreq: "monthly" },
    { url: `${SEO_BASE_URL}/part-time`, priority: "0.6", changefreq: "weekly" },
    { url: `${SEO_BASE_URL}/destek`, priority: "0.5", changefreq: "monthly" },
  ];

  const cityUrls = ALL_LOCATIONS.map((name) => ({
    url: `${SEO_BASE_URL}/${toSlug(name)}-ozel-guvenlik-is-ilanlari`,
    priority: "0.8",
    changefreq: "daily",
  }));

  const keywordUrls = SEO_KEYWORD_SLUGS.map((slug) => ({
    url: `${SEO_BASE_URL}/${slug}`,
    priority: "0.75",
    changefreq: "weekly",
  }));

  const companyUrls = SEO_COMPANY_SLUGS.map((slug) => ({
    url: `${SEO_BASE_URL}/${slug}-is-ilanlari`,
    priority: "0.75",
    changefreq: "weekly",
  }));

  const blogUrls = SEO_BLOG_SLUGS.map((slug) => ({
    url: `${SEO_BASE_URL}/blog/${slug}`,
    priority: "0.7",
    changefreq: "monthly",
  }));

  return [...staticUrls, ...cityUrls, ...keywordUrls, ...companyUrls, ...blogUrls];
}

export function generateStaticSitemapXml(): string {
  return buildSitemapXml(getStaticSitemapEntries());
}

export async function generateSitemapXml(): Promise<string> {
  const entries = getStaticSitemapEntries();

  try {
    const rows = await db
      .select({ id: listingsTable.id, updatedAt: listingsTable.updatedAt })
      .from(listingsTable)
      .where(and(eq(listingsTable.status, "active"), eq(listingsTable.isActive, true)))
      .orderBy(desc(listingsTable.updatedAt));

    for (const row of rows) {
      entries.push({
        url: `${SEO_BASE_URL}/ilan/${row.id}`,
        priority: "0.8",
        changefreq: "daily",
        lastmod: formatLastmod(row.updatedAt),
      });
    }
  } catch (err) {
    logger.warn({ err }, "Sitemap listing query failed; serving static URLs only");
  }

  return buildSitemapXml(entries);
}
