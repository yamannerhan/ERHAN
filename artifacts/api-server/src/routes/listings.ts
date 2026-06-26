import { Router } from "express";
import { db, listingsTable, listingLikesTable, listingFavoritesTable, usersTable, adminSettingsTable, chatMessagesTable, notificationsTable, locationFilterTermsTable } from "@workspace/db";
import { eq, desc, and, sql, ilike, inArray, or } from "drizzle-orm";
import { authMiddleware, optionalAuthMiddleware, requireAdmin } from "../middlewares/auth";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { buildListingRequirements, createSmartListingImage, extractBenefits, extractCompany, extractGender, extractLocation, extractSalary, extractTitle, extractWorkType } from "../lib/job-parsing";

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
  "köseköy", "kosekoy", "bahçecik", "bahcecik", "yahyakaptan", "alikahya", "kuruçeşme", "kurucesme", "bekirdere", "karabaş", "karabas", "veliahmet",
  "plajyolu", "esentepe", "tatlıkuyu", "tatlikuyu", "mustafapaşa", "mustafapasa", "osmangazi", "mimar sinan", "şekerpınar", "sekerpinar", "gosb",
  "gebze osb", "gebze organize sanayi bölgesi", "tosb", "imes", "imes osb", "gebkim", "gebkim osb", "taysad", "güzeller", "guzeller", "dilovası osb",
  "dilovasi osb", "kimya osb", "plastikçiler osb", "plastikciler osb", "makine ihtisas osb", "asım kibar osb", "asim kibar osb", "kobi osb",
  "demirciler osb", "kömürcüler osb", "komurculer osb", "kartepe karma osb", "başiskele osb", "basiskele osb", "pelitli", "balçık", "balcik",
  "tepecik", "muallimköy", "muallimkoy", "köseler", "koseler", "cumhuriyet mahallesi", "derince liman", "evyapport", "safiport", "ford otosan",
  "hyundai assan", "assa abloy", "pirelli", "brisa", "gölcük tersane", "golcuk tersane", "ford yeniköy", "ford yenikoy",
].forEach(term => { DISTRICT_PROVINCES[term] = "Kocaeli"; });

