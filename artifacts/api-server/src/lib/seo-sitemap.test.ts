import assert from "node:assert/strict";
import test from "node:test";

process.env["DATABASE_URL"] = "postgresql://test:test@127.0.0.1:1/test";
const {
  buildSitemapIndex,
  buildSitemapSnapshot,
  buildSitemapXml,
  generateBlogSitemapXml,
  generateStaticSitemapIndexXml,
} = await import("./seo-sitemap");
const { listingMatchesSeoLocation } = await import("./seo-location");
const { buildEmptyCityMeta, getSeoMetaForPath } = await import("./seo-render");

const baseListing = {
  title: "Güvenlik Görevlisi",
  company: "Örnek Güvenlik",
  description: null,
  workType: "Tam Zamanlı",
  publishedAt: new Date("2026-07-10T10:00:00.000Z"),
};

test("şehir eşleşmesi yalnız yapılandırılmış konum ve bağlı ilçeyi kabul eder", () => {
  assert.equal(listingMatchesSeoLocation("İstanbul / Pendik", "İstanbul"), true);
  assert.equal(listingMatchesSeoLocation("Pendik", "İstanbul"), true);
  assert.equal(listingMatchesSeoLocation("Kocaeli / Gebze", "İstanbul"), false);
  assert.equal(listingMatchesSeoLocation("Türkiye", "İstanbul"), false);
  assert.equal(listingMatchesSeoLocation("Türkiye Geneli / İstanbul dahil", "İstanbul"), false);
  assert.equal(listingMatchesSeoLocation("İstanbul / Tuzla Kimya OSB", "Kocaeli"), false);
});

test("ilansız geçerli şehir 200 için indexlenebilir SEO yedeği üretir", () => {
  for (const [city, slug, message] of [
    ["Adana", "adana", "Adana’da şu anda aktif özel güvenlik ilanı bulunmuyor."],
    ["Bayburt", "bayburt", "Bayburt’ta şu anda aktif özel güvenlik ilanı bulunmuyor."],
    ["Tunceli", "tunceli", "Tunceli’de şu anda aktif özel güvenlik ilanı bulunmuyor."],
  ] as const) {
    const meta = buildEmptyCityMeta(city, slug);
    assert.equal(meta.canonical, `https://ozelguvenlik.online/${slug}`);
    assert.match(meta.bodyHtml, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(JSON.stringify(meta.jsonLd), /JobPosting/);
    assert.notEqual(meta.robots, "noindex, follow");
  }
});

test("geçersiz şehir slug SEO route tarafından kabul edilmez", async () => {
  assert.equal(await getSeoMetaForPath("/gecersiz-sehir-slug"), null);
});

test("şehir lastmod gerçek en yeni eşleşen ilan güncellemesinden hesaplanır", () => {
  const latest = new Date("2026-07-15T22:10:00.000Z");
  const snapshot = buildSitemapSnapshot([
    { ...baseListing, id: 2, city: "İstanbul / Pendik", updatedAt: latest },
    { ...baseListing, id: 1, city: "Türkiye", updatedAt: new Date("2026-07-15T23:00:00.000Z") },
  ]);
  assert.equal(snapshot.cityLastmods.get("İstanbul")?.toISOString(), latest.toISOString());
});

test("eski ID veya eski yayın tarihi tek başına sitemap kaydını düşürmez", () => {
  const snapshot = buildSitemapSnapshot([
    {
      ...baseListing,
      id: 1,
      city: "Ankara",
      publishedAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-15T22:00:00.000Z"),
    },
  ]);
  assert.deepEqual(snapshot.listings.map((listing) => listing.id), [1]);
  assert.equal(snapshot.jobPageLastmods.length, 1);
});

test("sitemap index kayıtlarının tamamında sabit lastmod bulunur", () => {
  const xml = buildSitemapIndex([
    { url: "https://ozelguvenlik.online/sitemap-pages.xml", lastmod: "2026-07-15T20:00:00.000Z" },
    { url: "https://ozelguvenlik.online/sitemap-jobs-1.xml", lastmod: "2026-07-15T21:00:00.000Z" },
  ]);
  assert.equal((xml.match(/<sitemap>/g) ?? []).length, 2);
  assert.equal((xml.match(/<lastmod>/g) ?? []).length, 2);
  assert.equal(xml.includes(new Date().toISOString()), false);
});

test("statik fallback index ve blog sitemap bütün kayıtlarda lastmod üretir", () => {
  const indexXml = generateStaticSitemapIndexXml();
  const blogXml = generateBlogSitemapXml();
  assert.equal((indexXml.match(/<sitemap>/g) ?? []).length, (indexXml.match(/<lastmod>/g) ?? []).length);
  assert.equal((blogXml.match(/<url>/g) ?? []).length, (blogXml.match(/<lastmod>/g) ?? []).length);
});

test("XML özel karakterleri güvenli biçimde escape edilir", () => {
  const xml = buildSitemapXml([
    { url: "https://ozelguvenlik.online/ilanlar?q=a&b=<x>", lastmod: "2026-07-15" },
  ]);
  assert.match(xml, /q=a&amp;b=&lt;x&gt;/);
  assert.equal((xml.match(/<url>/g) ?? []).length, (xml.match(/<\/url>/g) ?? []).length);
});
