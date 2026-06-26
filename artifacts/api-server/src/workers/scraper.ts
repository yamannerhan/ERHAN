import crypto from "crypto";
import { db, sourcesTable, importedPostsTable, pendingJobsTable, listingsTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getUpdates, isBotTokenSet, isClientConnected, fetchChannelMessages } from "../services/telegram-client";
import type { BotUpdate, ChannelMessage } from "../services/telegram-client";
import { extractSalary, extractGender } from "../lib/job-parsing";

// ── Keyword lists ──────────────────────────────────────────────────
const JOB_KEYWORDS = [
  "özel güvenlik", "güvenlik görevlisi", "silahlı", "silahsız",
  "personel aranıyor", "eleman aranıyor", "vardiya", "maaş",
  "yol ", "yemek", "sgk", "başvuru", "iletişim", "telefon", "şehir", "firma",
];
const CHAT_SKIP_KEYWORDS = [
  "selam", "merhaba", "nasılsın", "iş var mı", "iş arıyorum",
  "özelden yaz", "teşekkür", "tamam", "günaydın", "iyi akşam",
  "kolay gelsin", "iyi günler",
];
const TR_CITIES = [
  "istanbul", "ankara", "izmir", "bursa", "antalya", "adana", "konya",
  "gaziantep", "kocaeli", "mersin", "diyarbakır", "hatay", "manisa",
  "kayseri", "samsun", "tekirdağ", "balıkesir", "sakarya", "denizli",
  "trabzon", "malatya", "eskişehir", "erzurum", "rize", "ordu",
  "zonguldak", "van", "şanlıurfa", "afyon", "aydın", "muğla",
];
const CITY_DISPLAY: Record<string, string> = {
  istanbul: "İstanbul", ankara: "Ankara", izmir: "İzmir",
  bursa: "Bursa", antalya: "Antalya", adana: "Adana", konya: "Konya",
  gaziantep: "Gaziantep", kocaeli: "Kocaeli", mersin: "Mersin",
  diyarbakır: "Diyarbakır", hatay: "Hatay", manisa: "Manisa",
  kayseri: "Kayseri", samsun: "Samsun", tekirdağ: "Tekirdağ",
  balıkesir: "Balıkesir", sakarya: "Sakarya", denizli: "Denizli",
  trabzon: "Trabzon", malatya: "Malatya", eskişehir: "Eskişehir",
  erzurum: "Erzurum", rize: "Rize", ordu: "Ordu", zonguldak: "Zonguldak",
  van: "Van", şanlıurfa: "Şanlıurfa", afyon: "Afyon", aydın: "Aydın", muğla: "Muğla",
};

// ── Text utils ─────────────────────────────────────────────────────
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPhone(text: string): string | null {
  // Match Turkish mobile numbers with or without separators, with or without leading 0/+90
  const m = text.match(/(?:\+90|0)[\s\-.]?5\d{2}[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}|(?<!\d)5\d{9}(?!\d)/);
  if (!m) return null;
  const digits = m[0].replace(/[\s\-.\(\)]/g, "");
  // Normalize to 05XXXXXXXXX format
  return digits.startsWith("+90") ? "0" + digits.slice(3) : digits.startsWith("0") ? digits : "0" + digits;
}

function extractContactName(text: string): string | null {
  // Turkish title-case converter
  const toTR = (s: string) => s.toLocaleLowerCase("tr-TR")
    .replace(/(^|\s)([a-zçğışöüi])/g, (_, sp: string, c: string) => sp + c.toLocaleUpperCase("tr-TR"));

  // Always match against Turkish-lowercased text to handle İ/ı/Ş/ş correctly
  const textTR = text.toLocaleLowerCase("tr-TR");
  const W = "[a-zçğışöüİA-ZÇĞİÖŞÜ]"; // word chars
  const patterns = [
    // "iletişim onur bey : 05..." or "iletişim: ahmet yılmaz"
    new RegExp(`(?:ileti[şs]im|irtibat|yetkili|sorumlu)\\s*[:\\-.\\s]?\\s*(${W}{2,20}\\s+${W}{2,20})`),
    // "onur bey" / "fatma hanım"
    new RegExp(`(${W}{2,20}\\s+${W}{2,20})\\s+(?:bey|hanım|bay|bayan)`),
    // Name right before phone number
    new RegExp(`(${W}{3,20}\\s+${W}{3,20})\\s*[:\\-]?\\s*(?:0|\\+90)5`),
  ];
  const BAD = ["güvenlik","security","personel","eleman","firma","şirket","proje","plaza","otel","avm","iletişim","irtibat","başvuru","arıyoruz","aranıyor","alımı","bilgi","çalışma","maaş","vardiya","sgk"];
  for (const pat of patterns) {
    const m = textTR.match(pat);
    if (m?.[1]) {
      const lower = m[1].trim();
      const parts = lower.split(/\s+/);
      if (parts.length < 2 || parts.length > 3) continue;
      if (BAD.some(b => lower.includes(b))) continue;
      if (/\d/.test(lower)) continue;
      return toTR(lower);
    }
  }
  return null;
}

