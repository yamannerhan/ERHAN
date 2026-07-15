/** Merkezi SEO sabitleri ve null-güvenli yardımcılar (yalnızca SEO katmanı). */

export const SEO_BASE_URL = "https://ozelguvenlik.online";
export const SEO_SITE_NAME = "Özel Güvenlik İş İlanları";
export const SEO_OG_IMAGE = `${SEO_BASE_URL}/og-brand.jpg`;

export function safeText(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  if (!s || s === "null" || s === "undefined") return fallback;
  return s;
}

export function truncateDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

export function buildHomeTitle(): string {
  return "Özel Güvenlik İş İlanları | Özel Güvenlik Online";
}

export function buildHomeDescription(): string {
  return "Türkiye genelindeki güncel özel güvenlik iş ilanlarını inceleyin. Silahlı, silahsız, bay ve bayan güvenlik görevlisi ilanlarına ücretsiz ulaşın.";
}

export function buildListingsTitle(): string {
  return "Güncel Özel Güvenlik İş İlanları | Bay Bayan Personel Alımları";
}

export function buildListingsDescription(): string {
  return truncateDescription(
    "Aktif özel güvenlik iş ilanlarını şehir, maaş ve pozisyona göre filtreleyin. Silahlı, silahsız, AVM, fabrika ve site güvenliği bay bayan personel alımları.",
  );
}

export function buildCityTitle(city: string): string {
  return `${safeText(city, "Türkiye")} Özel Güvenlik İş İlanları | Güncel Güvenlik Personeli Alımları`;
}

export function buildCityDescription(city: string): string {
  return truncateDescription(
    `${city} bölgesinde güncel özel güvenlik iş ilanları. Silahlı, silahsız, AVM, fabrika, site ve OSB güvenliği bay bayan personel alımları. Ücretsiz başvuru.`,
  );
}

export function buildCompanyTitle(company: string): string {
  return `${safeText(company, "Firma")} İş İlanları | Özel Güvenlik İş İlanları`;
}

export function buildCompanyDescription(company: string): string {
  return truncateDescription(
    `${company} özel güvenlik iş ilanları ve güncel personel alımları. Silahlı, silahsız bay bayan güvenlik görevlisi pozisyonlarına hemen başvurun.`,
  );
}

export function buildListingTitle(title: unknown, company: unknown): string {
  const t = safeText(title, "Güvenlik Personeli Aranıyor");
  const c = safeText(company, "Belirtilmemiş");
  return `${t} | ${c} | Özel Güvenlik İş İlanları`;
}

export function buildListingDescription(
  city: unknown,
  company: unknown,
  workType: unknown,
  salary: unknown,
  description: unknown,
): string {
  const c = safeText(city, "Türkiye");
  const co = safeText(company, "firma");
  const wt = safeText(workType, "Tam Zamanlı");
  const sal = salary ? ` Maaş: ${safeText(salary, "")}.` : "";
  const desc = safeText(description, "").slice(0, 80);
  return truncateDescription(
    `${c} bölgesinde ${co} firması ${wt} özel güvenlik görevlisi alımı.${sal} ${desc}`.trim(),
  );
}

export function buildNotFoundTitle(): string {
  return "Sayfa Bulunamadı | Özel Güvenlik İş İlanları";
}

export function buildNotFoundDescription(): string {
  return truncateDescription(
    "Aradığınız sayfa bulunamadı. Güncel özel güvenlik iş ilanlarına ana sayfadan veya ilanlar bölümünden ulaşabilirsiniz.",
  );
}

export function toIsoDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function mapEmploymentType(workType: unknown): string | undefined {
  const t = safeText(workType, "").toLocaleLowerCase("tr-TR");
  if (!t) return undefined;
  if (/part|yarı\s*zaman|yarim\s*zaman|günlük|gunluk/.test(t)) return "PART_TIME";
  if (/proje|geçici|gecici|dönemsel|donemsel/.test(t)) return "TEMPORARY";
  if (/sözleşmeli|sozlesmeli|kontrat/.test(t)) return "CONTRACTOR";
  if (/staj|intern/.test(t)) return "INTERN";
  if (/tam\s*zaman|full[\s-]*time|sürekli|surekli/.test(t)) return "FULL_TIME";
  return undefined;
}

