/**
 * SEO SSR-lite: Googlebot ve diğer arama motorları için
 * city / listing / home sayfalarına ön-render edilmiş HTML, meta etiketleri
 * ve JSON-LD enjekte eder. React mount edildiğinde içerik değişmez (replace).
 */

import { db, listingsTable, listingSeoPath, listingSeoUrl, splitListingLocation } from "@workspace/db";
import { and, desc, eq, ilike } from "drizzle-orm";
import { indexableListingCondition } from "./seo-listing-policy";
import {
  ALL_LOCATIONS,
  SEO_DISTRICTS,
  listingMatchesSeoLocation,
  slugToCity,
  toSlug,
} from "./seo-location";
export { ALL_LOCATIONS, SEO_DISTRICTS, SEO_PROVINCES, slugToCity, toSlug } from "./seo-location";

export const SEO_BASE_URL = "https://ozelguvenlik.online";
export const SEO_DISPLAY_URL = "ozelguvenlik.online";

/** /ilan/:id veya /ilan/:id/:slug için doğru SEO path (slug yoksa null) */
export async function resolveListingSeoRedirect(
  id: number,
  urlSlug: string | null,
): Promise<{ redirectTo: string } | { ok: true; slug: string } | null> {
  try {
    const [listing] = await db
      .select({ id: listingsTable.id, slug: listingsTable.slug })
      .from(listingsTable)
      .where(eq(listingsTable.id, id))
      .limit(1);
    if (!listing) return null;
    const slug = (listing.slug || `ilan-${listing.id}`).trim();
    const correct = listingSeoPath(listing.id, slug);
    if (!urlSlug || urlSlug !== slug) {
      return { redirectTo: correct };
    }
    return { ok: true, slug };
  } catch {
    return null;
  }
}

function parseSalaryMinMax(salary: unknown): { min: number | null; max: number | null } {
  const raw = String(salary ?? "").trim();
  if (!raw) return { min: null, max: null };
  const normalized = raw
    .replace(/\./g, "")
    .replace(/,/g, "")
    .replace(/(\d)\s*bin\b/gi, (_, d) => `${d}000`)
    .replace(/\s+/g, " ");
  const rangeMatch = normalized.match(/(\d{4,6})\s*[-–—/]\s*(\d{4,6})/);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 1000 && b >= 1000) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }
  const single = normalized.match(/(\d{4,6})/);
  if (single) {
    const n = Number(single[1]);
    if (Number.isFinite(n) && n >= 1000) return { min: n, max: n };
  }
  return { min: null, max: null };
}

function buildBaseSalary(opts: {
  salary?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
}) {
  let min = typeof opts.salaryMin === "number" && opts.salaryMin >= 1000 ? opts.salaryMin : null;
  let max = typeof opts.salaryMax === "number" && opts.salaryMax >= 1000 ? opts.salaryMax : null;
  if (min == null && max == null) {
    const parsed = parseSalaryMinMax(opts.salary);
    min = parsed.min;
    max = parsed.max;
  }
  if (min == null && max == null) return undefined;
  if (min == null) {
    min = max;
  } else if (max == null) {
    max = min;
  }
  const value =
    min === max
      ? { "@type": "QuantitativeValue", value: min!, unitText: "MONTH" }
      : { "@type": "QuantitativeValue", minValue: min!, maxValue: max!, unitText: "MONTH" };
  return { "@type": "MonetaryAmount", currency: "TRY", value };
}

function mapEmploymentType(workType: unknown): string | undefined {
  const value = String(workType ?? "").trim().toLocaleLowerCase("tr-TR");
  if (!value) return undefined;
  if (/part|yarı\s*zaman|yarim\s*zaman|günlük|gunluk/.test(value)) return "PART_TIME";
  if (/proje|geçici|gecici|dönemsel|donemsel/.test(value)) return "TEMPORARY";
  if (/sözleşmeli|sozlesmeli|kontrat/.test(value)) return "CONTRACTOR";
  if (/staj|intern/.test(value)) return "INTERN";
  if (/tam\s*zaman|full[\s-]*time|sürekli|surekli/.test(value)) return "FULL_TIME";
  return undefined;
}

function toIsoDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SeoMeta {
  title: string;
  description: string;
  canonical: string | null;
  ogImage?: string;
  ogType?: string;
  robots?: string;
  jsonLd?: object[];
  bodyHtml: string;
}

