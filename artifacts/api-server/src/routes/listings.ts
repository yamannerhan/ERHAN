import { Router } from "express";
import {
  db,
  listingsTable,
  listingLikesTable,
  listingFavoritesTable,
  usersTable,
  adminSettingsTable,
  chatMessagesTable,
  notificationsTable,
  locationFilterTermsTable,
  companyProfilesTable,
  moderationReportsTable,
  supportTicketsTable,
  supportMessagesTable,
  supportTicketEventsTable,
} from "@workspace/db";
import { eq, desc, asc, and, sql, ilike, inArray, or, isNull, ne, getTableColumns } from "drizzle-orm";
import { authMiddleware, optionalAuthMiddleware, requireAdmin } from "../middlewares/auth";
import { ensureCompanySchema, rememberEmployerBasics } from "../lib/company-profiles";
import { matchKnownCompanySync, isPlaceholderListingLogo, matchKnownCompanyInBlob } from "../lib/known-companies";
import { resolveListingSourceOnCreate, listingBadgeMeta, computeRenewPriorityUntil, listingDisplayDate } from "../lib/listing-source";
import {
  listingSourceInsertFields,
  logListingSourceHistory,
  logListingPriority,
  rankListingsRecommended,
} from "../lib/listing-rank";
import { ensureListingSourceSchema, ensurePublisherVerifySchema } from "../lib/listing-source-schema";
import { findAndQueueSimilarBots } from "../lib/listing-merge";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { buildListingRequirements, createSmartListingImage, extractBenefits, extractCompany, extractGender, extractLocation, extractPhoneNumbers, extractSalary, extractTitle, extractWorkType, formatTelApplyUrl, keepPrimaryPhoneInText, normalizeSalaryString } from "../lib/job-parsing";
import { getRegionalDistrictProvinces } from "../lib/location-terms";
import {
  districtsAndLandmarksForSide,
  resolveIstanbulSideFromQuery,
  sideLiteralPatterns,
} from "../lib/istanbul-side";
import { emitRealtime, emitRealtimeToUser } from "../lib/realtime";

// ── Listing image upload setup ──────────────────────────────────────────────
const LISTING_IMAGES_DIR = path.join(process.cwd(), "uploads", "listing-images");
fs.mkdirSync(LISTING_IMAGES_DIR, { recursive: true });

const listingImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Auto image selection by keyword ────────────────────────────────────────
const LISTING_AUTO_IMAGES: { keywords: string[]; url: string }[] = [
  { keywords: ["otel","hotel","resort","turizm","tatil","konaklama"], url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=75&fit=crop" },
  { keywords: ["hastane","klinik","sağlık","medikal","tıp","poliklinik"], url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&q=75&fit=crop" },
  { keywords: ["avm","mall","alışveriş","mağaza","market"], url: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=75&fit=crop" },
  { keywords: ["şantiye","inşaat","toki","yapı","bina"], url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=75&fit=crop" },
  { keywords: ["liman","gemi","deniz","sahil","iskele"], url: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=800&q=75&fit=crop" },
  { keywords: ["fabrika","sanayi","depo","lojistik","üretim","atölye"], url: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=75&fit=crop" },
  { keywords: ["banka","finans","sigorta","plaza","ofis","merkez"], url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=75&fit=crop" },
  { keywords: ["okul","üniversite","kampüs","eğitim","anaokul"], url: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&q=75&fit=crop" },
  { keywords: ["site","konut","apartman","residans","rezidans"], url: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=75&fit=crop" },
];
const DEFAULT_LISTING_IMAGE = "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=800&q=75&fit=crop";
const LISTING_CARD_THEMES = new Set(["auto", "gold", "radar", "vip", "urgent", "glass", "stripe", "night", "map", "timeline", "holo", "light", "tactical"]);

const PROVINCES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir",
  "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli",
  "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari",
  "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir",
  "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir",
  "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat",
  "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman",
  "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce",
];

const DISTRICT_PROVINCES: Record<string, string> = {
  gebze: "Kocaeli", darica: "Kocaeli", darıca: "Kocaeli", cayirova: "Kocaeli", çayırova: "Kocaeli", dilovasi: "Kocaeli", dilovası: "Kocaeli", izmit: "Kocaeli",
  esenyurt: "İstanbul", avcilar: "İstanbul", avcılar: "İstanbul", beylikduzu: "İstanbul", beylikdüzü: "İstanbul", basaksehir: "İstanbul", başakşehir: "İstanbul",
  arnavutkoy: "İstanbul", arnavutköy: "İstanbul", tuzla: "İstanbul", pendik: "İstanbul", kartal: "İstanbul", maltepe: "İstanbul", umraniye: "İstanbul", ümraniye: "İstanbul",
  sancaktepe: "İstanbul", kirac: "İstanbul", kıraç: "İstanbul", hadimkoy: "İstanbul", hadımköy: "İstanbul", dudullu: "İstanbul", ikitelli: "İstanbul",
  ostim: "Ankara", sincana: "Ankara", sincan: "Ankara", yenimahalle: "Ankara", mamak: "Ankara", çankaya: "Ankara", cankaya: "Ankara",
};

[
  "adalar", "bayrampaşa", "bayrampasa", "beşiktaş", "besiktas", "beykoz", "beyoğlu", "beyoglu", "çatalca", "catalca", "esenler", "eyüpsultan", "eyupsultan",
  "fatih", "gaziosmanpaşa", "gaziosmanpasa", "gop", "güngören", "gungoren", "kağıthane", "kagithane", "sultanbeyli", "sultangazi", "şile", "sile", "şişli", "sisli",
  "üsküdar", "uskudar", "silivri", "ataköy", "atakoy", "incirli", "şirinevler", "sirinevler", "florya", "yeşilköy", "yesilkoy", "sefaköy", "sefakoy", "halkalı", "halkali",
  "kanarya", "cennet", "güneşli", "gunesli", "mahmutbey", "kayaşehir", "kayasehir", "altınşehir", "altinsehir", "bahçeşehir", "bahcesehir", "esenkent", "gürpınar", "gurpinar",
  "kavaklı", "kavakli", "mimaroba", "topkapı", "topkapi", "cevizlibağ", "cevizlibag", "merter", "zeytinburnu", "aksaray", "laleli", "eminönü", "eminonu", "sirkeci",
  "unkapanı", "unkapani", "fatihunkapani", "fatihunkapanı", "fatih unkapanı", "fatih unkapani", "karaköy", "karakoy", "galata", "kabataş", "kabatas", "fındıklı", "findikli", "taksim", "cihangir", "kasımpaşa", "kasimpasa", "dolapdere", "okmeydanı", "okmeydani",
  "halıcıoğlu", "halicioglu", "alibeyköy", "alibeykoy", "mecidiyeköy", "mecidiyekoy", "nişantaşı", "nisantasi", "bomonti", "fulya", "gayrettepe", "levent", "4.levent",
  "etiler", "ulus", "ortaköy", "ortakoy", "bebek", "kuruçeşme", "kurucesme", "rumelihisarı", "rumelihisari", "istinye", "tarabya", "yeniköy", "yenikoy", "emirgan",
  "maslak", "seyrantepe", "çağlayan", "caglayan", "gültepe", "gultepe", "altunizade", "acıbadem", "acibadem", "çengelköy", "cengelkoy", "beylerbeyi", "kısıklı", "kisikli",
  "çamlıca", "camlica", "alemdağ", "alemdag", "taşdelen", "tasdelen", "samandıra", "samandira", "fikirtepe", "hasanpaşa", "hasanpasa", "kozyatağı", "kozyatagi", "göztepe",
  "goztepe", "erenköy", "erenkoy", "suadiye", "bostancı", "bostanci", "feneryolu", "caddebostan", "cevizli", "dragos", "soğanlık", "soganlik", "yakacık", "yakacik",
  "kurtköy", "kurtkoy", "yayalar", "aydınlı", "aydinli", "orhanlı", "orhanli", "tepeören", "tepeoren", "ataşehir", "atasehir", "içerenköy", "icerenkoy", "kayışdağı",
  "kayisdagi", "ferhatpaşa", "ferhatpasa", "barbaros", "vadi istanbul", "vadistanbul", "istoç", "istoc", "ikitelli osb", "başakşehir osb", "basaksehir osb", "dudullu osb",
  "hadımköy osb", "hadimkoy osb", "basın ekspres", "basin ekspres", "mall of istanbul", "212 avm", "perpa", "tekstilkent", "kuyumcukent", "atatürk havalimanı",
  "ataturk havalimani", "istanbul havalimanı", "istanbul havalimani", "sabiha gökçen", "sabiha gokcen",
].forEach(term => { DISTRICT_PROVINCES[term] = "İstanbul"; });

[
  "körfez", "korfez", "derince", "gölcük", "golcuk", "başiskele", "basiskele", "kandıra", "kandira", "kartepe", "değirmendere", "degirmendere",
  "hereke", "yarımca", "yarimca", "tütünçiftlik", "tutunciftlik", "kirazlıyalı", "kirazliyali", "yenikent", "maşukiye", "masukiye", "uzuntarla",
  "köseköy", "kosekoy", "bahçecik", "bahcecik", "yahyakaptan", "alikahya", "bekirdere", "karabaş", "karabas", "veliahmet",
  "plajyolu", "tatlıkuyu", "tatlikuyu", "mustafapaşa", "mustafapasa",
  "şekerpınar", "sekerpinar", "gosb", "taysad", "gebze taysad",
  "gebze osb", "gebze organize sanayi bölgesi", "tosb", "imes osb", "gebkim", "gebkim osb",
  "dilovası osb", "dilovasi osb", "kimya ihtisas osb", "plastikçiler osb", "plastikciler osb",
  "makine ihtisas osb", "asım kibar osb", "asim kibar osb", "kobi osb",
  "demirciler osb", "kömürcüler osb", "komurculer osb", "kartepe karma osb", "başiskele osb", "basiskele osb",
  "pelitli", "balçık", "balcik", "muallimköy", "muallimkoy", "köseler", "koseler",
  "derince liman", "evyapport", "safiport", "ford otosan",
  "hyundai assan", "gölcük tersane", "golcuk tersane", "ford yeniköy", "ford yenikoy",
].forEach(term => { DISTRICT_PROVINCES[term] = "Kocaeli"; });

Object.assign(DISTRICT_PROVINCES, getRegionalDistrictProvinces());

function parseHiddenListingCities(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

/** Sahte/demo kaynaklı ilanları hariç tut */
function realListingFilter() {
  return or(isNull(listingsTable.sourceTag), ne(listingsTable.sourceTag, "demo"));
}

const {
  description: _description,
  requirements: _requirements,
  rawText: _rawText,
  verificationSnapshot: _verificationSnapshot,
  latitude: _latitude,
  longitude: _longitude,
  locationAccuracy: _locationAccuracy,
  locationSource: _locationSource,
  ...listingListColumns
} = getTableColumns(listingsTable);

const listingListSelection = {
  ...listingListColumns,
  description: sql<string | null>`left(${listingsTable.description}, 700)`,
  requirements: sql<string | null>`left(${listingsTable.requirements}, 400)`,
};

function normalizeCityText(value: string) {
  return value.toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

function locationSearchVariants(value: string): string[] {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const normalized = normalizeCityText(trimmed);
  return [...new Set([
    trimmed,
    trimmed.replace(/\s+/g, ""),
    normalized,
    normalized.replace(/\s+/g, ""),
  ].filter(Boolean))];
}

function normalizedColumn(column: unknown) {
  return sql`lower(translate(${column}, 'ÇĞİIÖŞÜçğıiöşü', 'CGIIOSUcgiiiosu'))`;
}

function locationTermCondition(pattern: string) {
  const variants = locationSearchVariants(pattern);
  // Kısa terimler (des, imes…) açıklamada "adres" gibi kelimelere yanlış denk gelmesin — sadece city alanında ara
  const compactLen = normalizeCityText(pattern).replace(/\s+/g, "").length;
  const cityOnly = compactLen < 5;
  return or(...variants.flatMap(variant => {
    const norm = normalizeCityText(variant);
    const compact = norm.replace(/\s+/g, "");
    const cityConds = [
      ilike(listingsTable.city, `%${variant}%`),
      sql`${normalizedColumn(listingsTable.city)} like ${`%${norm}%`}`,
      sql`replace(${normalizedColumn(listingsTable.city)}, ' ', '') like ${`%${compact}%`}`,
    ];
    if (cityOnly) return cityConds;
    return [
      ...cityConds,
      ilike(listingsTable.title, `%${variant}%`),
      ilike(listingsTable.description, `%${variant}%`),
      sql`${normalizedColumn(listingsTable.title)} like ${`%${norm}%`}`,
      sql`${normalizedColumn(listingsTable.description)} like ${`%${norm}%`}`,
      sql`replace(${normalizedColumn(listingsTable.title)}, ' ', '') like ${`%${compact}%`}`,
      sql`replace(${normalizedColumn(listingsTable.description)}, ' ', '') like ${`%${compact}%`}`,
    ];
  }));
}

function extractProvinceName(value: string | null): string | null {
  if (!value?.trim()) return null;
  const normalized = normalizeCityText(value);
  for (const province of PROVINCES) {
    if (normalized.includes(normalizeCityText(province))) return province;
  }
  for (const [district, province] of Object.entries(DISTRICT_PROVINCES)) {
    if (normalized.includes(normalizeCityText(district))) return province;
  }
  const firstPart = value.split(/[\/,|-]/)[0]?.trim();
  return firstPart || null;
}

async function getLocationTermsForProvince(province: string): Promise<string[]> {
  const rows = await db.select({ term: locationFilterTermsTable.term })
    .from(locationFilterTermsTable)
    .where(ilike(locationFilterTermsTable.province, province));
  return rows.map(row => row.term);
}

async function cityFilterCondition(city: string) {
  const istanbulSide = resolveIstanbulSideFromQuery(city);
  if (istanbulSide) {
    const terms = [
      ...sideLiteralPatterns(istanbulSide),
      ...districtsAndLandmarksForSide(istanbulSide),
    ];
    const positive = or(
      ...terms.flatMap((pattern) => {
        const variants = locationSearchVariants(pattern);
        return variants.flatMap((variant) => {
          const norm = normalizeCityText(variant);
          const compact = norm.replace(/\s+/g, "");
          if (compact.length < 3) return [];
          return [
            ilike(listingsTable.city, `%${variant}%`),
            sql`${normalizedColumn(listingsTable.city)} like ${`%${norm}%`}`,
            sql`replace(${normalizedColumn(listingsTable.city)}, ' ', '') like ${`%${compact}%`}`,
          ];
        });
      }),
    );

    // Başka il ile başlayanları ele
    const otherProvinceClauses = PROVINCES
      .filter((p) => normalizeCityText(p) !== "istanbul")
      .flatMap((p) => {
        const np = normalizeCityText(p);
        return [
          sql`${normalizedColumn(listingsTable.city)} like ${`${np} /%`}`,
          sql`${normalizedColumn(listingsTable.city)} like ${`${np}/%`}`,
          sql`${normalizedColumn(listingsTable.city)} like ${`${np},%`}`,
          sql`${normalizedColumn(listingsTable.city)} = ${np}`,
        ];
      });

    if (otherProvinceClauses.length === 0) return positive;
    return and(positive, sql`NOT (${or(...otherProvinceClauses)})`);
  }

  const province = extractProvinceName(city) ?? city;
  const normProv = normalizeCityText(province);

  // Kısa / belirsiz terimler (başka illerle çakışır) — filtrede kullanma
  const AMBIGUOUS = new Set([
    "kimyaosb", "tepecik", "mimarsinan", "yenisehir", "cumhuriyetmahallesi",
    "aksaray", "konak", "merkez", "sanayi", "osb", "organize", "fabrika",
    "hyundai", "brisa", "pirelli", "goodyear",
  ]);

  const customTerms = await getLocationTermsForProvince(province);
  const districts = Object.entries(DISTRICT_PROVINCES)
    .filter(([, p]) => p === province)
    .map(([d]) => d);

  const uniqueDistricts = [...districts, ...customTerms]
    .map((t) => String(t || "").trim())
    .filter((t) => {
      const compact = normalizeCityText(t).replace(/\s+/g, "");
      if (compact.length < 5) return false;
      if (AMBIGUOUS.has(compact)) return false;
      return true;
    });

  // 1) İl adı city alanında geçmeli VEYA benzersiz OSB/ilçe
  const provincePatterns = locationSearchVariants(province);
  const positive = or(
    ...provincePatterns.flatMap((variant) => {
      const norm = normalizeCityText(variant);
      const compact = norm.replace(/\s+/g, "");
      if (compact.length < 2) return [];
      return [
        ilike(listingsTable.city, `${variant}%`),
        ilike(listingsTable.city, `%${variant}%`),
        sql`${normalizedColumn(listingsTable.city)} like ${`${norm}%`}`,
        sql`${normalizedColumn(listingsTable.city)} like ${`%${norm}%`}`,
        sql`replace(${normalizedColumn(listingsTable.city)}, ' ', '') like ${`%${compact}%`}`,
      ];
    }),
    ...uniqueDistricts.flatMap((pattern) => {
      const variants = locationSearchVariants(pattern);
      return variants.flatMap((variant) => {
        const norm = normalizeCityText(variant);
        const compact = norm.replace(/\s+/g, "");
        if (compact.length < 5) return [];
        return [
          ilike(listingsTable.city, `%${variant}%`),
          sql`${normalizedColumn(listingsTable.city)} like ${`%${norm}%`}`,
          sql`replace(${normalizedColumn(listingsTable.city)}, ' ', '') like ${`%${compact}%`}`,
        ];
      });
    }),
  );

  // 2) city alanı başka bir il ile başlıyorsa ELER
  //    örn: "İstanbul / Tuzla Kimya OSB" → Kocaeli filtresine girmez
  const otherProvinceClauses = PROVINCES
    .filter((p) => normalizeCityText(p) !== normProv)
    .flatMap((p) => {
      const np = normalizeCityText(p);
      return [
        sql`${normalizedColumn(listingsTable.city)} like ${`${np} /%`}`,
        sql`${normalizedColumn(listingsTable.city)} like ${`${np}/%`}`,
        sql`${normalizedColumn(listingsTable.city)} like ${`${np},%`}`,
        sql`${normalizedColumn(listingsTable.city)} = ${np}`,
      ];
    });

  if (otherProvinceClauses.length === 0) return positive;
  return and(positive, sql`NOT (${or(...otherProvinceClauses)})`);
}

function pickAutoImage(title: string, description: string | null): string {
  const hay = (title + " " + (description ?? "")).toLowerCase();
  for (const { keywords, url } of LISTING_AUTO_IMAGES) {
    if (keywords.some(k => hay.includes(k))) return url;
  }
  return DEFAULT_LISTING_IMAGE;
}

function normalizeCardTheme(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const theme = value.trim().toLowerCase();
  return LISTING_CARD_THEMES.has(theme) && theme !== "auto" ? theme : null;
}

function canUseCardTheme(user?: Express.Request["user"]) {
  return !!user;
}

const router = Router();

// Regex patterns for masking contact info in descriptions
const PHONE_MASK_RE = /(?:0|\+90)[\s\-]?(?:\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\d{3}[\s\-]?\d{7})/g;
// Only label words that are typically followed by a PERSON NAME (not phone numbers)
const NAME_AFTER_LABEL_RE = /(?:^|[\s\n])(?:iletişim|irtibat|yetkili|sorumlu|koordinatör|temsilci)\s*[:\-]?\s*([A-ZÇĞİÖŞÜ][a-zçğışöü]{2,20}\s+[A-ZÇĞİÖŞÜ][a-zçğışöü]{2,20})/gim;

function maskContactInfo(text: string): string {
  // Replace phone numbers
  let s = text.replace(PHONE_MASK_RE, "[GİRİŞ_GEREKLİ]");
  // Replace person name (capture group 1) after contact labels, keep label prefix
  s = s.replace(NAME_AFTER_LABEL_RE, (full, name: string) =>
    full.slice(0, full.lastIndexOf(name)) + "[GİRİŞ_GEREKLİ]"
  );
  return s;
}

function hasSensitiveInfo(text: string | null, applyUrl: string | null): boolean {
  if (!text && !applyUrl) return false;
  if (applyUrl?.startsWith("tel:")) return true;
  if (text) {
    const hasPhone = PHONE_MASK_RE.test(text);
    PHONE_MASK_RE.lastIndex = 0;
    const hasName = NAME_AFTER_LABEL_RE.test(text);
    NAME_AFTER_LABEL_RE.lastIndex = 0;
    if (hasPhone || hasName) return true;
  }
  return false;
}

type CompanyOverlay = {
  companyName: string;
  logoPath: string | null;
  isVerified: boolean;
  id: number;
};

function hideSourceRequirementLines(requirements: string | null): string | null {
  if (!requirements) return requirements;
  const visible = requirements
    .split(/\r?\n/)
    .filter((line) => !/^\s*kaynak\s*:/i.test(line))
    .join("\n")
    .trim();
  return visible || null;
}

function formatListing(
  listing: typeof listingsTable.$inferSelect,
  userId?: number,
  likedIds?: Set<number>,
  favIds?: Set<number>,
  authorUsername?: string | null,
  company?: CompanyOverlay | null,
  opts?: { includeSourceMeta?: boolean },
) {
  const isAuth = userId != null;
  const rawDesc = listing.description && listing.sourceType === "bot_imported"
    ? keepPrimaryPhoneInText(listing.description)
    : listing.description;
  let rawApplyUrl = listing.applyUrl;

  // Telegram/WA linkine düşme — açıklamadaki ilk gerçek telefonu kullan.
  if (rawApplyUrl && /t\.me\/|telegram\.me\/|wa\.me\//i.test(rawApplyUrl)) {
    const phones = extractPhoneNumbers(`${rawDesc ?? ""}\n${listing.requirements ?? ""}\n${listing.title}`).slice(0, 1);
    rawApplyUrl = formatTelApplyUrl(phones);
  } else if (!rawApplyUrl && rawDesc) {
    const phones = extractPhoneNumbers(`${rawDesc}\n${listing.requirements ?? ""}\n${listing.title}`).slice(0, 1);
    if (phones.length) rawApplyUrl = formatTelApplyUrl(phones);
  } else if (rawApplyUrl?.startsWith("tel:")) {
    // Eski bot kayıtlarında birikmiş numaraları kullanıcıya çoğaltma.
    const phones = [
      ...extractPhoneNumbers(rawApplyUrl),
      ...extractPhoneNumbers(`${rawDesc ?? ""}\n${listing.requirements ?? ""}`),
    ].slice(0, 1);
    const merged = formatTelApplyUrl(phones);
    if (merged) rawApplyUrl = merged;
  }

  // Mask sensitive info for unauthenticated users
  const description = rawDesc ? (isAuth ? rawDesc : maskContactInfo(rawDesc)) : null;
  const applyUrl = rawApplyUrl
    ? (isAuth ? rawApplyUrl : (rawApplyUrl.startsWith("tel:") || rawApplyUrl.startsWith("http") ? "auth_required" : rawApplyUrl))
    : null;

  // Reset regex state after use
  PHONE_MASK_RE.lastIndex = 0;
  NAME_AFTER_LABEL_RE.lastIndex = 0;

  // Şirket adı/logo: profil varsa dinamik; bilinen marka kataloğu; sahte SVG enjekte etme
  let companyName = company?.companyName || listing.company || "Belirtilmedi";
  let companyLogoUrl = company?.logoPath || listing.companyLogoUrl || null;
  let companyVerified = company?.isVerified ?? false;

  try {
    if (isPlaceholderListingLogo(companyLogoUrl)) {
      const brand =
        matchKnownCompanySync(companyName) ||
        matchKnownCompanyInBlob(`${companyName} ${listing.title} ${listing.description ?? ""}`);
      if (brand) {
        companyLogoUrl = brand.logoUrl;
        companyVerified = true;
        const cn = (companyName || "").toLocaleLowerCase("tr-TR");
        if (!cn || cn.includes("belirtilmedi") || cn.includes("belirtilmemiş") || cn.includes("belirtilmemis")) {
          companyName = brand.name;
        }
      }
    } else if (matchKnownCompanySync(companyName) || matchKnownCompanyInBlob(companyName)) {
      companyVerified = true;
    }
  } catch { /* ignore */ }
  if (
    listing.sourceType === "bot_imported"
    || ["telegram", "whatsapp", "eleman", "demo"].includes(listing.sourceTag ?? "")
  ) {
    companyVerified = false;
  } else {
    companyVerified = !!listing.verifiedPublisher;
  }

  return {
    id: listing.id,
    title: listing.title,
    company: companyName,
    city: listing.city,
    salary: listing.salary,
    workType: listing.workType,
    description,
    requirements: opts?.includeSourceMeta
      ? listing.requirements
      : hideSourceRequirementLines(listing.requirements),
    status: listing.status,
    viewCount: listing.viewCount,
    likeCount: listing.likeCount,
    isFeatured: listing.isFeatured,
    featuredUntil: listing.featuredUntil ? listing.featuredUntil.toISOString() : null,
    featuredIsFree: listing.featuredIsFree ?? false,
    cardTheme: listing.cardTheme,
    applyUrl,
    contactInfoMasked: !isAuth && hasSensitiveInfo(rawDesc, rawApplyUrl),
    companyLogoUrl,
    companyProfileId: company?.id ?? listing.companyProfileId ?? null,
    companyVerified,
    authorId: listing.authorId,
    authorUsername: authorUsername ?? null,
    sourceType: listing.sourceType ?? null,
    sourceName: listing.sourceName ?? null,
    verifiedPublisher: !!listing.verifiedPublisher,
    lastCheckedAt: listing.lastCheckedAt
      ? listing.lastCheckedAt.toISOString()
      : (listing.lastSeenAt ? listing.lastSeenAt.toISOString() : null),
    badges: listingBadgeMeta(listing),
    sourceUrl: listing.sourceUrl ?? null,
    ...(opts?.includeSourceMeta
      ? {
          sourceTag: listing.sourceTag ?? null,
          directPriorityUntil: listing.directPriorityUntil ? listing.directPriorityUntil.toISOString() : null,
          freshnessConfirmedAt: listing.freshnessConfirmedAt ? listing.freshnessConfirmedAt.toISOString() : null,
          sourcePublishedAt: listing.sourcePublishedAt
            ? listing.sourcePublishedAt.toISOString()
            : null,
          messageId: listing.messageId ?? null,
        }
      : {}),
    isLikedByMe: userId != null && likedIds != null ? likedIds.has(listing.id) : false,
    isFavoritedByMe: userId != null && favIds != null ? favIds.has(listing.id) : false,
    expiresAt: listing.expiresAt ? listing.expiresAt.toISOString() : null,
    autoDeleteOnExpiry: listing.autoDeleteOnExpiry ?? true,
    createdAt: listingDisplayDate(listing).toISOString(),
  };
}

async function loadCompanyOverlays(
  listings: (typeof listingsTable.$inferSelect)[],
): Promise<Map<number, CompanyOverlay>> {
  const byListing = new Map<number, CompanyOverlay>();
  if (listings.length === 0) return byListing;

  try {
    await ensureCompanySchema();
  } catch { /* ignore */ }

  const profileIds = [...new Set(listings.map((l) => l.companyProfileId).filter(Boolean) as number[])];
  const authorIds = [...new Set(listings.map((l) => l.authorId).filter(Boolean) as number[])];

  const profilesById = new Map<number, CompanyOverlay>();
  const profilesByUser = new Map<number, CompanyOverlay>();

  if (profileIds.length > 0) {
    const rows = await db
      .select({
        id: companyProfilesTable.id,
        userId: companyProfilesTable.userId,
        companyName: companyProfilesTable.companyName,
        logoPath: companyProfilesTable.logoPath,
        isVerified: companyProfilesTable.isVerified,
      })
      .from(companyProfilesTable)
      .where(and(inArray(companyProfilesTable.id, profileIds), isNull(companyProfilesTable.deletedAt), eq(companyProfilesTable.isActive, true)));
    for (const p of rows) {
      const o: CompanyOverlay = {
        id: p.id,
        companyName: p.companyName,
        logoPath: p.logoPath,
        isVerified: p.isVerified,
      };
      profilesById.set(p.id, o);
      profilesByUser.set(p.userId, o);
    }
  }

  const missingAuthors = authorIds.filter((id) => ![...profilesByUser.keys()].includes(id));
  if (missingAuthors.length > 0) {
    const rows = await db
      .select({
        id: companyProfilesTable.id,
        userId: companyProfilesTable.userId,
        companyName: companyProfilesTable.companyName,
        logoPath: companyProfilesTable.logoPath,
        isVerified: companyProfilesTable.isVerified,
      })
      .from(companyProfilesTable)
      .where(and(inArray(companyProfilesTable.userId, missingAuthors), isNull(companyProfilesTable.deletedAt), eq(companyProfilesTable.isActive, true)));
    for (const p of rows) {
      const o: CompanyOverlay = {
        id: p.id,
        companyName: p.companyName,
        logoPath: p.logoPath,
        isVerified: p.isVerified,
      };
      profilesByUser.set(p.userId, o);
      if (!profilesById.has(p.id)) profilesById.set(p.id, o);
    }
  }

  for (const l of listings) {
    const fromId = l.companyProfileId ? profilesById.get(l.companyProfileId) : undefined;
    const fromAuthor = l.authorId ? profilesByUser.get(l.authorId) : undefined;
    const chosen = fromId || fromAuthor;
    if (chosen) byListing.set(l.id, chosen);
  }
  return byListing;
}

router.get("/listings", optionalAuthMiddleware, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "10"), 10)));
  const offset = (page - 1) * limit;
  const city = req.query["city"] as string | undefined;
  const search = req.query["search"] as string | undefined;
  const featured = req.query["featured"] === "true";
  const includeTotal = req.query["includeTotal"] !== "false";
  const sortRaw = String(req.query["sort"] ?? "recommended").toLowerCase();
  const sort = sortRaw === "newest" || sortRaw === "oldest" || sortRaw === "recommended"
    ? sortRaw
    : "recommended";

  try {
    await ensureListingSourceSchema();
  } catch { /* ignore */ }

  const conditions = [];
  if (featured) conditions.push(eq(listingsTable.isFeatured, true));
  if (city) {
    const condition = await cityFilterCondition(city);
    if (condition) conditions.push(condition);
  }
  if (search) conditions.push(ilike(listingsTable.title, `%${search}%`));
  conditions.push(eq(listingsTable.status, "active"));
  conditions.push(eq(listingsTable.isActive, true));
  conditions.push(realListingFilter());
  // Birleştirilmiş bot kopyalarını gizle
  conditions.push(isNull(listingsTable.mergedIntoListingId));
  // Sitede görünme: siteye eklenme tarihine göre 15 gün (kaynak mesaj tarihi değil)
  const activeCutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  conditions.push(sql`COALESCE(${listingsTable.firstSeenAt}, ${listingsTable.createdAt}) >= ${activeCutoff}`);

  const settings = await db.select({ hiddenListingCities: adminSettingsTable.hiddenListingCities }).from(adminSettingsTable).limit(1);
  const hiddenCities = parseHiddenListingCities(settings[0]?.hiddenListingCities);
  for (const hiddenCity of hiddenCities) {
    const province = extractProvinceName(hiddenCity) ?? hiddenCity;
    const customTerms = await getLocationTermsForProvince(province);
    const patterns = [province, ...Object.entries(DISTRICT_PROVINCES).filter(([, p]) => p === province).map(([d]) => d), ...customTerms];
    conditions.push(sql`not (${or(...patterns.map(locationTermCondition))})`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countResult = includeTotal
    ? await db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(whereClause)
    : [];
  const total = countResult[0]?.count ?? 0;

  let listings: (typeof listingsTable.$inferSelect)[];

  if (sort === "recommended") {
    // Skor + soft interleave için sayfa penceresinden daha geniş çek
    const fetchLimit = Math.min(500, Math.max(limit * 5, offset + limit + 80));
    const pool = await db
      .select(listingListSelection)
      .from(listingsTable)
      .where(whereClause)
      .orderBy(desc(listingsTable.isFeatured), desc(listingsTable.createdAt))
      .limit(fetchLimit) as unknown as (typeof listingsTable.$inferSelect)[];
    const ranked = rankListingsRecommended(pool, { featured });
    listings = ranked.slice(offset, offset + limit);
  } else if (sort === "oldest") {
    listings = await db
      .select(listingListSelection)
      .from(listingsTable)
      .where(whereClause)
      .orderBy(asc(sql`COALESCE(${listingsTable.sourcePublishedAt}, ${listingsTable.firstSeenAt}, ${listingsTable.createdAt})`))
      .limit(limit)
      .offset(offset) as unknown as (typeof listingsTable.$inferSelect)[];
  } else {
    // newest — gerçek yayın tarihi, bonus yok
    listings = await db
      .select(listingListSelection)
      .from(listingsTable)
      .where(whereClause)
      .orderBy(desc(sql`COALESCE(${listingsTable.sourcePublishedAt}, ${listingsTable.firstSeenAt}, ${listingsTable.createdAt})`))
      .limit(limit)
      .offset(offset) as unknown as (typeof listingsTable.$inferSelect)[];
  }

  const userId = req.user?.id;

  let likedIds = new Set<number>();
  let favIds = new Set<number>();

  if (userId) {
    const listingIds = listings.map((listing) => listing.id);
    const [likes, favs] = await Promise.all([
      listingIds.length > 0
        ? db.select({ listingId: listingLikesTable.listingId }).from(listingLikesTable)
          .where(and(eq(listingLikesTable.userId, userId), inArray(listingLikesTable.listingId, listingIds)))
        : Promise.resolve([]),
      listingIds.length > 0
        ? db.select({ listingId: listingFavoritesTable.listingId }).from(listingFavoritesTable)
          .where(and(eq(listingFavoritesTable.userId, userId), inArray(listingFavoritesTable.listingId, listingIds)))
        : Promise.resolve([]),
    ]);
    likedIds = new Set(likes.map(l => l.listingId));
    favIds = new Set(favs.map(f => f.listingId));
  }

  const authorIds = [...new Set(listings.map(l => l.authorId).filter(Boolean) as number[])];
  let authorMap = new Map<number, string>();
  if (authorIds.length > 0) {
    const authors = await db.select({ id: usersTable.id, username: usersTable.username }).from(usersTable).where(inArray(usersTable.id, authorIds));
    authorMap = new Map(authors.map(a => [a.id, a.username]));
  }

  const companyMap = await loadCompanyOverlays(listings);

  res.vary("Authorization");
  res.set("Cache-Control", userId ? "private, no-store" : "private, max-age=15, stale-while-revalidate=30");
  res.json({
    listings: listings.map(l => formatListing(
      l,
      userId,
      likedIds,
      favIds,
      l.authorId ? authorMap.get(l.authorId) : null,
      companyMap.get(l.id) ?? null,
    )),
    total,
    page,
    limit,
    sort,
  });
});

router.get("/listings/cities", async (_req, res): Promise<void> => {
  const settings = await db.select({ hiddenListingCities: adminSettingsTable.hiddenListingCities }).from(adminSettingsTable).limit(1);
  const hiddenCities = new Set(parseHiddenListingCities(settings[0]?.hiddenListingCities).map(normalizeCityText));
  const rows = await db
    .select({ city: listingsTable.city, count: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.status, "active"),
      eq(listingsTable.isActive, true),
      realListingFilter(),
      sql`COALESCE(${listingsTable.firstSeenAt}, ${listingsTable.createdAt}) >= ${new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)}`,
    ))
    .groupBy(listingsTable.city)
    .orderBy(sql`count(*) desc`, listingsTable.city);

  const provinceCounts = new Map<string, number>();
  for (const row of rows) {
    const province = extractProvinceName(row.city);
    if (!province) continue;
    if (hiddenCities.has(normalizeCityText(province))) continue;
    provinceCounts.set(province, (provinceCounts.get(province) ?? 0) + row.count);
  }

  res.json([...provinceCounts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr-TR")));
});

// ── Listing image upload ────────────────────────────────────────────────────
router.post("/listings/image-upload", authMiddleware, listingImageUpload.single("image"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Resim dosyası gerekli (jpg, png, webp)" }); return; }
  const logo = await sharp(req.file.buffer)
    .resize(512, 512, {
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: 82 })
    .toBuffer();
  // İlan kaydedilince şirket profiline DB tabanlı kalıcı logo olarak aktarılır.
  const url = `data:image/webp;base64,${logo.toString("base64")}`;
  res.json({ url });
});

router.post("/listings/parse", authMiddleware, async (req, res): Promise<void> => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) { res.status(400).json({ error: "Metin zorunludur" }); return; }
  const location = extractLocation(text);
  const gender = extractGender(text);
  const benefits = extractBenefits(text);
  const title = extractTitle(text);
  const salaryRaw = extractSalary(text);
  const salary = salaryRaw ? (normalizeSalaryString(salaryRaw) ?? salaryRaw) : "";
  const phones = extractPhoneNumbers(text);
  const phone = phones[0] ?? "";
  res.json({
    title,
    company: extractCompany(text, "Belirtilmedi"),
    city: location.display ?? location.city ?? "Türkiye",
    district: location.district ?? location.neighborhood ?? "",
    workType: extractWorkType(text),
    salary,
    benefits: benefits.join(", "),
    gender: gender ?? "",
    description: text.trim(),
    contactPhone: phones.join(", "),
    contactPhones: phones,
    contactName: "",
    applyUrl: formatTelApplyUrl(phones) ?? "",
    requirements: buildListingRequirements({ gender, location, benefits, source: "Kullanıcı ilanı" }),
    companyLogoUrl: createSmartListingImage(text, title),
  });
});

// ── Serve listing images ───────────────────────────────────────────────────
router.get("/listing-images/:filename", (req, res): void => {
  const filename = String(req.params["filename"]).replace(/[^a-zA-Z0-9_\-\.]/g, "");
  const filepath = path.join(LISTING_IMAGES_DIR, filename);
  if (!fs.existsSync(filepath)) { res.status(404).end(); return; }
  res.sendFile(filepath);
});

router.post("/listings", authMiddleware, async (req, res): Promise<void> => {
  const { title, company, city, salary, workType, description, requirements, applyUrl, companyLogoUrl, cardTheme, autoDeleteOnExpiry, contactName } = req.body as {
    title?: string;
    company?: string;
    city?: string;
    salary?: string;
    workType?: string;
    description?: string;
    requirements?: string;
    applyUrl?: string;
    companyLogoUrl?: string;
    cardTheme?: string;
    autoDeleteOnExpiry?: boolean;
    contactName?: string;
  };

  if (!title || !city) {
    res.status(400).json({ error: "Başlık ve şehir zorunludur" });
    return;
  }

  let companyProfileId: number | null = null;
  let resolvedCompany = typeof company === "string" ? company.trim() : "";
  let resolvedLogo = typeof companyLogoUrl === "string" ? companyLogoUrl : null;

  try {
    await ensureCompanySchema();
    const [profile] = await db
      .select()
      .from(companyProfilesTable)
      .where(and(eq(companyProfilesTable.userId, req.user!.id), isNull(companyProfilesTable.deletedAt), eq(companyProfilesTable.isActive, true)))
      .limit(1);
    if (profile) {
      companyProfileId = profile.id;
      if (!resolvedCompany || resolvedCompany === "Belirtilmedi") resolvedCompany = profile.companyName;
      if (!resolvedLogo && profile.logoPath) resolvedLogo = profile.logoPath;
    }
  } catch { /* schema henüz yoksa devam */ }

  if (!resolvedCompany) resolvedCompany = "Belirtilmedi";

  const phones = extractPhoneNumbers([
    typeof applyUrl === "string" ? applyUrl : "",
    typeof description === "string" ? description : "",
    typeof requirements === "string" ? requirements : "",
  ].join("\n"));
  const resolvedApplyUrl = formatTelApplyUrl(phones)
    ?? (typeof applyUrl === "string" && applyUrl.trim() && !/^tel:/i.test(applyUrl) ? applyUrl.trim() : null);
  const resolvedContactName = typeof contactName === "string"
    ? contactName.split(/[,;\n|]+/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 8).join(", ")
    : "";

  let resolvedRequirements = typeof requirements === "string" ? requirements : null;
  if (resolvedContactName) {
    const lines = (resolvedRequirements ?? "").split("\n").filter((l) => !/^Yetkili\s*:/i.test(l.trim()));
    lines.push(`Yetkili: ${resolvedContactName}`);
    resolvedRequirements = lines.filter(Boolean).join("\n");
  }

  const { assignCoordsFromCity } = await import("../lib/nearby-listings");
  const coords = assignCoordsFromCity(String(city));

  const normalizedSalary = typeof salary === "string" && salary.trim()
    ? (normalizeSalaryString(salary) ?? salary.trim())
    : null;

  try {
    await ensureListingSourceSchema();
    await ensurePublisherVerifySchema();
  } catch { /* ignore */ }

  const [authorRow] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
  const sourceResolved = resolveListingSourceOnCreate({
    author: authorRow ?? {
      id: req.user!.id,
      username: req.user!.username,
      role: req.user!.role,
    },
  });

  const [listing] = await db.insert(listingsTable).values({
    title,
    company: resolvedCompany,
    city: String(city),
    salary: normalizedSalary,
    workType: workType ?? "Tam Zamanlı",
    description: description ?? null,
    requirements: resolvedRequirements,
    applyUrl: resolvedApplyUrl,
    companyLogoUrl: resolvedLogo,
    companyProfileId,
    cardTheme: canUseCardTheme(req.user) ? normalizeCardTheme(cardTheme) : null,
    authorId: req.user!.id,
    status: "active",
    isActive: true,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    autoDeleteOnExpiry: autoDeleteOnExpiry !== false,
    publishedAt: new Date(),
    ...listingSourceInsertFields(sourceResolved),
    ...(coords ?? {}),
  }).returning();

  if (listing) {
    void logListingSourceHistory(listing.id, sourceResolved);
    if (sourceResolved.directPriorityUntil) {
      void logListingPriority(
        listing.id,
        sourceResolved.verifiedPublisher ? "direct_verified" : "direct_user",
        new Date(),
        sourceResolved.directPriorityUntil,
        "create",
        req.user!.id,
      );
    }
    void findAndQueueSimilarBots(listing.id).catch(() => {});
  }

  // Temel bilgiler sonraki ilanda otomatik gelsin (açıklama hariç)
  try {
    const remembered = await rememberEmployerBasics(req.user!.id, {
      companyName: resolvedCompany,
      phone: resolvedApplyUrl,
      logoPath: resolvedLogo,
      contactName: resolvedContactName || null,
    });
    if (remembered && listing) {
      const patch: Partial<typeof listingsTable.$inferInsert> = {
        companyProfileId: remembered.id,
      };
      if (resolvedLogo?.startsWith("data:image/") && remembered.logoPath) {
        patch.companyLogoUrl = remembered.logoPath;
        listing.companyLogoUrl = remembered.logoPath;
      }
      await db.update(listingsTable).set(patch).where(eq(listingsTable.id, listing.id));
      listing.companyProfileId = remembered.id;
    }
  } catch (e) {
    console.warn("[listings] rememberEmployerBasics failed", e);
  }

  // İlk 3 ilan → 3 gün ücretsiz öne çıkarma
  try {
    const { applyFreeFeatureIfAvailable } = await import("../lib/listing-feature");
    await applyFreeFeatureIfAvailable(listing!.id, req.user!.id);
  } catch { /* ignore */ }

  // Gerçek kullanıcı ilanı → herkese Web Push (isimle)
  const authorName = (req.user!.displayName || req.user!.username || "").trim();
  void import("../lib/web-push").then((m) =>
    m.maybePushNewListing({
      id: listing!.id,
      title: String(title),
      city: String(city),
      authorName,
    }),
  ).catch(() => {});

  // Announce new listing in chat if enabled
  try {
    const settings = await db.select().from(adminSettingsTable).limit(1);
    if (settings[0]?.chatAnnounceListings !== false) {
      const chatContent = `${authorName} yeni ilan paylaştı: ${title} — ${resolvedCompany} (${city})${salary ? ` • ${salary}` : ""}\n/ilan/${listing!.id}`;
      const [chatMsg] = await db.insert(chatMessagesTable).values({
        content: chatContent,
        userId: 0, // bot duyurusu — kalıcı (trim son 200)
        isPinned: false,
        isDeleted: false,
      }).returning();
      const io = (req as unknown as { app: { get: (k: string) => unknown } }).app.get("io") as { emit: (e: string, d: unknown) => void } | null;
      if (io && chatMsg) {
        io.emit("chat:message", {
          id: chatMsg.id,
          content: chatContent,
          userId: 0,
          username: "GuvenlikBot",
          displayName: null,
          userAvatarUrl: null,
          userNameColor: "#06B6D4",
          userNameAnimated: false,
          userRole: "bot",
          replyToId: null,
          replyToUsername: null,
          replyToContent: null,
          isPinned: false,
          isBot: true,
          listingId: listing!.id,
          mentions: [],
          createdAt: chatMsg.createdAt.toISOString(),
        });
      }
    }
  } catch { /* don't fail the listing creation */ }

  try {
    await db.insert(notificationsTable).values({
      userId: req.user!.id,
      type: "listing_published",
      title: sourceResolved.verifiedPublisher
        ? "İlanınız Öncelikli Olarak Yayınlandı"
        : "İlanınız Yayınlandı",
      message: sourceResolved.verifiedPublisher
        ? "İlanınız başarıyla yayınlandı. Doğrulanmış hesabınız sayesinde ilanınız ilk 72 saat boyunca Doğrudan Yayınlandı ve Doğrulanmış Hesap rozetleriyle öncelikli olarak gösterilecektir."
        : "İlanınız başarıyla yayınlandı. Doğrudan paylaştığınız ilan ilk 48 saat boyunca öncelikli olarak gösterilecektir. İlanınız 7 gün sonra güncellik kontrolüne alınacaktır.",
      relatedId: listing!.id,
      linkUrl: `/ilan/${listing!.id}`,
      isRead: false,
    });
  } catch { /* don't fail the listing creation */ }

  // Tüm kullanıcılara bildirim gönder (fire-and-forget)
  setImmediate(async () => {
    try {
      const [allUsers, admins] = await Promise.all([
        db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.isBanned, false), ne(usersTable.id, req.user!.id))),
        db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "moderator"))),
      ]);
      if (allUsers.length > 0) {
        const priorityHours = sourceResolved.verifiedPublisher ? 72 : 48;
        const msg = `${authorName} yeni ilan paylaştı: ${title} — ${resolvedCompany} (${city}) · ${priorityHours}s öncelikli görünürlük`;
        const link = `/ilan/${listing!.id}`;
        await db.insert(notificationsTable).values(
          allUsers.map(u => ({
            userId: u.id,
            type: "listing",
            message: msg,
            linkUrl: link,
            isRead: false,
          }))
        );
      }
      if (admins.length > 0) {
        await db.insert(notificationsTable).values(
          admins.map(admin => ({
            userId: admin.id,
            type: "admin_listing",
            title: "Yeni kullanıcı ilanı incele",
            message: `${authorName} #${listing!.id} numaralı ilan yayınladı: ${title} — ${resolvedCompany} (${city})`,
            relatedId: listing!.id,
            linkUrl: `/ilan/${listing!.id}`,
            isRead: false,
          }))
        );
      }
    } catch { /* don't fail */ }
  });

  res.status(201).json({
    ...formatListing(
      listing!,
      req.user!.id,
      new Set(),
      new Set(),
      req.user!.username,
      companyProfileId
        ? { id: companyProfileId, companyName: resolvedCompany, logoPath: resolvedLogo, isVerified: !!sourceResolved.verifiedPublisher }
        : null,
    ),
    publishMeta: {
      sourceType: sourceResolved.sourceType,
      verifiedPublisher: sourceResolved.verifiedPublisher,
      priorityHours: sourceResolved.verifiedPublisher ? 72 : 48,
      directPriorityUntil: sourceResolved.directPriorityUntil?.toISOString() ?? null,
      message: sourceResolved.verifiedPublisher
        ? "İlanınız doğrulanmış hesap olarak 72 saat öncelikli gösterilecek. İlk sıra garantisi yoktur."
        : "İlanınız 48 saat öncelikli gösterilecek. İlk sıra garantisi yoktur.",
    },
  });
});