export function parseSalaryNumber(salary: unknown): number | null {
  const raw = safeText(salary, "");
  if (!raw || /görüş|belirtil|müzakere|muzakere/i.test(raw)) return null;
  if (/asgari/i.test(raw) && !/\d/.test(raw)) return null;
  const range = parseSalaryMinMax(raw);
  if (range.min != null && range.max != null && range.min !== range.max) return null;
  if (range.min != null) return range.min;
  const digits = raw.replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n >= 1000 ? n : null;
}

/** "30.000 - 45.000", "30000/45000", "net 32 bin" vb. metinden min/max çıkarır */
export function parseSalaryMinMax(salary: unknown): { min: number | null; max: number | null } {
  const raw = safeText(salary, "");
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

/** Google JobPosting: baseSalary her zaman dolu olsun (önerilen alan uyarısını keser) */
export function buildBaseSalary(opts: {
  salary?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
}) {
  let min =
    typeof opts.salaryMin === "number" && opts.salaryMin >= 1000 ? opts.salaryMin : null;
  let max =
    typeof opts.salaryMax === "number" && opts.salaryMax >= 1000 ? opts.salaryMax : null;

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
      ? { "@type": "QuantitativeValue" as const, value: min!, unitText: "MONTH" }
      : {
          "@type": "QuantitativeValue" as const,
          minValue: min!,
          maxValue: max!,
          unitText: "MONTH",
        };

  return {
    "@type": "MonetaryAmount" as const,
    currency: "TRY",
    value,
  };
}

export function buildJobPostingSchema(listing: {
  id: number;
  title?: string | null;
  description?: string | null;
  company?: string | null;
  city?: string | null;
  salary?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  workType?: string | null;
  companyLogoUrl?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  sourcePublishedAt?: string | null;
  expiresAt?: string | null;
  applyUrl?: string | null;
}) {
  const pageUrl = `${SEO_BASE_URL}/ilan/${listing.id}`;
  const title = safeText(listing.title, "");
  const company = safeText(listing.company, "");
  const city = safeText(listing.city, "");
  const description = safeText(listing.description, "");
  const datePosted = toIsoDate(listing.publishedAt)
    ?? toIsoDate(listing.sourcePublishedAt)
    ?? toIsoDate(listing.createdAt);
  const validThrough = toIsoDate(listing.expiresAt);
  const employmentType = mapEmploymentType(listing.workType);
  const baseSalary = buildBaseSalary({
    salary: listing.salary,
    salaryMin: listing.salaryMin,
    salaryMax: listing.salaryMax,
  });
  const image = listing.companyLogoUrl
    ? (listing.companyLogoUrl.startsWith("http")
        ? listing.companyLogoUrl
        : `${SEO_BASE_URL}${listing.companyLogoUrl.startsWith("/") ? "" : "/"}${listing.companyLogoUrl}`)
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    identifier: {
      "@type": "PropertyValue",
      name: SEO_SITE_NAME,
      value: String(listing.id),
    },
    ...(datePosted ? { datePosted } : {}),
    ...(validThrough ? { validThrough } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(company ? { hiringOrganization: { "@type": "Organization", name: company } } : {}),
    ...(city ? {
      jobLocation: {
        "@type": "Place",
        address: { "@type": "PostalAddress", addressLocality: city, addressCountry: "TR" },
      },
    } : {}),
    ...(baseSalary ? { baseSalary } : {}),
    ...(image ? { image } : {}),
    url: pageUrl,
  };
}

export function breadcrumbSchema(items: { name: string; item: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}