export function buildNotFoundSeoMeta(): SeoMeta {
  return {
    title: "Sayfa Bulunamadı | Özel Güvenlik Online",
    description: "Aradığınız sayfa bulunamadı. Güncel özel güvenlik iş ilanlarına ana sayfadan ulaşabilirsiniz.",
    canonical: null,
    robots: "noindex, follow",
    ogImage: `${SEO_BASE_URL}/og-brand.jpg`,
    ogType: "website",
    bodyHtml: "<main><h1>Sayfa Bulunamadı</h1><p>Aradığınız sayfa mevcut değil veya kaldırılmış olabilir.</p></main>",
  };
}

/* ───────────── HOME ───────────── */
function buildHomeMeta(): SeoMeta {
  const cityLinks = ALL_LOCATIONS
    .map(c => `<a href="${SEO_BASE_URL}/${toSlug(c)}">${escapeHtml(c)} Özel Güvenlik İş İlanları</a>`)
    .join(" · ");

  return {
    title: "Özel Güvenlik İş İlanları | Özel Güvenlik Online",
    description:
      "Türkiye genelindeki güncel özel güvenlik iş ilanlarını inceleyin. Silahlı, silahsız, bay ve bayan güvenlik görevlisi ilanlarına ücretsiz ulaşın.",
    canonical: `${SEO_BASE_URL}/`,
    ogImage: `${SEO_BASE_URL}/og-brand.jpg`,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Özel Güvenlik İş İlanları",
        alternateName: ["ozelguvenlik.online", "ÖzelGüvenlik.Online", "özel güvenlik iş ilanları"],
        url: SEO_BASE_URL,
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SEO_BASE_URL}/ilanlar?search={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Özel Güvenlik Online",
        alternateName: ["ozelguvenlik.online", "ÖzelGüvenlik.Online"],
        url: SEO_BASE_URL,
        logo: `${SEO_BASE_URL}/favicon-192x192.png`,
        sameAs: [],
      },
    ],
    bodyHtml: `
<header><h1>Türkiye Geneli Güncel Özel Güvenlik İş İlanları</h1></header>
<main>
<p><strong>ozelguvenlik.online</strong>, Türkiye genelinde silahlı ve silahsız özel güvenlik görevlisi iş ilanlarının yayınlandığı ücretsiz bir platformdur. AVM, fabrika, site, plaza, hastane, otel, OSB, lojistik ve okul güvenliği gibi tüm pozisyonlarda bay bayan personel alımları burada listelenir. Yapay zeka destekli iş bulma asistanı, ücretsiz CV oluşturma aracı ve şehir bazlı detaylı arama özellikleri ile aradığınız özel güvenlik işine kolayca ulaşırsınız.</p>
<h2>Şehir Bazlı Özel Güvenlik İş İlanları</h2>
<nav>${cityLinks}</nav>
<h2>Hızlı Erişim</h2>
<ul>
  <li><a href="${SEO_BASE_URL}/ilanlar">Tüm Aktif İlanlar</a></li>
  <li><a href="${SEO_BASE_URL}/ilan-ekle">Ücretsiz İlan Ver</a></li>
  <li><a href="${SEO_BASE_URL}/cv-olustur">Ücretsiz CV Oluştur</a></li>
  <li><a href="${SEO_BASE_URL}/part-time">Part-Time Güvenlik İlanları</a></li>
  <li><a href="${SEO_BASE_URL}/sohbet">Yapay Zeka İş Asistanı</a></li>
</ul>
</main>`,
  };
}

function buildCityLongContentServer(city: string): string {
  return `
<h2>İlanları değerlendirirken</h2>
<p>Pozisyonun kimlik kartı, vardiya, ücret, yol ve yemek koşullarını ilan detayından kontrol edin. Başvuru yöntemi ve iletişim bilgileri yalnız ilanın kendi sayfasında yer alır.</p>
<p>${escapeHtml(city)} dışındaki fırsatlar için <a href="${SEO_BASE_URL}/ilanlar">tüm aktif ilanlara</a> dönebilirsiniz.</p>`;
}