router.get("/listings/stats/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalResult, todayResult, featuredResult, byCityResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(and(eq(listingsTable.status, "active"), realListingFilter())),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(and(eq(listingsTable.status, "active"), realListingFilter(), sql`${listingsTable.createdAt} >= ${today}`)),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(and(eq(listingsTable.status, "active"), eq(listingsTable.isFeatured, true), realListingFilter())),
    db.select({ city: listingsTable.city, count: sql<number>`count(*)::int` }).from(listingsTable).where(and(eq(listingsTable.status, "active"), realListingFilter())).groupBy(listingsTable.city).orderBy(sql`count(*) desc`).limit(10),
  ]);

  res.json({
    total: totalResult[0]?.count ?? 0,
    today: todayResult[0]?.count ?? 0,
    featured: featuredResult[0]?.count ?? 0,
    byCity: byCityResult,
  });
});

router.get("/listings/mine", authMiddleware, async (req, res): Promise<void> => {
  const myListings = await db.select()
    .from(listingsTable)
    .where(eq(listingsTable.authorId, req.user!.id))
    .orderBy(desc(listingsTable.createdAt));
  const companyMap = await loadCompanyOverlays(myListings);
  res.json(myListings.map(l => formatListing(l, req.user!.id, new Set(), new Set(), req.user!.username, companyMap.get(l.id) ?? null)));
});

