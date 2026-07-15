import { db, listingsTable } from "@workspace/db";
import { asc, count } from "drizzle-orm";
import { SEO_BASE_URL, SEO_DISTRICTS, SEO_PROVINCES, toSlug } from "./seo-render";
import { indexableListingCondition } from "./seo-listing-policy";

export const JOB_SITEMAP_LIMIT = 5_000;

export const SEO_CATEGORY_SLUGS = [
  "silahli-guvenlik-is-ilanlari",
  "silahsiz-guvenlik-is-ilanlari",
  "avm-guvenlik-is-ilanlari",
  "fabrika-guvenlik-is-ilanlari",
  "site-guvenlik-is-ilanlari",
  "bay-guvenlik-is-ilanlari",
  "bayan-guvenlik-is-ilanlari",
];

export const SEO_COMPANY_SLUGS = [
  "securitas", "tepe-savunma", "iss", "g4s", "desmer", "pronet", "koruma-grubu", "prosegur",
];

export const SEO_BLOG_POSTS = [
  { slug: "ozel-guvenlik-is-ilanlari-nasil-bulunur", publishedAt: "2026-01-15" },
  { slug: "silahli-silahsiz-guvenlik-maaslari", publishedAt: "2026-02-01" },
  { slug: "ozel-guvenlik-kimlik-karti-nasil-alinir", publishedAt: "2026-02-10" },
  { slug: "istanbul-ozel-guvenlik-is-ilanlari-rehberi", publishedAt: "2026-03-01" },
  { slug: "kocaeli-gebze-guvenlik-is-ilanlari", publishedAt: "2026-03-05" },
];

type SitemapEntry = {
  url: string;
  lastmod?: Date | string | null;
};

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatLastmod(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const body = entries.map((entry) => {
    const lastmod = formatLastmod(entry.lastmod);
    return [
      "  <url>",
      `    <loc>${escapeXml(entry.url)}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      "  </url>",
    ].join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

function buildSitemapIndex(entries: SitemapEntry[]): string {
  const body = entries.map((entry) => {
    const lastmod = formatLastmod(entry.lastmod);
    return ["  <sitemap>", `    <loc>${escapeXml(entry.url)}</loc>`, ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []), "  </sitemap>"].join("\n");
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>`;
}

function sitemapIndexEntries(jobPageCount: number): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    { url: `${SEO_BASE_URL}/sitemap-pages.xml` },
    { url: `${SEO_BASE_URL}/sitemap-cities.xml` },
    { url: `${SEO_BASE_URL}/sitemap-districts.xml` },
    { url: `${SEO_BASE_URL}/sitemap-categories.xml` },
    { url: `${SEO_BASE_URL}/sitemap-companies.xml` },
    { url: `${SEO_BASE_URL}/sitemap-blog.xml`, lastmod: SEO_BLOG_POSTS.at(-1)?.publishedAt },
  ];
  for (let page = 1; page <= jobPageCount; page++) entries.push({ url: `${SEO_BASE_URL}/sitemap-jobs-${page}.xml` });
  return entries;
}

export function generateStaticSitemapIndexXml(): string {
  return buildSitemapIndex(sitemapIndexEntries(1));
}

export async function getJobSitemapPageCount(): Promise<number> {
  const rows = await db.select({ total: count() }).from(listingsTable).where(indexableListingCondition());
  return Math.max(1, Math.ceil(Number(rows[0]?.total ?? 0) / JOB_SITEMAP_LIMIT));
}

export async function generateSitemapIndexXml(): Promise<string> {
  return buildSitemapIndex(sitemapIndexEntries(await getJobSitemapPageCount()));
}

export function generatePagesSitemapXml(): string {
  return buildSitemapXml([{ url: `${SEO_BASE_URL}/` }, { url: `${SEO_BASE_URL}/ilanlar` }, { url: `${SEO_BASE_URL}/blog` }]);
}

export function generateCitiesSitemapXml(): string {
  return buildSitemapXml(SEO_PROVINCES.map((name) => ({ url: `${SEO_BASE_URL}/${toSlug(name)}` })));
}

export function generateDistrictsSitemapXml(): string {
  return buildSitemapXml(SEO_DISTRICTS.map((name) => ({ url: `${SEO_BASE_URL}/${toSlug(name)}` })));
}

export function generateCategoriesSitemapXml(): string {
  return buildSitemapXml(SEO_CATEGORY_SLUGS.map((slug) => ({ url: `${SEO_BASE_URL}/${slug}` })));
}

export function generateCompaniesSitemapXml(): string {
  return buildSitemapXml(SEO_COMPANY_SLUGS.map((slug) => ({ url: `${SEO_BASE_URL}/${slug}-is-ilanlari` })));
}

export function generateBlogSitemapXml(): string {
  return buildSitemapXml([
    { url: `${SEO_BASE_URL}/blog` },
    ...SEO_BLOG_POSTS.map((post) => ({ url: `${SEO_BASE_URL}/blog/${post.slug}`, lastmod: post.publishedAt })),
  ]);
}

export async function generateJobsSitemapXml(page: number): Promise<string | null> {
  const pageCount = await getJobSitemapPageCount();
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return null;
  const rows = await db
    .select({ id: listingsTable.id, updatedAt: listingsTable.updatedAt, publishedAt: listingsTable.publishedAt })
    .from(listingsTable)
    .where(indexableListingCondition())
    .orderBy(asc(listingsTable.id))
    .limit(JOB_SITEMAP_LIMIT)
    .offset((page - 1) * JOB_SITEMAP_LIMIT);
  return buildSitemapXml(rows.map((row) => ({ url: `${SEO_BASE_URL}/ilan/${row.id}`, lastmod: row.updatedAt ?? row.publishedAt })));
}