/* ───────────── CITY ───────────── */
function makeCitySeo(city: string): { title: string; description: string } {
  const overrides: Record<string, { title: string; description: string }> = {
    "İstanbul": {
      title: "İstanbul Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı 2026",
      description: "İstanbul olarak doğrulanmış güncel özel güvenlik ilanlarını, çalışma koşullarını ve doğrudan başvuru bilgilerini inceleyin.",
    },
    "Ankara": {
      title: "Ankara Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı",
      description: "Ankara olarak doğrulanmış güncel güvenlik görevlisi ilanlarını ve başvuru koşullarını inceleyin.",
    },
    "İzmir": {
      title: "İzmir Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı",
      description: "İzmir olarak doğrulanmış güncel güvenlik görevlisi ilanlarını ve başvuru koşullarını inceleyin.",
    },
    "Kocaeli": {
      title: "Kocaeli Özel Güvenlik İş İlanları | Gebze, İzmit, GOSB, TOSB",
      description: "Kocaeli, Gebze, İzmit ve çevresinde konumu doğrulanmış güncel güvenlik ilanlarını inceleyin.",
    },
    "Gebze": {
      title: "Gebze Özel Güvenlik İş İlanları | GOSB, TOSB, Fabrika Güvenliği",
      description: "Gebze, GOSB ve TOSB konumlu güncel güvenlik görevlisi ilanlarını ve başvuru bilgilerini inceleyin.",
    },
  };
  return overrides[city] ?? {
    title: `${city} Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı`,
    description: `${city} olarak doğrulanmış güncel özel güvenlik ilanlarını, çalışma koşullarını ve başvuru bilgilerini inceleyin.`,
  };
}

function cityLocative(city: string): string {
  const normalized = city.toLocaleLowerCase("tr-TR");
  const vowels = [...normalized].filter((char) => "aeıioöuü".includes(char));
  const lastVowel = vowels.at(-1) ?? "a";
  const suffixVowel = "eiöü".includes(lastVowel) ? "e" : "a";
  const lastLetter = normalized.replace(/[^a-zçğıöşü]/g, "").at(-1) ?? "";
  const consonant = "fstkçşhp".includes(lastLetter) ? "t" : "d";
  return `${city}’${consonant}${suffixVowel}`;
}

/** DB boş veya geçici olarak erişilemez olsa da geçerli şehir sayfası indexlenebilir ve 200 kalır. */
export function buildEmptyCityMeta(city: string, slug: string): SeoMeta {
  const { title, description } = makeCitySeo(city);
  const pageUrl = `${SEO_BASE_URL}/${slug}`;
  const otherCityLinks = ALL_LOCATIONS
    .filter((location) => location !== city)
    .slice(0, 30)
    .map((location) => `<a href="${SEO_BASE_URL}/${toSlug(location)}">${escapeHtml(location)}</a>`)
    .join(" · ");

  return {
    title,
    description,
    canonical: pageUrl,
    ogImage: `${SEO_BASE_URL}/og-brand.jpg`,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: SEO_BASE_URL },
          { "@type": "ListItem", position: 2, name: "İlanlar", item: `${SEO_BASE_URL}/ilanlar` },
          { "@type": "ListItem", position: 3, name: city, item: pageUrl },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: title,
        description,
        url: pageUrl,
        inLanguage: "tr-TR",
      },
    ],
    bodyHtml: `
<header><h1>${escapeHtml(city)} Özel Güvenlik İş İlanları — Bay Bayan Personel Alımı</h1></header>
<main>
<p>${escapeHtml(description)}</p>
<p>${escapeHtml(cityLocative(city))} şu anda aktif özel güvenlik ilanı bulunmuyor.</p>
${buildCityLongContentServer(city)}
<h2>Diğer seçenekler</h2>
<p><a href="${SEO_BASE_URL}/ilanlar">Türkiye geneli ilanlar</a> · <a href="${SEO_BASE_URL}/bildirimler">Yeni ilan bildirimi</a></p>
<h2>Yakın Şehirler ve Diğer İller</h2>
<nav>${otherCityLinks}</nav>
</main>`,
  };
}