router.get("/listings/feature-quota", authMiddleware, async (req, res): Promise<void> => {
  const { getFreeFeatureRemaining, FREE_FEATURE_LIMIT, FREE_FEATURE_DAYS } = await import("../lib/listing-feature");
  const remaining = await getFreeFeatureRemaining(req.user!.id);
  res.json({ remaining, limit: FREE_FEATURE_LIMIT, freeDays: FREE_FEATURE_DAYS });
});

router.get("/listings/:id", optionalAuthMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  if (listing.sourceTag === "demo") { res.status(404).json({ error: "İlan bulunamadı" }); return; }

  const userId = req.user?.id;
  let isLikedByMe = false;
  let isFavoritedByMe = false;

  if (userId) {
    const [like, fav] = await Promise.all([
      db.select().from(listingLikesTable).where(and(eq(listingLikesTable.listingId, id), eq(listingLikesTable.userId, userId))),
      db.select().from(listingFavoritesTable).where(and(eq(listingFavoritesTable.listingId, id), eq(listingFavoritesTable.userId, userId))),
    ]);
    isLikedByMe = like.length > 0;
    isFavoritedByMe = fav.length > 0;
  }

  let authorUsername: string | null = null;
  if (listing.authorId) {
    const [author] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, listing.authorId));
    authorUsername = author?.username ?? null;
  }

  const companyMap = await loadCompanyOverlays([listing]);
  const isAdmin = req.user?.role === "admin";
  res.json({
    ...formatListing(
      listing,
      userId,
      isLikedByMe ? new Set([id]) : new Set(),
      isFavoritedByMe ? new Set([id]) : new Set(),
      authorUsername,
      companyMap.get(listing.id) ?? null,
      { includeSourceMeta: isAdmin },
    ),
  });
});

