/**
 * SEO SSR-lite: Googlebot ve diğer arama motorları için
 * city / listing / home sayfalarına ön-render edilmiş HTML, meta etiketleri
 * ve JSON-LD enjekte eder. React mount edildiğinde içerik değişmez (replace).
 */

import { db, listingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export const SEO_BASE_URL = "https://ozelguvenlik.online";
export const SEO_DISPLAY_URL = "ozelguvenlik.online";

const PROVINCES = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın",
  "Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum",
  "Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun",
  "Gümüşhane","Hakkari","Hatay","Isparta","Mersin","İstanbul","İzmir","Kars","Kastamonu","Kayseri",
  "Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin",
  "Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas",
  "Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray",
  "Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova",
  "Karabük","Kilis","Osmaniye","Düzce",
];

const DISTRICTS = [
  "Gebze","Darıca","Çayırova","Dilovası","İzmit","GOSB","TOSB",
  "İstanbul Anadolu Yakası","İstanbul Avrupa Yakası",
];

const ALL_LOCATIONS = [...PROVINCES, ...DISTRICTS];

export function toSlug(txt: string): string {
  return txt
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const slugMap = new Map<string, string>();
for (const c of ALL_LOCATIONS) slugMap.set(toSlug(c), c);

export function slugToCity(slug: string): string | null {
  return slugMap.get(slug) ?? null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface SeoMeta {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: object[];
  bodyHtml: string;
}

/* ───────────── HOME ───────────── */
function buildHomeMeta(): SeoMeta {
  const cityLinks = ALL_LOCATIONS
    .map(c => `<a href="${SEO_BASE_URL}/${toSlug(c)}-ozel-guvenlik-is-ilanlari">${escapeHtml(c)} Özel Güvenlik İş İlanları</a>`)
    .join(" · ");

  return {
    title: "Özel Güvenlik İş İlanları | Bay Bayan Güvenlik Personeli Alımı",
    description:
      "Türkiye genelinde özel güvenlik iş ilanları, bay bayan güvenlik görevlisi alımları, ücretsiz CV oluşturma, yapay zeka destekli iş bulma ve ücretsiz ilan verme platformu.",
    canonical: `${SEO_BASE_URL}/`,
    ogImage: `${SEO_BASE_URL}/og-image.jpg`,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Özel Güvenlik İş İlanları",
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
        url: SEO_BASE_URL,
        logo: `${SEO_BASE_URL}/favicon-192x192.png`,
        sameAs: [],
      },
    ],
    bodyHtml: `
<header><h1>Özel Güvenlik İş İlanları — Türkiye Geneli Bay Bayan Personel Alımı</h1></header>
<main>
<p>Özel Güvenlik Online, Türkiye genelinde silahlı ve silahsız özel güvenlik görevlisi iş ilanlarının yayınlandığı ücretsiz bir platformdur. AVM, fabrika, site, plaza, hastane, otel, OSB, lojistik ve okul güvenliği gibi tüm pozisyonlarda bay bayan personel alımları burada listelenir. Yapay zeka destekli iş bulma asistanı, ücretsiz CV oluşturma aracı ve şehir bazlı detaylı arama özellikleri ile aradığınız özel güvenlik işine kolayca ulaşırsınız.</p>
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

/* ───────────── CITY ───────────── */
function makeCitySeo(city: string): { title: string; description: string } {
  const overrides: Record<string, { title: string; description: string }> = {
    "İstanbul": {
      title: "İstanbul Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı 2026",
      description: "İstanbul Anadolu ve Avrupa Yakası'nda silahlı, silahsız, AVM, fabrika, site, plaza, hastane ve otel güvenliği bay bayan özel güvenlik görevlisi iş ilanları.",
    },
    "Ankara": {
      title: "Ankara Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı",
      description: "Ankara'da kamu kurumları, AVM, fabrika, site ve plaza güvenliği için bay bayan silahlı & silahsız özel güvenlik görevlisi alımları.",
    },
    "İzmir": {
      title: "İzmir Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı",
      description: "İzmir'de AVM, fabrika, liman, site ve turizm tesisleri için bay bayan silahlı & silahsız özel güvenlik görevlisi iş ilanları.",
    },
    "Kocaeli": {
      title: "Kocaeli Özel Güvenlik İş İlanları | Gebze, İzmit, GOSB, TOSB",
      description: "Kocaeli Gebze, İzmit, Darıca, Çayırova, Dilovası, GOSB ve TOSB'de fabrika, OSB ve lojistik güvenliği için bay bayan özel güvenlik görevlisi alımları.",
    },
    "Gebze": {
      title: "Gebze Özel Güvenlik İş İlanları | GOSB, TOSB, Fabrika Güvenliği",
      description: "Gebze GOSB, TOSB, Gebkim, İMES ve fabrika bölgelerinde bay bayan silahlı & silahsız özel güvenlik görevlisi alımları.",
    },
  };
  return overrides[city] ?? {
    title: `${city} Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı`,
    description: `${city} bölgesinde silahlı, silahsız, AVM, fabrika, site, hastane ve plaza güvenliği bay bayan özel güvenlik görevlisi iş ilanları. Güncel maaşlı personel alımları.`,
  };
}

async function buildCityMeta(city: string, slug: string): Promise<SeoMeta> {
  const { title, description } = makeCitySeo(city);
  const pageUrl = `${SEO_BASE_URL}/${slug}-ozel-guvenlik-is-ilanlari`;

  let cityListings: { id: number; title: string; company: string }[] = [];
  try {
    const rows = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        company: listingsTable.company,
        city: listingsTable.city,
      })
      .from(listingsTable)
      .where(eq(listingsTable.status, "active"))
      .orderBy(desc(listingsTable.updatedAt))
      .limit(50);
    cityListings = rows
      .filter(r => (r.city || "").toLocaleLowerCase("tr-TR").includes(city.toLocaleLowerCase("tr-TR")))
      .slice(0, 20);
  } catch { /* ignore */ }

  const listingLinks = cityListings.length
    ? `<h2>${escapeHtml(city)} Aktif İlanlar</h2><ul>${cityListings
        .map(l => `<li><a href="${SEO_BASE_URL}/ilan/${l.id}">${escapeHtml(l.title)} - ${escapeHtml(l.company || "")}</a></li>`)
        .join("")}</ul>`
    : "";

  const otherCityLinks = ALL_LOCATIONS
    .filter(c => c !== city)
    .slice(0, 30)
    .map(c => `<a href="${SEO_BASE_URL}/${toSlug(c)}-ozel-guvenlik-is-ilanlari">${escapeHtml(c)}</a>`)
    .join(" · ");

  return {
    title,
    description,
    canonical: pageUrl,
    ogImage: `${SEO_BASE_URL}/og-image.jpg`,
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
<p><strong>${escapeHtml(city)}</strong> bölgesinde özel güvenlik görevlisi iş ilanları her gün güncellenmektedir. Silahlı ve silahsız özel güvenlik personeli, AVM güvenlik görevlisi, fabrika güvenlik elemanı, site güvenliği, plaza güvenliği, hastane güvenliği, otel güvenliği ve OSB güvenlik pozisyonlarında <strong>bay bayan</strong> ${escapeHtml(city)} güvenlik iş ilanları platformumuzda yayınlanmaktadır.</p>
<p>${escapeHtml(city)} özel güvenlik sektöründe deneyimli ya da yeni mezun olan adaylar için tam zamanlı, yarı zamanlı ve part-time pozisyonlar bulunmaktadır. ${escapeHtml(description)}</p>
<h2>${escapeHtml(city)} Özel Güvenlik Maaşları ve Şartları</h2>
<p>${escapeHtml(city)} bölgesindeki özel güvenlik görevlisi maaşları, çalışılan tesis tipi (AVM, fabrika, site, plaza, hastane, otel) ve vardiya düzenine göre değişmektedir. Genel olarak bay bayan silahsız güvenlik görevlisi pozisyonlarında asgari ücret ile yemek, yol ve servis imkanları sunulmaktadır. Silahlı özel güvenlik görevlisi pozisyonlarında maaşlar daha yüksektir. ${escapeHtml(city)} özel güvenlik iş ilanlarına başvurmak için geçerli özel güvenlik kimlik kartı (silahlı veya silahsız), askerlik durumu (erkek adaylar için) ve sabıka kaydı temiz olmalıdır.</p>
<h2>${escapeHtml(city)} Bay Bayan Güvenlik Pozisyonları</h2>
<p>Platformumuzda ${escapeHtml(city)} bölgesi için aşağıdaki pozisyonlarda iş ilanları yayınlanmaktadır:</p>
<ul>
  <li><a href="${SEO_BASE_URL}/silahli-guvenlik-is-ilanlari">${escapeHtml(city)} Silahlı Özel Güvenlik İş İlanları</a></li>
  <li><a href="${SEO_BASE_URL}/silahsiz-guvenlik-is-ilanlari">${escapeHtml(city)} Silahsız Özel Güvenlik İş İlanları</a></li>
  <li><a href="${SEO_BASE_URL}/avm-guvenlik-is-ilanlari">${escapeHtml(city)} AVM Güvenlik İş İlanları</a></li>
  <li><a href="${SEO_BASE_URL}/fabrika-guvenlik-is-ilanlari">${escapeHtml(city)} Fabrika Güvenlik İş İlanları</a></li>
  <li><a href="${SEO_BASE_URL}/site-guvenlik-is-ilanlari">${escapeHtml(city)} Site Güvenlik İş İlanları</a></li>
</ul>
<h2>${escapeHtml(city)} Özel Güvenlik İş Bulma Avantajları</h2>
<p>Özel Güvenlik Online platformu, ${escapeHtml(city)} özel güvenlik sektöründe iş arayan tüm adaylara ücretsiz hizmet sunar: yapay zeka destekli iş asistanı, ücretsiz dijital CV oluşturma, anlık ilan bildirimleri, mobil uyumlu arayüz, doğrudan firma iletişimi ve favori ilan listesi gibi özelliklerle ${escapeHtml(city)} bölgesindeki özel güvenlik görevlisi alımlarına en hızlı şekilde başvurabilirsiniz.</p>
${listingLinks}
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
      .where(eq(listingsTable.id, id))
      .limit(1);
    const listing = rows[0];
    if (!listing || listing.status !== "active") return null;

    const pageUrl = `${SEO_BASE_URL}/ilan/${listing.id}`;
    const title = `${listing.title} - ${listing.company || ""} ${listing.city || ""}`.trim().slice(0, 200);
    const desc = ((listing.description || "") + "")
      .replace(/\s+/g, " ")
      .slice(0, 280) || `${listing.city} bölgesinde ${listing.company || "firma"} özel güvenlik görevlisi alımı.`;
    const validThrough = listing.expiresAt
      ? new Date(listing.expiresAt as any).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return {
      title,
      description: desc,
      canonical: pageUrl,
      ogImage: (listing as any).companyLogoUrl || `${SEO_BASE_URL}/og-image.jpg`,
      ogType: "article",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: listing.title,
          description: listing.description || desc,
          identifier: { "@type": "PropertyValue", name: "Özel Güvenlik Online", value: `#${listing.id}` },
          datePosted: (listing.createdAt as any) || new Date().toISOString(),
          validThrough,
          employmentType: (listing as any).workType || "FULL_TIME",
          hiringOrganization: { "@type": "Organization", name: listing.company || "Firma", sameAs: SEO_BASE_URL },
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: listing.city || "Türkiye", addressCountry: "TR" },
          },
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "TRY",
            value: { "@type": "QuantitativeValue", value: (listing as any).salary || "Belirtilmedi", unitText: "MONTH" },
          },
          image: (listing as any).companyLogoUrl || `${SEO_BASE_URL}/og-image.jpg`,
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: SEO_BASE_URL },
            { "@type": "ListItem", position: 2, name: "İlanlar", item: `${SEO_BASE_URL}/ilanlar` },
            { "@type": "ListItem", position: 3, name: listing.title, item: pageUrl },
          ],
        },
      ],
      bodyHtml: `
<header><h1>${escapeHtml(listing.title)}</h1></header>
<main>
<p><strong>Firma:</strong> ${escapeHtml(listing.company || "")}<br/>
<strong>Şehir:</strong> ${escapeHtml(listing.city || "")}<br/>
<strong>Pozisyon:</strong> Özel Güvenlik Görevlisi<br/>
<strong>Çalışma Tipi:</strong> ${escapeHtml((listing as any).workType || "Tam Zamanlı")}<br/>
<strong>Maaş:</strong> ${escapeHtml((listing as any).salary || "Görüşülecek")}</p>
<h2>İlan Açıklaması</h2>
<p>${escapeHtml(listing.description || desc)}</p>
${(listing as any).requirements ? `<h2>Aranan Şartlar</h2><p>${escapeHtml((listing as any).requirements)}</p>` : ""}
<p><a href="${SEO_BASE_URL}/ilanlar">Tüm İlanlar</a> · <a href="${SEO_BASE_URL}/${toSlug(listing.city || "turkiye")}-ozel-guvenlik-is-ilanlari">${escapeHtml(listing.city || "")} İlanları</a></p>
</main>`,
    };
  } catch {
    return null;
  }
}

