import { db, listingsTable, newsArticlesTable } from "@workspace/db";
import { and, asc, desc, eq, lte, or, sql } from "drizzle-orm";
import {
  SEO_BASE_URL,
  SEO_DISTRICTS,
  SEO_PROVINCES,
  toSlug,
} from "./seo-render";
import { listingMatchesSeoLocation, normalizeSeoLocation } from "./seo-location";
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

// Statik içeriğin gerçek son kaynak güncelleme tarihleri. HTTP istek zamanı kullanılmaz.
const PAGE_CONTENT_LASTMOD = "2026-07-15T19:37:04.000Z";
const CITY_CONTENT_LASTMOD = "2026-07-15T21:40:00.000Z";
const CATEGORY_CONTENT_LASTMOD = "2026-07-13T13:26:41.000Z";
const COMPANY_CONTENT_LASTMOD = "2026-07-13T13:26:41.000Z";
const BLOG_CONTENT_LASTMOD = "2026-07-13T13:26:41.000Z";
const SITEMAP_POLICY_LASTMOD = "2026-07-15T21:40:00.000Z";

export type SitemapEntry = {
  url: string;
  lastmod?: Date | string | null;
};

type SitemapListing = {
  id: number;
  slug?: string | null;
  title: string;
  company: string;
  city: string;
  description: string | null;
  workType: string;
  updatedAt: Date;
  publishedAt: Date | null;
};