/** Kullanıcı: ilan şikâyeti — moderasyon kaydı + canlı destek + bildirim */
router.post("/listings/:id/report", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = Number(rawId);
  const reason = String((req.body as { reason?: string })?.reason ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Geçersiz ilan" }); return;
  }
  if (reason.length < 10 || reason.length > 1000) {
    res.status(400).json({ error: "Şikâyet açıklaması 10-1000 karakter olmalı" }); return;
  }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }

  const [duplicate] = await db.select({ id: moderationReportsTable.id })
    .from(moderationReportsTable)
    .where(and(
      eq(moderationReportsTable.targetType, "listing"),
      eq(moderationReportsTable.targetId, id),
      eq(moderationReportsTable.reporterUserId, req.user!.id),
      inArray(moderationReportsTable.status, ["pending", "investigating", "escalated"]),
    ))
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "Bu ilan için açık bir şikâyetiniz zaten bulunuyor" }); return;
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [report] = await tx.insert(moderationReportsTable).values({
      targetType: "listing",
      targetId: id,
      reporterUserId: req.user!.id,
      reason,
      reasonCode: "listing_complaint",
      status: "pending",
      priority: "high",
      titleSnapshot: listing.title,
      contentSnapshot: `${listing.company ?? "Firma"} · ${listing.city ?? ""}\n${listing.description ?? ""}`.slice(0, 2000),
    }).returning();

    const [ticket] = await tx.insert(supportTicketsTable).values({
      userId: req.user!.id,
      category: "Şikâyet",
      subject: `İlan şikâyeti · Rapor #${report!.id} · İlan #OG${id}`,
      status: "waiting",
      priority: "high",
      lastMessageAt: now,
    }).returning();

    const [message] = await tx.insert(supportMessagesTable).values({
      ticketId: ticket!.id,
      userId: req.user!.id,
      message: `İlan #OG${id} şikâyeti:\n${reason}`,
      messageType: "text",
      isStaff: false,
      isInternalNote: false,
    }).returning();

    await tx.insert(supportTicketEventsTable).values({
      ticketId: ticket!.id,
      actorId: req.user!.id,
      eventType: "created_from_listing_report",
      newValue: String(report!.id),
    });

    return { report: report!, ticket: ticket!, message: message! };
  });

  const staff = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.role, ["admin", "moderator", "senior_moderator"]));
  const staffTitle = "Yeni İlan Şikâyeti";
  const staffMessage = `@${req.user!.username}, #OG${id} ilanını şikâyet etti: ${reason.slice(0, 180)}`;
  if (staff.length > 0) {
    await db.insert(notificationsTable).values(staff.map((member) => ({
      userId: member.id,
      type: "listing_report",
      title: staffTitle,
      message: staffMessage,
      relatedId: result.report.id,
      linkUrl: "/admin",
      isRead: false,
    })));
    for (const member of staff) {
      emitRealtimeToUser(member.id, "notification:new", {
        type: "listing_report",
        title: staffTitle,
        message: staffMessage,
        relatedId: result.report.id,
        linkUrl: "/admin",
      });
    }
  }

  const thanksTitle = "Bildiriminiz Alındı";
  const thanksMessage = "İlanı bildirdiğiniz için teşekkür ederiz. Moderasyon ekibimiz ilanı inceleyip sonuçlandığında size bildirim gönderecektir.";
  await db.insert(notificationsTable).values({
    userId: req.user!.id,
    type: "listing_report_received",
    title: thanksTitle,
    message: thanksMessage,
    relatedId: result.report.id,
    linkUrl: "/destek",
    isRead: false,
  });
  emitRealtimeToUser(req.user!.id, "notification:new", {
    type: "listing_report_received",
    title: thanksTitle,
    message: thanksMessage,
    relatedId: result.report.id,
    linkUrl: "/destek",
  });

  const supportPayload = {
    id: result.message.id,
    ticketId: result.ticket.id,
    userId: req.user!.id,
    message: result.message.message,
    messageType: result.message.messageType,
    isStaff: false,
    isInternalNote: false,
    createdAt: result.message.createdAt.toISOString(),
    status: result.ticket.status,
  };
  emitRealtime("support:message", supportPayload);
  emitRealtime("support:ticket-update", {
    ticketId: result.ticket.id,
    status: result.ticket.status,
    lastMessageAt: now.toISOString(),
    preview: result.message.message.slice(0, 120),
    fromUserId: req.user!.id,
    isStaff: false,
  });

  res.status(201).json({
    success: true,
    reportId: result.report.id,
    ticketId: result.ticket.id,
    message: thanksMessage,
  });
});