async function buildCityMeta(city: string, slug: string): Promise<SeoMeta> {
  const { title, description } = makeCitySeo(city);
  const pageUrl = `${SEO_BASE_URL}/${slug}`;

  let cityListings: { id: number; slug: string | null; title: string; company: string; city: string; updatedAt: Date; applyUrl: string | null }[] = [];
  try {
    const rows = await db
      .select({
        id: listingsTable.id,
        slug: listingsTable.slug,
        title: listingsTable.title,
        company: listingsTable.company,
        city: listingsTable.city,
        updatedAt: listingsTable.updatedAt,
        applyUrl: listingsTable.applyUrl,
      })
      .from(listingsTable)
      .where(indexableListingCondition())
      .orderBy(desc(listingsTable.updatedAt))
    cityListings = rows.filter((row) => listingMatchesSeoLocation(row.city, city)).slice(0, 20);
  } catch { /* ignore */ }

  if (cityListings.length === 0) {
    return buildEmptyCityMeta(city, slug);
  }

  const listingLinks = cityListings.length
    ? `<h2>${escapeHtml(city)} Aktif İlanlar</h2><ul>${cityListings
        .map(l => `<li><a href="${SEO_BASE_URL}/ilan/${l.id}/${escapeHtml((l.slug || `ilan-${l.id}`).trim())}">${escapeHtml(l.title)} - ${escapeHtml(l.company || "")}</a> <small>(${escapeHtml(l.city)})</small></li>`)
        .join("")}</ul>`
    : `<p>${escapeHtml(city)} için şu an yayında ilan yok; yeni ilanlar eklendiğinde burada listelenir.</p>`;

  const otherCityLinks = ALL_LOCATIONS
    .filter(c => c !== city)
    .slice(0, 30)
    .map(c => `<a href="${SEO_BASE_URL}/${toSlug(c)}">${escapeHtml(c)}</a>`)
    .join(" · ");
  const districtLinks = SEO_DISTRICTS
    .filter((district) => {
      if (city === "Kocaeli") return !district.startsWith("İstanbul");
      if (city === "İstanbul") return district.startsWith("İstanbul");
      return false;
    })
    .map((district) => `<a href="${SEO_BASE_URL}/${toSlug(district)}">${escapeHtml(district)}</a>`)
    .join(" · ");
  const latestUpdate = cityListings[0]?.updatedAt;
  const validLatestUpdate = latestUpdate instanceof Date && !Number.isNaN(latestUpdate.getTime())
    ? latestUpdate
    : null;
  const updateText = validLatestUpdate
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(validLatestUpdate)
    : null;

  return {
    title,
    description,
    canonical: pageUrl,
    ogImage: `${SEO_BASE_URL}/og-brand.jpg`,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: SEO_BASE_URL },
          { "@type": "ListItem", position: 2, name: "İlanlar", item: `${SEO_BASE_URL}/ilanlar` },
          { "@type": "ListItem", position: 3, name: city, item: pageUrl },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: title,
        description,
        url: pageUrl,
        inLanguage: "tr-TR",
      },
    ],
    bodyHtml: `
<header><h1>${escapeHtml(city)} Özel Güvenlik İş İlanları — Bay Bayan Personel Alımı</h1></header>
<main>
<p>${escapeHtml(description)}</p>
<p>Bu sayfada yalnız konum alanı ${escapeHtml(city)} veya bu konuma bağlı doğrulanabilir ilçe bilgisi taşıyan aktif ilanlar gösterilir.${updateText ? ` Son ilan güncellemesi: <time datetime="${validLatestUpdate!.toISOString()}">${escapeHtml(updateText)}</time>.` : ""}</p>
${districtLinks ? `<h2>İlçe ve bölge bağlantıları</h2><nav>${districtLinks}</nav>` : ""}
${listingLinks}
${buildCityLongContentServer(city)}
<h2>Diğer İllerdeki İlanlar</h2>
<nav>${otherCityLinks}</nav>
<p><a href="${SEO_BASE_URL}/ilanlar">Tüm Aktif İlanları Görüntüle</a> · <a href="${SEO_BASE_URL}/ilan-ekle">Ücretsiz İlan Ver</a> · <a href="${SEO_BASE_URL}/cv-olustur">Ücretsiz CV Oluştur</a></p>
</main>`,
  };
}