function extractCity(text: string): string | null {
  const lower = normalizeText(text);
  const found = TR_CITIES.find(c => lower.includes(c));
  return found ? (CITY_DISPLAY[found] ?? found) : null;
}

function extractTitle(text: string): string {
  const lower = normalizeText(text);
  // Try to extract location for richer title
  const city = extractCity(text);

  const TITLE_MAP: [string, string][] = [
    ["silahlı güvenlik görevlisi", "Silahlı Güvenlik Görevlisi"],
    ["silahsız güvenlik görevlisi", "Silahsız Güvenlik Görevlisi"],
    ["özel güvenlik görevlisi", "Özel Güvenlik Görevlisi"],
    ["özel güvenlik personeli", "Özel Güvenlik Personeli"],
    ["güvenlik amiri", "Güvenlik Amiri"],
    ["güvenlik şefi", "Güvenlik Şefi"],
    ["güvenlik müdürü", "Güvenlik Müdürü"],
    ["güvenlik personeli", "Güvenlik Personeli"],
    ["güvenlik görevlisi", "Güvenlik Görevlisi"],
    ["özel güvenlik", "Özel Güvenlik Personeli"],
    ["silahlı", "Silahlı Güvenlik Görevlisi"],
    ["silahsız", "Silahsız Güvenlik Görevlisi"],
  ];
  for (const [kw, label] of TITLE_MAP) {
    if (lower.includes(kw)) {
      return city ? `${label} — ${city}` : `${label} Aranıyor`;
    }
  }
  return city ? `Güvenlik Personeli — ${city}` : "Güvenlik Personeli Aranıyor";
}

function createDuplicateHash(text: string): string {
  const phone = extractPhone(text);
  const city = extractCity(text) ?? "";
  // Telefon varsa onu birincil imza yap: aynı iletişim numarası farklı gruplarda
  // paylaşılsa bile (mesaj başlık/altlık farklı olsa da) tek ilan sayılır.
  if (phone) {
    return crypto.createHash("sha256").update(`tel:${phone}|${city}`).digest("hex");
  }
  // Telefon yoksa metnin gövdesine düş
  const normalized = normalizeText(text).slice(0, 250);
  return crypto.createHash("sha256").update(`${city}|${normalized}`).digest("hex");
}

// Aynı telefon + şehre sahip yayında (aktif) bir ilan var mı?
async function findActiveListingByPhone(phone: string, city: string): Promise<number | null> {
  const rows = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.applyUrl, `tel:${phone}`),
      eq(listingsTable.city, city),
      eq(listingsTable.status, "active"),
    ))
    .limit(1);
  return rows[0]?.id ?? null;
}

function shouldAutoPublish(source: typeof sourcesTable.$inferSelect): boolean {
  if (source.platform === "telegram") return true;
  return source.autoPublish || !source.requireApproval;
}

// İlk tarama: son 30 gün. Sonraki taramalar: lastTelegramMessageId sonrası.
const envInitialDays = Number(process.env["SCRAPER_INITIAL_DAYS"]);
const INITIAL_SCAN_DAYS = Number.isFinite(envInitialDays) && envInitialDays > 0 ? envInitialDays : 30;
const INITIAL_SCAN_MS = INITIAL_SCAN_DAYS * 24 * 60 * 60 * 1000;
const TELEGRAM_SCAN_INTERVAL_MS = 60_000; // 1 dakika

function isJobPosting(text: string): boolean {
  if (text.length < 30) return false;
  const lower = normalizeText(text);
  const count = JOB_KEYWORDS.filter(kw => lower.includes(kw)).length;
  return count >= 3;
}

function isChatMessage(text: string): boolean {
  if (text.length > 300) return false;
  const lower = normalizeText(text);
  return CHAT_SKIP_KEYWORDS.some(kw => lower.includes(kw));
}