function parseHiddenListingCities(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

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
  return or(...variants.flatMap(variant => [
    ilike(listingsTable.city, `%${variant}%`),
    ilike(listingsTable.title, `%${variant}%`),
    ilike(listingsTable.description, `%${variant}%`),
    sql`${normalizedColumn(listingsTable.city)} like ${`%${normalizeCityText(variant)}%`}`,
    sql`${normalizedColumn(listingsTable.title)} like ${`%${normalizeCityText(variant)}%`}`,
    sql`${normalizedColumn(listingsTable.description)} like ${`%${normalizeCityText(variant)}%`}`,
    sql`replace(${normalizedColumn(listingsTable.city)}, ' ', '') like ${`%${normalizeCityText(variant).replace(/\s+/g, "")}%`}`,
    sql`replace(${normalizedColumn(listingsTable.title)}, ' ', '') like ${`%${normalizeCityText(variant).replace(/\s+/g, "")}%`}`,
    sql`replace(${normalizedColumn(listingsTable.description)}, ' ', '') like ${`%${normalizeCityText(variant).replace(/\s+/g, "")}%`}`,
  ]));
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
  const province = extractProvinceName(city) ?? city;
  const customTerms = await getLocationTermsForProvince(province);
  const patterns = [province, ...Object.entries(DISTRICT_PROVINCES).filter(([, p]) => p === province).map(([d]) => d), ...customTerms];
  return or(...patterns.map(locationTermCondition));
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

function formatListing(listing: typeof listingsTable.$inferSelect, userId?: number, likedIds?: Set<number>, favIds?: Set<number>, authorUsername?: string | null) {
  const isAuth = userId != null;
  const rawDesc = listing.description;
  const rawApplyUrl = listing.applyUrl;

  // Mask sensitive info for unauthenticated users
  const description = rawDesc ? (isAuth ? rawDesc : maskContactInfo(rawDesc)) : null;
  const applyUrl = rawApplyUrl
    ? (isAuth ? rawApplyUrl : (rawApplyUrl.startsWith("tel:") || rawApplyUrl.startsWith("http") ? "auth_required" : rawApplyUrl))
    : null;

  // Reset regex state after use
  PHONE_MASK_RE.lastIndex = 0;
  NAME_AFTER_LABEL_RE.lastIndex = 0;

  const companyLogoUrl = listing.companyLogoUrl || pickAutoImage(listing.title, listing.description);

  return {
    id: listing.id,
    title: listing.title,
    company: listing.company || "Belirtilmedi",
    city: listing.city,
    salary: listing.salary,
    workType: listing.workType,
    description,
    requirements: listing.requirements,
    status: listing.status,
    viewCount: listing.viewCount,
    likeCount: listing.likeCount,
    isFeatured: listing.isFeatured,
    cardTheme: listing.cardTheme,
    applyUrl,
    contactInfoMasked: !isAuth && hasSensitiveInfo(rawDesc, rawApplyUrl),
    companyLogoUrl,
    authorId: listing.authorId,
    authorUsername: authorUsername ?? null,
    isLikedByMe: userId != null && likedIds != null ? likedIds.has(listing.id) : false,
    isFavoritedByMe: userId != null && favIds != null ? favIds.has(listing.id) : false,
    expiresAt: listing.expiresAt ? listing.expiresAt.toISOString() : null,
    createdAt: listing.createdAt.toISOString(),
  };
}

router.get("/listings", optionalAuthMiddleware, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "10"), 10)));
  const offset = (page - 1) * limit;
  const city = req.query["city"] as string | undefined;
  const search = req.query["search"] as string | undefined;
  const featured = req.query["featured"] === "true";

  const conditions = [];
  if (featured) conditions.push(eq(listingsTable.isFeatured, true));
  if (city) {
    const condition = await cityFilterCondition(city);
    if (condition) conditions.push(condition);
  }
  if (search) conditions.push(ilike(listingsTable.title, `%${search}%`));
  conditions.push(eq(listingsTable.status, "active"));

  const settings = await db.select({ hiddenListingCities: adminSettingsTable.hiddenListingCities }).from(adminSettingsTable).limit(1);
  const hiddenCities = parseHiddenListingCities(settings[0]?.hiddenListingCities);
  for (const hiddenCity of hiddenCities) {
    const province = extractProvinceName(hiddenCity) ?? hiddenCity;
    const customTerms = await getLocationTermsForProvince(province);
    const patterns = [province, ...Object.entries(DISTRICT_PROVINCES).filter(([, p]) => p === province).map(([d]) => d), ...customTerms];
    conditions.push(sql`not (${or(...patterns.map(locationTermCondition))})`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [listings, countResult] = await Promise.all([
    db.select().from(listingsTable).where(whereClause).orderBy(desc(listingsTable.isFeatured), desc(listingsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  const userId = req.user?.id;

  let likedIds = new Set<number>();
  let favIds = new Set<number>();

  if (userId) {
    const [likes, favs] = await Promise.all([
      db.select({ listingId: listingLikesTable.listingId }).from(listingLikesTable).where(eq(listingLikesTable.userId, userId)),
      db.select({ listingId: listingFavoritesTable.listingId }).from(listingFavoritesTable).where(eq(listingFavoritesTable.userId, userId)),
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

  res.json({
    listings: listings.map(l => formatListing(l, userId, likedIds, favIds, l.authorId ? authorMap.get(l.authorId) : null)),
    total,
    page,
    limit,
  });
});

router.get("/listings/cities", async (_req, res): Promise<void> => {
  const settings = await db.select({ hiddenListingCities: adminSettingsTable.hiddenListingCities }).from(adminSettingsTable).limit(1);
  const hiddenCities = new Set(parseHiddenListingCities(settings[0]?.hiddenListingCities).map(normalizeCityText));
  const rows = await db
    .select({ city: listingsTable.city, count: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(eq(listingsTable.status, "active"))
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
  const filename = `listing_${req.user!.id}_${Date.now()}.jpg`;
  const filepath = path.join(LISTING_IMAGES_DIR, filename);
  await sharp(req.file.buffer)
    .resize(800, 450, { fit: "cover", position: "center" })
    .jpeg({ quality: 85 })
    .toFile(filepath);
  const url = `/api/listing-images/${filename}`;
  res.json({ url });
});

router.post("/listings/parse", authMiddleware, async (req, res): Promise<void> => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) { res.status(400).json({ error: "Metin zorunludur" }); return; }
  const location = extractLocation(text);
  const gender = extractGender(text);
  const benefits = extractBenefits(text);
  const title = extractTitle(text);
  const salary = extractSalary(text);
  const phone = text.match(/(?:0|\+90)?5[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}[\s\-]?\d{2}/)?.[0]?.replace(/[\s\-]/g, "") ?? "";
  res.json({
    title,
    company: extractCompany(text, "Belirtilmedi"),
    city: location.city ?? "Türkiye",
    district: location.district ?? location.neighborhood ?? "",
    workType: extractWorkType(text),
    salary: salary ?? "",
    benefits: benefits.join(", "),
    gender: gender ?? "",
    description: text.trim(),
    contactPhone: phone,
    contactName: "",
    applyUrl: phone ? `tel:${phone.startsWith("0") ? phone : `0${phone.replace(/^\+90/, "")}`}` : "",
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
  const { title, company, city, salary, workType, description, requirements, applyUrl, companyLogoUrl, cardTheme } = req.body as Record<string, string | undefined>;

  if (!title || !company || !city) {
    res.status(400).json({ error: "Başlık, firma ve şehir zorunludur" });
    return;
  }

  // Aynı başlıklı ilan son 7 gün içinde yayınlanmış mı?
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [dup] = await db.select({ id: listingsTable.id, company: listingsTable.company })
    .from(listingsTable)
    .where(and(
      ilike(listingsTable.title, title.trim()),
      eq(listingsTable.status, "active"),
      sql`${listingsTable.createdAt} > ${sevenDaysAgo}`,
    ))
    .limit(1);
  if (dup) {
    res.status(409).json({ error: `"${title.trim()}" başlıklı bir ilan son 7 gün içinde zaten yayınlandı. Aynı başlıklı ilan 7 gün geçmeden tekrar eklenemez.` });
    return;
  }

  const [listing] = await db.insert(listingsTable).values({
    title,
    company,
    city,
    salary: salary ?? null,
    workType: workType ?? "Tam Zamanlı",
    description: description ?? null,
    requirements: requirements ?? null,
    applyUrl: applyUrl ?? null,
    companyLogoUrl: companyLogoUrl ?? null,
    cardTheme: canUseCardTheme(req.user) ? normalizeCardTheme(cardTheme) : null,
    authorId: req.user!.id,
    status: "active",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }).returning();

  // Announce new listing in chat if enabled
  try {
    const settings = await db.select().from(adminSettingsTable).limit(1);
    if (settings[0]?.chatAnnounceListings !== false) {
      const chatContent = `Yeni ilan: ${title} — ${company} (${city})${salary ? ` • ${salary}` : ""}`;
      const [chatMsg] = await db.insert(chatMessagesTable).values({
        content: chatContent,
        userId: 0, // bot user
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

  // Tüm kullanıcılara bildirim gönder (fire-and-forget)
  setImmediate(async () => {
    try {
      const [allUsers, admins] = await Promise.all([
        db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.isBanned, false)),
        db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "moderator"))),
      ]);
      if (allUsers.length > 0) {
        const msg = `Yeni ilan: ${title} — ${company} (${city})`;
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
            message: `#${listing!.id} numaralı ilan yayınlandı: ${title} — ${company} (${city})`,
            relatedId: listing!.id,
            linkUrl: `/ilan/${listing!.id}`,
            isRead: false,
          }))
        );
      }
    } catch { /* don't fail */ }
  });

  res.status(201).json(formatListing(listing, req.user!.id, new Set(), new Set(), req.user!.username));
});

router.get("/listings/stats/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalResult, todayResult, featuredResult, byCityResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(eq(listingsTable.status, "active")),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(and(eq(listingsTable.status, "active"), sql`${listingsTable.createdAt} >= ${today}`)),
    db.select({ count: sql<number>`count(*)::int` }).from(listingsTable).where(and(eq(listingsTable.status, "active"), eq(listingsTable.isFeatured, true))),
    db.select({ city: listingsTable.city, count: sql<number>`count(*)::int` }).from(listingsTable).where(eq(listingsTable.status, "active")).groupBy(listingsTable.city).orderBy(sql`count(*) desc`).limit(10),
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
  res.json(myListings.map(l => formatListing(l, req.user!.id, new Set(), new Set(), req.user!.username)));
});

router.get("/listings/:id", optionalAuthMiddleware, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "İlan bulunamadı" }); return; }

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

  res.json({ ...formatListing(listing, userId, isLikedByMe ? new Set([id]) : new Set(), isFavoritedByMe ? new Set([id]) : new Set(), authorUsername) });
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

  const { title, company, city, salary, workType, description, requirements, status, applyUrl, isFeatured, cardTheme } = req.body as Record<string, unknown>;
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
      if (["active", "inactive", "pending", "rejected"].includes(nextStatus)) updates.status = nextStatus;
    }
  }
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
  res.json(formatListing(updated, req.user!.id, new Set(), new Set(), req.user!.username));
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

  await db.delete(listingsTable).where(eq(listingsTable.id, id));
  res.sendStatus(204);
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
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [updated] = await db.update(listingsTable)
    .set({ status: "active", expiresAt: newExpiry, createdAt: new Date() })
    .where(eq(listingsTable.id, id))
    .returning();
  res.json(formatListing(updated!, req.user!.id, new Set(), new Set(), req.user!.username));
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