/* ───────────── LISTING DETAIL ───────────── */
async function buildListingMeta(id: number): Promise<SeoMeta | null> {
  try {
    const rows = await db
      .select()
      .from(listingsTable)
      .where(and(eq(listingsTable.id, id), indexableListingCondition()))
      .limit(1);
    const listing = rows[0];
    if (!listing) return null;

    const slug = (listing.slug || `ilan-${listing.id}`).trim();
    const pageUrl = listingSeoUrl(SEO_BASE_URL, listing.id, slug);
    const listingTitle = (listing.title || "").trim() || "Güvenlik Personeli";
    const company = (listing.company || "").trim();
    const { city, district } = splitListingLocation(listing.city || "");
    const locCity = city || (listing.city || "").trim() || "Türkiye";
    const locDistrict = district || "";
    const salaryText = (listing.salary || "").trim();

    // Meta title: {Başlık} İş İlanı | {İlçe} {Şehir} | {Maaş}
    const locForTitle = [locDistrict, locCity].filter(Boolean).join(" ");
    const titleParts = [
      `${listingTitle} İş İlanı`,
      locForTitle || null,
      salaryText || null,
    ].filter(Boolean);
    const title = titleParts.join(" | ");

    // Meta description
    const locPhrase = locDistrict ? `${locDistrict} / ${locCity}` : locCity;
    const salaryPart = salaryText ? ` Maaş ${salaryText}.` : "";
    const desc = truncateSeoDesc(
      `${locPhrase}'de ${listingTitle} iş ilanı.${salaryPart} Servis ve yemek imkanı. Hemen başvurun.`,
    );

    const h1 = locDistrict
      ? `${listingTitle} İş İlanı - ${locDistrict} / ${locCity}`
      : `${listingTitle} İş İlanı - ${locCity}`;

    const validThrough = toIsoDate(listing.expiresAt);
    const datePosted = toIsoDate(listing.publishedAt) ?? toIsoDate(listing.sourcePublishedAt) ?? toIsoDate(listing.createdAt);
    const employmentType = mapEmploymentType(listing.workType);
    const baseSalary = buildBaseSalary({ salary: listing.salary, salaryMin: listing.salaryMin, salaryMax: listing.salaryMax });
    const companyLogo = listing.companyLogoUrl
      ? (listing.companyLogoUrl.startsWith("http") ? listing.companyLogoUrl : `${SEO_BASE_URL}${listing.companyLogoUrl.startsWith("/") ? "" : "/"}${listing.companyLogoUrl}`)
      : undefined;

    const citySlug = toSlug(locCity);
    const districtSlug = locDistrict ? toSlug(locDistrict) : null;
    const breadcrumbItems = [
      { "@type": "ListItem", position: 1, name: "Anasayfa", item: SEO_BASE_URL },
      { "@type": "ListItem", position: 2, name: "İş İlanları", item: `${SEO_BASE_URL}/ilanlar` },
      { "@type": "ListItem", position: 3, name: locCity, item: `${SEO_BASE_URL}/${citySlug}` },
      ...(locDistrict && districtSlug
        ? [{ "@type": "ListItem", position: 4, name: locDistrict, item: `${SEO_BASE_URL}/${districtSlug}` }]
        : []),
      {
        "@type": "ListItem",
        position: locDistrict ? 5 : 4,
        name: listingTitle,
        item: pageUrl,
      },
    ];

    return {
      title,
      description: desc,
      canonical: pageUrl,
      robots: "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
      ogImage: companyLogo || `${SEO_BASE_URL}/og-brand.jpg`,
      ogType: "article",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: listingTitle,
          description: (listing.description || desc).trim(),
          identifier: { "@type": "PropertyValue", name: "Özel Güvenlik Online", value: String(listing.id) },
          ...(datePosted ? { datePosted } : {}),
          ...(validThrough ? { validThrough } : {}),
          ...(employmentType ? { employmentType } : {}),
          hiringOrganization: {
            "@type": "Organization",
            name: company || "Özel Güvenlik Online",
            sameAs: SEO_BASE_URL,
            ...(companyLogo ? { logo: companyLogo } : {}),
          },
          jobLocation: {
            "@type": "Place",
            address: {
              "@type": "PostalAddress",
              addressLocality: locDistrict || locCity,
              addressRegion: locCity,
              addressCountry: "TR",
            },
          },
          ...(baseSalary ? { baseSalary } : {}),
          url: pageUrl,
          ...(companyLogo ? { image: companyLogo } : {}),
          directApply: true,
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbItems,
        },
      ],
      bodyHtml: `
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="${SEO_BASE_URL}">Anasayfa</a></li>
    <li><a href="${SEO_BASE_URL}/ilanlar">İş İlanları</a></li>
    <li><a href="${SEO_BASE_URL}/${citySlug}">${escapeHtml(locCity)}</a></li>
    ${locDistrict && districtSlug ? `<li><a href="${SEO_BASE_URL}/${districtSlug}">${escapeHtml(locDistrict)}</a></li>` : ""}
    <li>${escapeHtml(listingTitle)}</li>
  </ol>
</nav>
<header><h1>${escapeHtml(h1)}</h1></header>
<main>
<p><strong>Firma:</strong> ${escapeHtml(company || "")}<br/>
<strong>Konum:</strong> ${escapeHtml(locPhrase)}<br/>
<strong>Pozisyon:</strong> Özel Güvenlik Görevlisi<br/>
${listing.workType ? `<strong>Çalışma Tipi:</strong> ${escapeHtml(listing.workType)}<br/>` : ""}
${salaryText ? `<strong>Maaş:</strong> ${escapeHtml(salaryText)}` : ""}</p>
<h2>İlan Açıklaması</h2>
<p>${escapeHtml(listing.description || desc)}</p>
${listing.requirements ? `<h2>Aranan Şartlar</h2><p>${escapeHtml(listing.requirements)}</p>` : ""}
<h3>Başvuru</h3>
<p><a href="${pageUrl}">Bu ilana başvurun</a> · <a href="${SEO_BASE_URL}/ilanlar">Tüm İlanlar</a></p>
</main>`,
    };
  } catch {
    return null;
  }
}