function extractTelegramUsername(url: string): string | null {
  const m = url.match(/t\.me\/(?:s\/)?([^/?+\s]+)/);
  if (!m) return null;
  const name = m[1];
  return name.startsWith("+") ? null : name.toLowerCase();
}

// ── Telegram web scraping (no bot token needed) ────────────────────
interface ScrapedMessage { id: string; text: string; url: string; postedAt?: Date }

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  ).trim();
}

async function scrapeTelegramChannel(username: string): Promise<ScrapedMessage[]> {
  const url = `https://t.me/s/${username}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      if (res.status === 404) throw new Error("Kanal bulunamadı. Kullanıcı adını kontrol edin.");
      throw new Error(`HTTP ${res.status} — kanala erişilemiyor`);
    }

    // Detect redirect: t.me/s/username → t.me/username (web preview disabled)
    const finalUrl = res.url ?? "";
    const webPreviewDisabled = !finalUrl.includes("/s/");

    const html = await res.text();

    if (webPreviewDisabled || !html.includes("data-post")) {
      // Check if channel exists at all
      const hasChannel = html.includes("tgme_page_title") || html.includes("tgme_page");
      if (!hasChannel) {
        throw new Error("Kanal bulunamadı. Kullanıcı adını kontrol edin.");
      }
      // Extract member count for better error
      const membersMatch = html.match(/>([\d,. ]+)\s*(?:üye|member|subscriber|abone)/i);
      const memberInfo = membersMatch ? ` (${membersMatch[1].trim()} üye)` : "";
      throw new Error(
        `Bu kanalda web önizleme kapalı${memberInfo}. ` +
        `Kanal yöneticisi Telegram'da şu adımları izlemeli: ` +
        `Kanal Ayarları → Kanal Türü → "Önizlemeyi Etkinleştir" (Preview Channel) seçeneğini açsın.`
      );
    }

    const messages: ScrapedMessage[] = [];

    // Split HTML into per-message sections on data-post boundaries
    const sections = html.split(/(?=<div[^>]+data-post=")/);

    for (const section of sections) {
      const postMatch = section.match(/data-post="([^"/]+)\/(\d+)"/);
      if (!postMatch) continue;

      const postPath = postMatch[1] ?? "";
      const msgId = postMatch[2] ?? "";

      // Locate the message text div by its unique class
      const markerIdx = section.indexOf("js-message_text");
      if (markerIdx === -1) continue;

      // Find the opening tag's closing ">"
      const openEnd = section.indexOf(">", markerIdx);
      if (openEnd === -1) continue;

      // Find the closing </div> — inline elements (<b>,<a>,<br>) don't nest divs
      const closeDiv = section.indexOf("</div>", openEnd);
      const rawHtml = closeDiv === -1
        ? section.slice(openEnd + 1, openEnd + 2000)
        : section.slice(openEnd + 1, closeDiv);

      // Gönderim tarihini <time datetime="..."> öğesinden al
      const timeMatch = section.match(/<time[^>]+datetime="([^"]+)"/);
      const parsed = timeMatch?.[1] ? new Date(timeMatch[1]) : null;
      const postedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;

      const text = stripHtmlTags(rawHtml).trim();
      if (text.length > 0) {
        messages.push({
          id: msgId,
          text,
          url: `https://t.me/${postPath}/${msgId}`,
          postedAt,
        });
      }
    }

    return messages;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Pass through already-formatted errors
    if (msg.includes("kapalı") || msg.includes("bulunamadı") || msg.includes("erişilemiyor")) {
      throw new Error(msg);
    }
    throw new Error(`Kanal verisi alınamadı: ${msg}`);
  }
}

// ── Core processing ────────────────────────────────────────────────
type ProcessResult = { published: boolean };