type SitemapSnapshot = {
  listings: SitemapListing[];
  latestListingAt: Date | null;
  cityLastmods: Map<string, Date>;
  categoryLastmods: Map<string, Date>;
  companyLastmods: Map<string, Date>;
  jobPageLastmods: Array<Date | string>;
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

function validDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDate(...values: Array<Date | string | null | undefined>): Date {
  const dates = values.map(validDate).filter((value): value is Date => value !== null);
  return dates.reduce((latest, value) => value > latest ? value : latest, new Date(0));
}

function formatLastmod(value?: Date | string | null): string | undefined {
  const date = validDate(value);
  return date?.toISOString();
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

export function buildSitemapIndex(entries: SitemapEntry[]): string {
  const body = entries.map((entry) => {
    const lastmod = formatLastmod(entry.lastmod);
    return [
      "  <sitemap>",
      `    <loc>${escapeXml(entry.url)}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      "  </sitemap>",
    ].join("\n");
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>`;
}

function listingLastmod(listing: SitemapListing): Date {
  return latestDate(listing.updatedAt, listing.publishedAt);
}

function categoryMatches(listing: SitemapListing, slug: string): boolean {
  const text = normalizeSeoLocation(`${listing.title} ${listing.description ?? ""} ${listing.workType}`);
  const patterns: Record<string, RegExp> = {
    "silahli-guvenlik-is-ilanlari": /(^| )silahli( |$)/,
    "silahsiz-guvenlik-is-ilanlari": /(^| )silahsiz( |$)/,
    "avm-guvenlik-is-ilanlari": /(^| )(avm|alisveris merkezi)( |$)/,
    "fabrika-guvenlik-is-ilanlari": /(^| )(fabrika|uretim|sanayi)( |$)/,
    "site-guvenlik-is-ilanlari": /(^| )(site|konut|rezidans)( |$)/,
    "bay-guvenlik-is-ilanlari": /(^| )(bay|erkek)( |$)/,
    "bayan-guvenlik-is-ilanlari": /(^| )(bayan|kadin)( |$)/,
  };
  return patterns[slug]?.test(text) ?? false;
}

function companyMatches(company: string, slug: string): boolean {
  const normalized = normalizeSeoLocation(company);
  const aliases: Record<string, string[]> = {
    securitas: ["securitas"],
    "tepe-savunma": ["tepe savunma", "tepe guvenlik"],
    iss: ["iss"],
    g4s: ["g4s"],
    desmer: ["desmer"],
    pronet: ["pronet"],
    "koruma-grubu": ["koruma grubu"],
    prosegur: ["prosegur"],
  };
  return (aliases[slug] ?? [slug.replace(/-/g, " ")]).some((alias) =>
    (` ${normalized} `).includes(` ${normalizeSeoLocation(alias)} `),
  );
}

export function buildSitemapSnapshot(listings: SitemapListing[]): SitemapSnapshot {
  const latestListingAt = listings.length
    ? listings.map(listingLastmod).reduce((latest, value) => value > latest ? value : latest)
    : null;
  const cityLastmods = new Map<string, Date>();
  for (const location of [...SEO_PROVINCES, ...SEO_DISTRICTS]) {
    const updates = listings
      .filter((listing) => listingMatchesSeoLocation(listing.city, location))
      .map(listingLastmod);
    cityLastmods.set(location, latestDate(CITY_CONTENT_LASTMOD, ...updates));
  }

  const categoryLastmods = new Map<string, Date>();
  for (const slug of SEO_CATEGORY_SLUGS) {
    const updates = listings.filter((listing) => categoryMatches(listing, slug)).map(listingLastmod);
    categoryLastmods.set(slug, latestDate(CATEGORY_CONTENT_LASTMOD, ...updates));
  }

  const companyLastmods = new Map<string, Date>();
  for (const slug of SEO_COMPANY_SLUGS) {
    const updates = listings.filter((listing) => companyMatches(listing.company, slug)).map(listingLastmod);
    companyLastmods.set(slug, latestDate(COMPANY_CONTENT_LASTMOD, ...updates));
  }

  const pageCount = Math.max(1, Math.ceil(listings.length / JOB_SITEMAP_LIMIT));
  const jobPageLastmods = Array.from({ length: pageCount }, (_, index) => {
    const pageRows = listings.slice(index * JOB_SITEMAP_LIMIT, (index + 1) * JOB_SITEMAP_LIMIT);
    return pageRows.length
      ? latestDate(...pageRows.map(listingLastmod))
      : SITEMAP_POLICY_LASTMOD;
  });
  return { listings, latestListingAt, cityLastmods, categoryLastmods, companyLastmods, jobPageLastmods };
}

async function getSitemapSnapshot(): Promise<SitemapSnapshot> {
  const rows = await db
    .select({
      id: listingsTable.id,
      slug: listingsTable.slug,
      title: listingsTable.title,
      company: listingsTable.company,
      city: listingsTable.city,
      description: listingsTable.description,
      workType: listingsTable.workType,
      updatedAt: listingsTable.updatedAt,
      publishedAt: listingsTable.publishedAt,
    })
    .from(listingsTable)
    .where(indexableListingCondition())
    .orderBy(asc(listingsTable.id));
  return buildSitemapSnapshot(rows);
}

function sitemapIndexEntries(snapshot: SitemapSnapshot): SitemapEntry[] {
  const pagesLastmod = latestDate(PAGE_CONTENT_LASTMOD, snapshot.latestListingAt);
  const citiesLastmod = latestDate(...snapshot.cityLastmods.values());
  const categoriesLastmod = latestDate(...snapshot.categoryLastmods.values());
  const companiesLastmod = latestDate(...snapshot.companyLastmods.values());
  const entries: SitemapEntry[] = [
    { url: `${SEO_BASE_URL}/sitemap-pages.xml`, lastmod: pagesLastmod },
    { url: `${SEO_BASE_URL}/sitemap-cities.xml`, lastmod: citiesLastmod },
    { url: `${SEO_BASE_URL}/sitemap-districts.xml`, lastmod: citiesLastmod },
    { url: `${SEO_BASE_URL}/sitemap-categories.xml`, lastmod: categoriesLastmod },
    { url: `${SEO_BASE_URL}/sitemap-companies.xml`, lastmod: companiesLastmod },
    { url: `${SEO_BASE_URL}/sitemap-blog.xml`, lastmod: BLOG_CONTENT_LASTMOD },
    { url: `${SEO_BASE_URL}/sitemap-news.xml`, lastmod: SITEMAP_POLICY_LASTMOD },
  ];
  snapshot.jobPageLastmods.forEach((lastmod, index) => {
    entries.push({ url: `${SEO_BASE_URL}/sitemap-jobs-${index + 1}.xml`, lastmod });
  });
  return entries;
}

export function generateStaticSitemapIndexXml(): string {
  const empty = buildSitemapSnapshot([]);
  return buildSitemapIndex(sitemapIndexEntries(empty));
}

export async function getJobSitemapPageCount(): Promise<number> {
  return (await getSitemapSnapshot()).jobPageLastmods.length;
}

export async function generateSitemapIndexXml(): Promise<string> {
  return buildSitemapIndex(sitemapIndexEntries(await getSitemapSnapshot()));
}

export async function generatePagesSitemapXml(): Promise<string> {
  const snapshot = await getSitemapSnapshot();
  const dynamicLastmod = latestDate(PAGE_CONTENT_LASTMOD, snapshot.latestListingAt);
  return buildSitemapXml([
    { url: `${SEO_BASE_URL}/`, lastmod: dynamicLastmod },
    { url: `${SEO_BASE_URL}/ilanlar`, lastmod: dynamicLastmod },
    { url: `${SEO_BASE_URL}/haberler`, lastmod: dynamicLastmod },
    { url: `${SEO_BASE_URL}/blog`, lastmod: BLOG_CONTENT_LASTMOD },
  ]);
}

export async function generateCitiesSitemapXml(): Promise<string> {
  const snapshot = await getSitemapSnapshot();
  return buildSitemapXml(SEO_PROVINCES.map((name) => ({
    url: `${SEO_BASE_URL}/${toSlug(name)}`,
    lastmod: snapshot.cityLastmods.get(name) ?? CITY_CONTENT_LASTMOD,
  })));
}

export async function generateDistrictsSitemapXml(): Promise<string> {
  const snapshot = await getSitemapSnapshot();
  return buildSitemapXml(SEO_DISTRICTS.map((name) => ({
    url: `${SEO_BASE_URL}/${toSlug(name)}`,
    lastmod: snapshot.cityLastmods.get(name) ?? CITY_CONTENT_LASTMOD,
  })));
}

export async function generateCategoriesSitemapXml(): Promise<string> {
  const snapshot = await getSitemapSnapshot();
  return buildSitemapXml(SEO_CATEGORY_SLUGS.map((slug) => ({
    url: `${SEO_BASE_URL}/${slug}`,
    lastmod: snapshot.categoryLastmods.get(slug) ?? CATEGORY_CONTENT_LASTMOD,
  })));
}

export async function generateCompaniesSitemapXml(): Promise<string> {
  const snapshot = await getSitemapSnapshot();
  return buildSitemapXml(SEO_COMPANY_SLUGS.map((slug) => ({
    url: `${SEO_BASE_URL}/${slug}-is-ilanlari`,
    lastmod: snapshot.companyLastmods.get(slug) ?? COMPANY_CONTENT_LASTMOD,
  })));
}

export function generateBlogSitemapXml(): string {
  return buildSitemapXml([
    { url: `${SEO_BASE_URL}/blog`, lastmod: BLOG_CONTENT_LASTMOD },
    ...SEO_BLOG_POSTS.map((post) => ({
      url: `${SEO_BASE_URL}/blog/${post.slug}`,
      lastmod: post.publishedAt,
    })),
  ]);
}

export async function generateNewsSitemapXml(): Promise<string> {
  const now = new Date();
  const rows = await db.select({
    slug: newsArticlesTable.slug,
    publishedAt: newsArticlesTable.publishedAt,
    updatedAt: newsArticlesTable.updatedAt,
  })
    .from(newsArticlesTable)
    .where(and(
      eq(newsArticlesTable.status, "published"),
      or(
        sql`${newsArticlesTable.publishedAt} IS NULL`,
        lte(newsArticlesTable.publishedAt, now),
      )!,
    ))
    .orderBy(desc(newsArticlesTable.publishedAt), desc(newsArticlesTable.id))
    .limit(500);
  return buildSitemapXml([
    { url: `${SEO_BASE_URL}/haberler`, lastmod: rows[0]?.updatedAt ?? SITEMAP_POLICY_LASTMOD },
    ...rows.map((row) => ({
      url: `${SEO_BASE_URL}/haberler/${row.slug}`,
      lastmod: row.updatedAt ?? row.publishedAt,
    })),
  ]);
}

export async function generateJobsSitemapXml(page: number): Promise<string | null> {
  const snapshot = await getSitemapSnapshot();
  const pageCount = snapshot.jobPageLastmods.length;
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return null;
  const rows = snapshot.listings.slice((page - 1) * JOB_SITEMAP_LIMIT, page * JOB_SITEMAP_LIMIT);
  return buildSitemapXml(rows.map((row) => ({
    url: `${SEO_BASE_URL}/ilan/${row.id}/${(row.slug || `ilan-${row.id}`).trim()}`,
    lastmod: listingLastmod(row),
  })));
}