function truncateSeoDesc(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

/* ───────────── ROUTING ───────────── */
export async function getSeoMetaForPath(pathname: string): Promise<SeoMeta | null> {
  const hasQuery = pathname.includes("?");
  const clean = pathname.split("?")[0]!.replace(/\/+$/, "") || "/";

  if (clean === "/" || clean === "") return buildHomeMeta();

  if (clean === "/ilanlar") {
    return {
      title: "Güncel Özel Güvenlik İş İlanları | Bay Bayan Personel Alımları",
      description: "Aktif özel güvenlik iş ilanlarını şehir, maaş ve pozisyona göre filtreleyin. Silahlı, silahsız, AVM, fabrika ve site güvenliği bay bayan personel alımları.",
      canonical: `${SEO_BASE_URL}/ilanlar`,
      ogImage: `${SEO_BASE_URL}/og-brand.jpg`,
      ogType: "website",
      robots: hasQuery ? "noindex, follow" : undefined,
      jsonLd: [
        {
          "@context": "https://schema.org", "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: SEO_BASE_URL },
            { "@type": "ListItem", position: 2, name: "İlanlar", item: `${SEO_BASE_URL}/ilanlar` },
          ],
        },
        { "@context": "https://schema.org", "@type": "CollectionPage", name: "Özel Güvenlik İş İlanları", url: `${SEO_BASE_URL}/ilanlar` },
      ],
      bodyHtml: `<header><h1>Güncel Özel Güvenlik İş İlanları</h1></header><main><p>Türkiye genelinde aktif özel güvenlik iş ilanları.</p></main>`,
    };
  }

  if (clean === "/blog") {
    return {
      title: "Özel Güvenlik Blog | İş Arama Rehberi",
      description: "Özel güvenlik sektörü blog yazıları, maaş rehberleri ve iş arama ipuçları.",
      canonical: `${SEO_BASE_URL}/blog`,
      ogImage: `${SEO_BASE_URL}/og-brand.jpg`,
      ogType: "website",
      jsonLd: [{
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: SEO_BASE_URL },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SEO_BASE_URL}/blog` },
        ],
      }],
      bodyHtml: `<header><h1>Özel Güvenlik Blog</h1></header>`,
    };
  }

  const blogMatch = clean.match(/^\/blog\/([a-z0-9-]+)$/i);
  if (blogMatch) {
    const slug = blogMatch[1]!;
    const titles: Record<string, string> = {
      "ozel-guvenlik-is-ilanlari-nasil-bulunur": "Özel Güvenlik İş İlanları Nasıl Bulunur? 2026 Rehberi",
      "silahli-silahsiz-guvenlik-maaslari": "Silahlı ve Silahsız Güvenlik Maaşları 2026",
      "ozel-guvenlik-kimlik-karti-nasil-alinir": "Özel Güvenlik Kimlik Kartı Nasıl Alınır?",
      "istanbul-ozel-guvenlik-is-ilanlari-rehberi": "İstanbul Özel Güvenlik İş İlanları Rehberi",
      "kocaeli-gebze-guvenlik-is-ilanlari": "Kocaeli ve Gebze Güvenlik İş İlanları",
    };
    const title = titles[slug];
    if (!title) return null;
    const descriptions: Record<string, string> = {
      "ozel-guvenlik-is-ilanlari-nasil-bulunur": "Özel güvenlik iş ilanlarına nasıl ulaşılır, hangi platformlar güvenilirdir ve başvuru sürecinde nelere dikkat edilmelidir? Kapsamlı rehber.",
      "silahli-silahsiz-guvenlik-maaslari": "2026 yılında silahlı ve silahsız özel güvenlik görevlisi maaşları, yan haklar ve bölgesel farklılıklar hakkında güncel bilgiler.",
      "ozel-guvenlik-kimlik-karti-nasil-alinir": "ÖGG ve silahlı özel güvenlik kimlik kartı alma şartları, eğitim süreci ve başvuru adımları.",
      "istanbul-ozel-guvenlik-is-ilanlari-rehberi": "İstanbul Anadolu ve Avrupa Yakası özel güvenlik iş ilanları, bölgesel farklar ve başvuru ipuçları.",
      "kocaeli-gebze-guvenlik-is-ilanlari": "Kocaeli, Gebze, GOSB ve TOSB bölgesi özel güvenlik iş ilanları ve fabrika güvenliği fırsatları.",
    };
    const pageUrl = `${SEO_BASE_URL}/blog/${slug}`;
    return {
      title: `${title} | Özel Güvenlik Blog`,
      description: descriptions[slug]!,
      canonical: pageUrl,
      ogImage: `${SEO_BASE_URL}/og-brand.jpg`,
      ogType: "article",
      jsonLd: [{
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: SEO_BASE_URL },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SEO_BASE_URL}/blog` },
          { "@type": "ListItem", position: 3, name: title, item: pageUrl },
        ],
      }],
      bodyHtml: `<article><h1>${escapeHtml(title)}</h1></article>`,
    };
  }

  const slugIlanMatch = clean.match(/^\/([a-z0-9-]+)-is-ilanlari$/i);
  if (slugIlanMatch) {
    const slug = slugIlanMatch[1]!;
    const companies: Record<string, string> = {
      securitas: "Securitas", "tepe-savunma": "Tepe Savunma", iss: "ISS", g4s: "G4S",
      desmer: "Desmer", pronet: "Pronet", "koruma-grubu": "Koruma Grubu", prosegur: "Prosegur",
    };
    const keywords: Record<string, string> = {
      "silahli-guvenlik": "Silahlı Güvenlik İş İlanları",
      "silahsiz-guvenlik": "Silahsız Güvenlik İş İlanları",
      "avm-guvenlik": "AVM Güvenlik İş İlanları",
      "fabrika-guvenlik": "Fabrika Güvenlik İş İlanları",
      "site-guvenlik": "Site Güvenlik İş İlanları",
      "bay-guvenlik": "Bay Güvenlik İş İlanları",
      "bayan-guvenlik": "Bayan Güvenlik İş İlanları",
    };
    const company = companies[slug];
    const kwKey = slug.replace(/-is-ilanlari$/, "");
    const keyword = keywords[kwKey];
    const label = company ?? keyword;
    if (label) {
      const pageUrl = `${SEO_BASE_URL}/${slug}-is-ilanlari`;
      return {
        title: company ? `${company} İş İlanları | Özel Güvenlik İş İlanları` : `${label} | Güncel Personel Alımları`,
        description: `${label} ve güncel özel güvenlik personel alımları. Bay bayan güvenlik görevlisi pozisyonlarına hemen başvurun.`,
        canonical: pageUrl,
        ogImage: `${SEO_BASE_URL}/og-brand.jpg`,
        ogType: "website",
        jsonLd: [{
          "@context": "https://schema.org", "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: SEO_BASE_URL },
            { "@type": "ListItem", position: 2, name: "İlanlar", item: `${SEO_BASE_URL}/ilanlar` },
            { "@type": "ListItem", position: 3, name: label, item: pageUrl },
          ],
        }],
        bodyHtml: `<header><h1>${escapeHtml(label)}</h1></header>`,
      };
    }
  }

  const cityMatch = clean.match(/^\/([a-z0-9-]+)-ozel-guvenlik-is-ilanlari$/i);
  if (cityMatch) {
    const slug = cityMatch[1]!;
    const city = slugToCity(slug);
    if (city) return buildCityMeta(city, slug);
  }

  // Kısa il URL: /ankara /istanbul /gebze
  const shortCityMatch = clean.match(/^\/([a-z0-9-]+)$/i);
  if (shortCityMatch) {
    const slug = shortCityMatch[1]!;
    const city = slugToCity(slug);
    if (city) return buildCityMeta(city, slug);
  }

  const listingMatch = clean.match(/^\/ilan\/(\d+)(?:\/([^/]+))?$/);
  if (listingMatch) {
    const id = parseInt(listingMatch[1]!, 10);
    if (Number.isFinite(id)) return buildListingMeta(id);
  }

  const noIndexExact = new Set([
    "/sohbet", "/destek", "/giris", "/kayit", "/ilan-ekle", "/firma-basvurusu",
    "/bildirimler", "/favoriler", "/cv-olustur", "/part-time", "/yakindaki-ilanlar",
    "/admin", "/moderator",
  ]);
  if (noIndexExact.has(clean) || /^\/profil\/[^/]+$/i.test(clean) || /^\/moderator\/[^/]+$/i.test(clean)) {
    return {
      title: "Özel Güvenlik Online",
      description: "Özel Güvenlik Online kullanıcı sayfası.",
      canonical: `${SEO_BASE_URL}${clean}`,
      robots: "noindex, follow",
      ogImage: `${SEO_BASE_URL}/og-brand.jpg`,
      ogType: "website",
      bodyHtml: "",
    };
  }

  return null;
}