async function processMessage(
  source: typeof sourcesTable.$inferSelect,
  externalId: string,
  text: string,
  sourceUrl: string,
  postedAt?: Date,
  isInitialScan = false,
): Promise<ProcessResult> {
  if (!text?.trim() || isChatMessage(text)) return { published: false };
  if (!isJobPosting(text)) return { published: false };

  if (isInitialScan && postedAt && Date.now() - postedAt.getTime() > INITIAL_SCAN_MS) {
    return { published: false };
  }

  const [seenExt] = await db.select({ id: importedPostsTable.id })
    .from(importedPostsTable)
    .where(and(
      eq(importedPostsTable.sourceId, source.id),
      eq(importedPostsTable.externalId, externalId),
    ))
    .limit(1);
  if (seenExt) return { published: false };

  const hash = createDuplicateHash(text);

  const [imported] = await db.insert(importedPostsTable).values({
    sourceId: source.id,
    platform: source.platform,
    externalId,
    rawText: text,
    sourceUrl,
    duplicateHash: hash,
    isJob: true,
    status: "pending",
  }).returning();

  if (!imported) return { published: false };

  const title = extractTitle(text);
  const city = extractCity(text) ?? "Türkiye";
  const salary = extractSalary(text);
  const phone = extractPhone(text);
  const gender = extractGender(text);

  if (!shouldAutoPublish(source)) {
    await db.insert(pendingJobsTable).values({
      sourceId: source.id,
      importedPostId: imported.id,
      rawText: text,
      title,
      company: null,
      city,
      salary,
      phone,
      description: text,
      applicationUrl: null,
      sourceUrl,
      platform: source.platform,
      status: "pending",
      duplicateHash: hash,
      ...(postedAt ? { createdAt: postedAt } : {}),
    });
    return { published: false };
  }

  const existingListingId = phone ? await findActiveListingByPhone(phone, city) : null;
  if (existingListingId) {
    await db.update(listingsTable).set({
      title: title ?? "Güvenlik Personeli Aranıyor",
      salary: salary ?? undefined,
      description: text,
      requirements: `Cinsiyet: ${gender ?? "Belirtilmemiş"}`,
      status: "active",
      isActive: true,
      updatedAt: new Date(),
      ...(postedAt ? { createdAt: postedAt } : {}),
    }).where(eq(listingsTable.id, existingListingId));
    await db.update(importedPostsTable)
      .set({ status: "approved" })
      .where(eq(importedPostsTable.id, imported.id));
    return { published: true };
  }

  await db.insert(listingsTable).values({
    title: title ?? "Güvenlik Personeli Aranıyor",
    company: "Belirtilmemiş",
    city,
    salary: salary ?? undefined,
    workType: "Tam Zamanlı",
    description: text,
    requirements: `Cinsiyet: ${gender ?? "Belirtilmemiş"}`,
    status: "active",
    isActive: true,
    sourceTag: source.platform,
    applyUrl: phone ? `tel:${phone}` : sourceUrl,
    ...(postedAt ? { createdAt: postedAt } : {}),
  });
  await db.update(importedPostsTable)
    .set({ status: "approved" })
    .where(eq(importedPostsTable.id, imported.id));
  return { published: true };
}

// ── Bot API polling state ──────────────────────────────────────────
let botUpdateOffset = 0;

async function processBotUpdates(): Promise<void> {
  if (!isBotTokenSet()) return;

  const updates = await getUpdates(botUpdateOffset);
  if (updates.length === 0) return;

  // Load active telegram sources once
  const sources = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.active, true));
  const telegramSources = sources.filter(s => s.platform === "telegram");

  for (const update of updates) {
    const post = update.channel_post ?? update.message;
    if (!post?.text || post.text.length < 30) {
      botUpdateOffset = update.update_id + 1;
      continue;
    }

    const chatUsername = post.chat.username?.toLowerCase();
    const chatId = String(post.chat.id);

    // Match to a registered source by username or saved chatId
    const source = telegramSources.find(s => {
      const srcUsername = extractTelegramUsername(s.url);
      return (chatUsername && srcUsername === chatUsername) ||
             (s.telegramChatId && s.telegramChatId === chatId);
    });

    if (source) {
      // Save chatId for future matching if not stored
      if (!source.telegramChatId) {
        await db.update(sourcesTable)
          .set({ telegramChatId: chatId })
          .where(eq(sourcesTable.id, source.id));
        source.telegramChatId = chatId;
      }
      const msgUrl = chatUsername
        ? `https://t.me/${chatUsername}/${post.message_id}`
        : `https://t.me/c/${chatId.replace("-100", "")}/${post.message_id}`;
      const postedAt = typeof post.date === "number" ? new Date(post.date * 1000) : undefined;
      try {
        await processMessage(source, `bot_${chatId}_${post.message_id}`, post.text, msgUrl, postedAt, false);
      } catch (e) {
        logger.error(e, `scraper: bot update processing error`);
      }
    }

    botUpdateOffset = update.update_id + 1;
  }
}