router.patch("/listings/:id", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }

  if (listing.authorId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Bu ilanı düzenleme yetkiniz yok" });
    return;
  }

  const { title, company, city, salary, workType, description, requirements, status, applyUrl, isFeatured, cardTheme, autoDeleteOnExpiry } = req.body as Record<string, unknown>;
  const updates: Partial<typeof listingsTable.$inferInsert> = {};
  if (title != null) updates.title = String(title);
  if (company != null) updates.company = String(company);
  if (city != null) updates.city = String(city);
  if (salary !== undefined) updates.salary = salary == null ? null : String(salary);
  if (workType != null) updates.workType = String(workType);
  if (description !== undefined) updates.description = description == null ? null : String(description);
  if (requirements !== undefined) updates.requirements = requirements == null ? null : String(requirements);
  if (status != null) {
    const nextStatus = String(status);
    if (req.user!.role === "admin" || listing.authorId === req.user!.id) {
      if (["active", "inactive", "pending", "rejected", "expired"].includes(nextStatus)) {
        updates.status = nextStatus;
        updates.isActive = nextStatus === "active";
      }
    }
  }
  if (autoDeleteOnExpiry !== undefined) updates.autoDeleteOnExpiry = Boolean(autoDeleteOnExpiry);
  if (applyUrl !== undefined) updates.applyUrl = applyUrl == null ? null : String(applyUrl);
  if (isFeatured !== undefined && req.user!.role === "admin") updates.isFeatured = Boolean(isFeatured);
  if (cardTheme !== undefined) {
    if (!canUseCardTheme(req.user)) {
      res.status(403).json({ error: "Kart rengi seçimi VIP üyelere özeldir" });
      return;
    }
    updates.cardTheme = normalizeCardTheme(cardTheme);
  }

  const [updated] = await db.update(listingsTable).set(updates).where(eq(listingsTable.id, id)).returning();
  const companyMap = await loadCompanyOverlays([updated!]);
  res.json(formatListing(updated!, req.user!.id, new Set(), new Set(), req.user!.username, companyMap.get(updated!.id) ?? null));
});