/* ───────────── HTML INJECTION ───────────── */
export function injectSeoIntoHtml(html: string, meta: SeoMeta): string {
  let out = html;

  // <title>
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);

  // description
  out = out.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
  );

  out = out.replace(
    /<meta name="robots" content="[^"]*"\s*\/?>/,
    `<meta name="robots" content="${escapeHtml(meta.robots ?? "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1")}" />`,
  );

  // canonical
  if (meta.canonical) {
    out = out.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`);
    out = out.replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`);
  } else {
    out = out.replace(/\s*<link rel="canonical" href="[^"]*"\s*\/?>/, "");
    out = out.replace(/\s*<meta property="og:url" content="[^"]*"\s*\/?>/, "");
  }

  // og:title
  out = out.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
  );

  // og:description
  out = out.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
  );

  // og:image
  if (meta.ogImage) {
    out = out.replace(
      /<meta property="og:image" content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${escapeHtml(meta.ogImage)}" />`,
    );
  }

  // og:type
  if (meta.ogType) {
    out = out.replace(
      /<meta property="og:type" content="[^"]*"\s*\/?>/,
      `<meta property="og:type" content="${escapeHtml(meta.ogType)}" />`,
    );
  }

  // twitter:title / description / image / card
  if (!/<meta name="twitter:card"/.test(out)) {
    out = out.replace("</head>", `<meta name="twitter:card" content="summary_large_image" />\n</head>`);
  }
  out = out.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  );
  if (meta.ogImage) {
    out = out.replace(
      /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:image" content="${escapeHtml(meta.ogImage)}" />`,
    );
  }

  // hreflang (çok dil hazırlığı — şimdilik tr-TR)
  if (meta.canonical) {
    if (/hreflang="tr-TR"/.test(out)) {
      out = out.replace(
        /<link rel="alternate" hreflang="tr-TR" href="[^"]*"\s*\/?>/,
        `<link rel="alternate" hreflang="tr-TR" href="${escapeHtml(meta.canonical)}" />`,
      );
    } else {
      out = out.replace(
        "</head>",
        `<link rel="alternate" hreflang="tr-TR" href="${escapeHtml(meta.canonical)}" />\n<link rel="alternate" hreflang="x-default" href="${escapeHtml(meta.canonical)}" />\n</head>`,
      );
    }
  }

  // JSON-LD: append before </head>
  if (meta.jsonLd && meta.jsonLd.length) {
    const ldScripts = meta.jsonLd
      .map(o => `<script type="application/ld+json" data-seo="1">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`)
      .join("\n");
    out = out.replace("</head>", `${ldScripts}\n</head>`);
  }

  // Mevcut açılış ekranını değiştirmeden kaynak HTML'e semantik SEO içeriği ekle.
  out = out.replace(
    '<div id="root">',
    `<div id="root"><div data-seo-content="1" class="sr-only">${meta.bodyHtml}</div>`,
  );

  return out;
}