// ── Web fallback (önizleme açık kanallar) ─────────────────────────
async function scrapeTelegramChannelFiltered(
  username: string,
  minMessageId: number,
  maxAgeDays: number,
): Promise<ChannelMessage[]> {
  const all = await scrapeTelegramChannel(username);
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return all.filter(m => {
    const id = parseInt(m.id, 10);
    if (!Number.isFinite(id)) return false;
    if (minMessageId > 0) return id > minMessageId;
    if (m.postedAt && m.postedAt.getTime() < cutoff) return false;
    return true;
  });
}

// ── Tek Telegram kaynağını tara ────────────────────────────────────
async function checkTelegramSource(source: typeof sourcesTable.$inferSelect): Promise<void> {
  const username = extractTelegramUsername(source.url);
  if (!username) {
    await db.update(sourcesTable)
      .set({ lastError: "Geçersiz Telegram kanal linki. Örnek: https://t.me/kanal_adi" })
      .where(eq(sourcesTable.id, source.id));
    return;
  }

  const lastId = parseInt(source.lastTelegramMessageId ?? "0", 10) || 0;
  const isInitialScan = !source.initialScanDone;

  logger.info(`scraper: @${username} ${isInitialScan ? `ilk tarama (${INITIAL_SCAN_DAYS}g)` : `devam (id>${lastId})`} gramjs=${isClientConnected()}`);

  let messages: ChannelMessage[] = [];
  try {
    if (isClientConnected()) {
      messages = await fetchChannelMessages(username, {
        minMessageId: isInitialScan ? 0 : lastId,
        maxAgeDays: isInitialScan ? INITIAL_SCAN_DAYS : undefined,
      });
    }
    if (!messages.length) {
      messages = await scrapeTelegramChannelFiltered(username, isInitialScan ? 0 : lastId, INITIAL_SCAN_DAYS);
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (isClientConnected() && !errMsg.includes("kapalı") && !errMsg.includes("bulunamadı")) {
      try {
        messages = await scrapeTelegramChannelFiltered(username, isInitialScan ? 0 : lastId, INITIAL_SCAN_DAYS);
      } catch (webErr) {
        throw webErr;
      }
    } else {
      throw e;
    }
  }

  let published = 0;
  let maxId = lastId;

  for (const msg of messages) {
    const msgId = parseInt(msg.id, 10);
    if (!Number.isFinite(msgId)) continue;
    if (!isInitialScan && msgId <= lastId) continue;
    try {
      const result = await processMessage(
        source,
        `${username}_${msg.id}`,
        msg.text,
        msg.url,
        msg.postedAt,
        isInitialScan,
      );
      if (result.published) published++;
      if (msgId > maxId) maxId = msgId;
    } catch (e) {
      logger.error(e, `scraper: msg ${msg.id} @${username}`);
    }
  }

  await db.update(sourcesTable)
    .set({
      lastCheckedAt: new Date(),
      lastTelegramMessageId: maxId > lastId ? String(maxId) : source.lastTelegramMessageId,
      initialScanDone: true,
      lastScanPublished: published,
      totalImported: (source.totalImported ?? 0) + published,
      lastError: messages.length === 0 && isInitialScan
        ? (isClientConnected() ? null : "Telegram hesabı bağlı değil — özel kanallar için admin panelden bağlayın.")
        : null,
    })
    .where(eq(sourcesTable.id, source.id));

  logger.info(`scraper: @${username} — ${messages.length} mesaj, ${published} yayınlandı, sonId=${maxId}`);
}

// ── Main scraper loop ──────────────────────────────────────────────
// Aynı anda iki tarama döngüsü çalışmasın (interval + manuel tetikleme yarışını önler).
let cycleRunning = false;

async function runScraperCycle(force = false): Promise<void> {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    await runScraperCycleInner(force);
  } finally {
    cycleRunning = false;
  }
}