router.delete("/listings/:id", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }

  if (listing.authorId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Bu ilanı silme yetkiniz yok" });
    return;
  }

  await db.delete(listingLikesTable).where(eq(listingLikesTable.listingId, id));
  await db.delete(listingFavoritesTable).where(eq(listingFavoritesTable.listingId, id));
  await db.delete(listingsTable).where(eq(listingsTable.id, id));
  res.sendStatus(204);
});

router.post("/listings/bulk-delete", authMiddleware, async (req, res): Promise<void> => {
  const { ids } = req.body as { ids?: unknown };
  const cleanIds = Array.isArray(ids)
    ? [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (cleanIds.length === 0) { res.status(400).json({ error: "Silinecek ilan seçilmedi" }); return; }

  const rows = await db.select().from(listingsTable).where(inArray(listingsTable.id, cleanIds));
  const allowed = rows.filter(
    (l) => l.authorId === req.user!.id || req.user!.role === "admin" || req.user!.role === "moderator",
  );
  const allowedIds = allowed.map((l) => l.id);
  if (allowedIds.length === 0) { res.status(403).json({ error: "Silme yetkiniz yok" }); return; }

  await db.delete(listingLikesTable).where(inArray(listingLikesTable.listingId, allowedIds));
  await db.delete(listingFavoritesTable).where(inArray(listingFavoritesTable.listingId, allowedIds));
  const deleted = await db.delete(listingsTable).where(inArray(listingsTable.id, allowedIds)).returning({ id: listingsTable.id });
  res.json({ deleted: deleted.length });
});

router.post("/listings/:id/republish", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  if (listing.authorId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Bu ilanı yeniden yayınlama yetkiniz yok" }); return;
  }
  const newExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const [updated] = await db.update(listingsTable)
    .set({ status: "active", isActive: true, expiresAt: newExpiry, publishedAt: now, updatedAt: now, freshnessConfirmedAt: now })
    .where(eq(listingsTable.id, id))
    .returning();
  const companyMap = await loadCompanyOverlays([updated!]);
  res.json(formatListing(updated!, req.user!.id, new Set(), new Set(), req.user!.username, companyMap.get(updated!.id) ?? null));
});

