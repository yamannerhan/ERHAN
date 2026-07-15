import { spawnSync } from "node:child_process";
import { listingMatchesSeoLocation } from "../artifacts/api-server/src/lib/seo-location";

const baseUrl = (process.env["SEO_CHECK_BASE_URL"] ?? "https://ozelguvenlik.online").replace(/\/+$/, "");
const timeoutMs = 20_000;

async function fetchChecked(pathOrUrl: string): Promise<Response> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  return response;
}

function xmlLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1]!.replace(/&amp;/g, "&"),
  );
}

function xmlLastmodCount(xml: string): number {
  return (xml.match(/<lastmod>[^<]+<\/lastmod>/g) ?? []).length;
}

function validateXml(xml: string): boolean {
  const python = spawnSync(
    "python",
    ["-c", "import sys,xml.etree.ElementTree as ET; ET.fromstring(sys.stdin.read())"],
    { input: xml, encoding: "utf8" },
  );
  if (!python.error) return python.status === 0;
  const openUrls = (xml.match(/<url>/g) ?? []).length;
  const closeUrls = (xml.match(/<\/url>/g) ?? []).length;
  const openMaps = (xml.match(/<sitemap>/g) ?? []).length;
  const closeMaps = (xml.match(/<\/sitemap>/g) ?? []).length;
  return xml.startsWith("<?xml") && openUrls === closeUrls && openMaps === closeMaps;
}

const report: Record<string, unknown> = { baseUrl };
const failures: string[] = [];

const robots = await fetchChecked("/robots.txt");
const robotsBody = await robots.text();
report.robots = {
  status: robots.status,
  sitemapDeclared: robotsBody.includes(`${baseUrl}/sitemap.xml`),
};
if (robots.status !== 200 || !robotsBody.includes(`${baseUrl}/sitemap.xml`)) failures.push("robots.txt");

const indexResponse = await fetchChecked("/sitemap.xml");
const indexXml = await indexResponse.text();
const childSitemaps = xmlLocations(indexXml);
report.sitemapIndex = {
  status: indexResponse.status,
  validXml: validateXml(indexXml),
  children: childSitemaps.length,
  allChildrenHaveLastmod: xmlLastmodCount(indexXml) === childSitemaps.length,
};
if (indexResponse.status !== 200 || !validateXml(indexXml)) failures.push("sitemap.xml");
if (xmlLastmodCount(indexXml) !== childSitemaps.length) failures.push("sitemap-index-lastmod");

const childResults: Array<Record<string, unknown>> = [];
const jobUrls: string[] = [];
for (const sitemapUrl of childSitemaps) {
  const response = await fetchChecked(sitemapUrl);
  const xml = await response.text();
  const urls = xmlLocations(xml);
  if (sitemapUrl.includes("sitemap-jobs-")) jobUrls.push(...urls);
  const result = {
    url: sitemapUrl,
    status: response.status,
    validXml: validateXml(xml),
    urls: urls.length,
    allUrlsHaveLastmod: xmlLastmodCount(xml) === urls.length,
  };
  childResults.push(result);
  if (response.status !== 200 || !result.validXml || !result.allUrlsHaveLastmod) failures.push(sitemapUrl);
}
report.childSitemaps = childResults;

const sample = [...jobUrls].sort(() => Math.random() - 0.5).slice(0, Math.min(20, jobUrls.length));
const listingChecks = await Promise.all(sample.map(async (url) => {
  const id = Number(url.match(/\/ilan\/(\d+)$/)?.[1]);
  const [page, api] = await Promise.all([
    fetchChecked(url),
    fetchChecked(`/api/listings/${id}`),
  ]);
  const html = await page.text();
  const data = api.ok ? await api.json() as Record<string, unknown> : {};
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical/i)?.[1];
  const expiresAt = data["expiresAt"] ? new Date(String(data["expiresAt"])) : null;
  const active = api.ok
    && data["status"] === "active"
    && data["isActive"] !== false
    && data["sourceTag"] !== "demo"
    && !data["mergedIntoListingId"]
    && (!expiresAt || expiresAt > new Date());
  return {
    id,
    pageStatus: page.status,
    apiStatus: api.status,
    active,
    canonicalSelf: canonical === url,
    noindex: /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html),
  };
}));
report.randomListingChecks = listingChecks;
if (listingChecks.some((item) => item.pageStatus !== 200 || !item.active || !item.canonicalSelf || item.noindex)) {
  failures.push("random-listing-checks");
}

const istanbulResponse = await fetchChecked("/api/listings?city=%C4%B0stanbul&page=1&limit=50");
const istanbulData = istanbulResponse.ok
  ? await istanbulResponse.json() as { listings?: Array<{ id: number; city: string }> }
  : {};
const istanbulListings = istanbulData.listings ?? [];
const invalidIstanbul = istanbulListings.filter((listing) =>
  !listingMatchesSeoLocation(listing.city, "İstanbul"),
);
report.istanbulLocationCheck = {
  status: istanbulResponse.status,
  checked: istanbulListings.length,
  invalid: invalidIstanbul,
};
if (!istanbulResponse.ok || invalidIstanbul.length > 0) failures.push("istanbul-location-check");

report.failures = failures;
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