/* ───────────── ROUTING ───────────── */
export async function getSeoMetaForPath(pathname: string): Promise<SeoMeta | null> {
  const clean = pathname.split("?")[0]!.replace(/\/+$/, "") || "/";

  if (clean === "/" || clean === "") return buildHomeMeta();

  const cityMatch = clean.match(/^\/([a-z0-9-]+)-ozel-guvenlik-is-ilanlari$/i);
  if (cityMatch) {
    const slug = cityMatch[1]!;
    const city = slugToCity(slug);
    if (city) return buildCityMeta(city, slug);
  }

  const listingMatch = clean.match(/^\/ilan\/(\d+)$/);
  if (listingMatch) {
    const id = parseInt(listingMatch[1]!, 10);
    if (Number.isFinite(id)) return buildListingMeta(id);
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

  // canonical
  out = out.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
  );

  // og:url
  out = out.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
  );

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

  // twitter:title / description / image
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

  // JSON-LD: append before </head>
  if (meta.jsonLd && meta.jsonLd.length) {
    const ldScripts = meta.jsonLd
      .map(o => `<script type="application/ld+json" data-seo="1">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`)
      .join("\n");
    out = out.replace("</head>", `${ldScripts}\n</head>`);
  }

  // Body content: replace #root spinner with SEO content (React will replace on mount)
  // Match <div id="root">…</div> (single line, contains spinner)
  out = out.replace(
    /<div id="root">[\s\S]*?<\/div>\s*<script type="module"/,
    `<div id="root"><div data-seo-content="1" style="position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden">${meta.bodyHtml}</div><div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#0F172A"><div style="width:40px;height:40px;border:3px solid rgba(79,70,229,0.25);border-top-color:#4F46E5;border-radius:50%;animation:_sp 0.8s linear infinite"></div><style>@keyframes _sp{to{transform:rotate(360deg)}}</style></div></div>\n    <script type="module"`,
  );

  return out;
}