/** Owner: yenile (24h cooldown) */
router.post("/listings/:id/renew", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  if (listing.authorId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Bu ilanı yenileme yetkiniz yok" }); return;
  }
  if (listing.sourceType === "bot_imported") {
    res.status(400).json({ error: "Bot ilanları yenilenemez" }); return;
  }
  const now = new Date();
  if (listing.lastRenewedAt) {
    const elapsed = now.getTime() - new Date(listing.lastRenewedAt).getTime();
    if (elapsed < 24 * 60 * 60 * 1000) {
      const waitH = Math.ceil((24 * 60 * 60 * 1000 - elapsed) / 3_600_000);
      res.status(429).json({ error: `Yenileme için ${waitH} saat bekleyin`, retryAfterHours: waitH }); return;
    }
  }
  const verified = !!listing.verifiedPublisher;
  const priorityUntil = computeRenewPriorityUntil(verified, now);
  const newExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const [updated] = await db.update(listingsTable)
    .set({
      status: "active",
      isActive: true,
      lastRenewedAt: now,
      freshnessConfirmedAt: now,
      directPriorityUntil: priorityUntil,
      expiresAt: newExpiry,
      updatedAt: now,
    })
    .where(eq(listingsTable.id, id))
    .returning();
  void logListingPriority(id, verified ? "renew_verified" : "renew", now, priorityUntil, "renew", req.user!.id);
  const companyMap = await loadCompanyOverlays([updated!]);
  res.json({
    ...formatListing(updated!, req.user!.id, new Set(), new Set(), req.user!.username, companyMap.get(updated!.id) ?? null),
    renewMeta: {
      priorityHours: verified ? 24 : 12,
      directPriorityUntil: priorityUntil.toISOString(),
    },
  });
});

/** Owner: pasife al */
router.patch("/listings/:id/deactivate", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  if (listing.authorId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Bu ilanı pasife alma yetkiniz yok" }); return;
  }
  const [updated] = await db.update(listingsTable)
    .set({ isActive: false, status: "inactive", updatedAt: new Date() })
    .where(eq(listingsTable.id, id))
    .returning();
  const companyMap = await loadCompanyOverlays([updated!]);
  res.json(formatListing(updated!, req.user!.id, new Set(), new Set(), req.user!.username, companyMap.get(updated!.id) ?? null));
});

router.post("/listings/:id/like", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const userId = req.user!.id;
  const [existing] = await db.select().from(listingLikesTable).where(and(eq(listingLikesTable.listingId, id), eq(listingLikesTable.userId, userId)));

  let liked: boolean;
  if (existing) {
    await db.delete(listingLikesTable).where(and(eq(listingLikesTable.listingId, id), eq(listingLikesTable.userId, userId)));
    await db.update(listingsTable).set({ likeCount: sql`GREATEST(0, ${listingsTable.likeCount} - 1)` }).where(eq(listingsTable.id, id));
    liked = false;
  } else {
    await db.insert(listingLikesTable).values({ listingId: id, userId });
    await db.update(listingsTable).set({ likeCount: sql`${listingsTable.likeCount} + 1` }).where(eq(listingsTable.id, id));
    liked = true;
  }

  const [updated] = await db.select({ likeCount: listingsTable.likeCount }).from(listingsTable).where(eq(listingsTable.id, id));
  res.json({ liked, likeCount: updated?.likeCount ?? 0 });
});

router.post("/listings/:id/favorite", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const userId = req.user!.id;
  const [existing] = await db.select().from(listingFavoritesTable).where(and(eq(listingFavoritesTable.listingId, id), eq(listingFavoritesTable.userId, userId)));

  if (existing) {
    await db.delete(listingFavoritesTable).where(and(eq(listingFavoritesTable.listingId, id), eq(listingFavoritesTable.userId, userId)));
    res.json({ favorited: false });
  } else {
    await db.insert(listingFavoritesTable).values({ listingId: id, userId });
    res.json({ favorited: true });
  }
});

router.post("/listings/:id/view", optionalAuthMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  await db.update(listingsTable).set({ viewCount: sql`${listingsTable.viewCount} + 1` }).where(eq(listingsTable.id, id));
  res.json({ success: true });
});

router.post("/listings/:id/feature-request", authMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }
  if (listing.authorId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Bu ilan size ait değil" });
    return;
  }

  const {
    applyFreeFeatureIfAvailable,
    createFeaturePurchaseTicket,
    getFreeFeatureRemaining,
  } = await import("../lib/listing-feature");

  const remaining = await getFreeFeatureRemaining(req.user!.id);
  if (remaining > 0 && !listing.isFeatured) {
    const result = await applyFreeFeatureIfAvailable(id, req.user!.id);
    res.json({
      success: true,
      mode: "free",
      message: `Ücretsiz öne çıkarma aktif — ${result.featuredUntil ? new Date(result.featuredUntil).toLocaleString("tr-TR") : "3 gün"}`,
      remaining: result.remaining,
      featuredUntil: result.featuredUntil?.toISOString() ?? null,
    });
    return;
  }

  if (listing.isFeatured) {
    res.json({ success: true, mode: "already", message: "İlan zaten öne çıkarılmış." });
    return;
  }

  const ticket = await createFeaturePurchaseTicket({
    userId: req.user!.id,
    username: req.user!.username,
    listingId: id,
    listingTitle: listing.title,
  });

  res.json({
    success: true,
    mode: "support",
    ticketId: ticket.ticketId,
    message: "Öne çıkarma satın alma talebiniz destek üzerinden admin'e iletildi. Destek sayfasından görüşmeyi sürdürebilirsiniz.",
  });
});

// Admin: approve listing
router.post("/admin/listings/:id/approve", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  await db.update(listingsTable).set({ status: "active" }).where(eq(listingsTable.id, id));
  res.json({ success: true, message: "İlan onaylandı" });
});

// Admin: feature listing
router.post("/admin/listings/:id/feature", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select({ isFeatured: listingsTable.isFeatured }).from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }

  await db.update(listingsTable).set({ isFeatured: !listing.isFeatured }).where(eq(listingsTable.id, id));
  res.json({ success: true, message: listing.isFeatured ? "Öne çıkarma kaldırıldı" : "İlan öne çıkarıldı" });
});

// Admin: fake likes
router.post("/admin/listings/:id/fake-likes", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const count = parseInt(String((req.body as Record<string, unknown>)["count"] ?? "10"), 10);
  await db.update(listingsTable).set({ likeCount: sql`${listingsTable.likeCount} + ${count}` }).where(eq(listingsTable.id, id));
  res.json({ success: true, message: `${count} sahte beğeni eklendi` });
});

export default router;