async function runScraperCycleInner(force = false): Promise<void> {
  // 1) Pull all updates the bot received across all its chats
  await processBotUpdates();

  // 2) For sources that have web preview enabled, also scrape periodically
  const sources = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.active, true));

  const now = new Date();

  for (const source of sources) {
    const intervalMin = source.platform === "telegram"
      ? Math.max(1, source.checkInterval ?? 1)
      : (source.checkInterval ?? 15);
    const intervalMs = intervalMin * 60 * 1000;
    const lastChecked = source.lastCheckedAt?.getTime() ?? 0;
    if (!force && now.getTime() - lastChecked < intervalMs) continue;

    if (source.platform === "telegram") {
      try {
        await checkTelegramSource(source);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.warn(`scraper: web scrape failed for source ${source.id}: ${errMsg}`);
        await db.update(sourcesTable)
          .set({ lastError: errMsg.slice(0, 500), lastCheckedAt: now })
          .where(eq(sourcesTable.id, source.id));
      }
    } else if (source.platform === "facebook") {
      await db.update(sourcesTable)
        .set({ lastError: "Facebook entegrasyonu henüz aktif değil." })
        .where(eq(sourcesTable.id, source.id));
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────
export function startScraperWorker(): void {
  const mode = isClientConnected()
    ? "GramJS + web fallback"
    : isBotTokenSet()
      ? "Bot API + web fallback"
      : "web scraping only";
  logger.info(`scraper: Telegram bot başlatıldı (${mode}, ${INITIAL_SCAN_DAYS}g ilk tarama, 1dk döngü)`);

  if (isBotTokenSet()) {
    setInterval(async () => {
      try { await processBotUpdates(); }
      catch (e) { logger.error(e, "scraper: bot poll error"); }
    }, TELEGRAM_SCAN_INTERVAL_MS);
  }

  setInterval(async () => {
    try { await runScraperCycle(); }
    catch (e) { logger.error(e, "scraper: cycle error"); }
  }, TELEGRAM_SCAN_INTERVAL_MS);

  setTimeout(async () => {
    try { await runScraperCycle(); }
    catch (e) { logger.error(e, "scraper: initial run error"); }
  }, 5_000);
}

export function isTelegramTokenSet(): boolean {
  return isBotTokenSet();
}

// Botları sıfırlayıp hemen yeniden taramayı tetikler.
// İçe aktarma geçmişi route tarafında temizlenir; burada bot offset sıfırlanıp
// tarama döngüsü hemen çalıştırılır (interval beklenmez).
export async function triggerRescan(): Promise<void> {
  botUpdateOffset = 0;
  await runScraperCycle(true);
}

// Otomatik içe aktarılmış (sourceTag dolu) ilanları, kayıtlı metinlerinden
// yeniden ayrıştırır: maaş, şehir, başlık ve cinsiyet bilgisini günceller.
// Eksik bilgiyle eklenen eski ilanları düzeltmek için kullanılır.
export async function reparseImportedListings(): Promise<{ total: number; updated: number }> {
  const rows = await db.select().from(listingsTable)
    .where(isNotNull(listingsTable.sourceTag));

  let updated = 0;
  for (const row of rows) {
    const text = row.description;
    if (!text?.trim()) continue;

    const newTitle = extractTitle(text);
    const newCity = extractCity(text);
    const newSalary = extractSalary(text);
    const newGender = extractGender(text);
    const newPhone = extractPhone(text);

    // Mevcut "Kaynak:" satırını koru
    const reqLines = (row.requirements ?? "").split("\n");
    const kaynakLine = reqLines.find(l => l.trim().toLocaleLowerCase("tr-TR").startsWith("kaynak:"));
    // Önceden tespit edilmiş cinsiyeti bilgisi, yeniden ayrıştırma boş dönerse silinmesin
    const existingGenderLine = reqLines.find(l => l.trim().toLocaleLowerCase("tr-TR").startsWith("cinsiyet:"));
    const existingGender = existingGenderLine ? existingGenderLine.split(":").slice(1).join(":").trim() : "";
    const genderVal = newGender ?? (existingGender && existingGender !== "Belirtilmemiş" ? existingGender : null);
    const requirements = `Cinsiyet: ${genderVal ?? "Belirtilmemiş"}`
      + (kaynakLine ? `\n${kaynakLine.trim()}` : "");

    const next: Partial<typeof listingsTable.$inferInsert> = {
      title: newTitle,
      requirements,
    };
    // Yeni bilgi bulunduysa güncelle; bulunamazsa mevcut değeri silme
    if (newCity) next.city = newCity;
    if (newSalary) next.salary = newSalary;
    if (newPhone) next.applyUrl = `tel:${newPhone}`;

    const changed = next.title !== row.title
      || next.requirements !== row.requirements
      || (next.city !== undefined && next.city !== row.city)
      || (next.salary !== undefined && next.salary !== row.salary)
      || (next.applyUrl !== undefined && next.applyUrl !== row.applyUrl);

    if (!changed) continue;

    await db.update(listingsTable).set(next).where(eq(listingsTable.id, row.id));
    updated++;
  }

  return { total: rows.length, updated };
}
