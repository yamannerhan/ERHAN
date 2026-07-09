import crypto from "crypto";
import { db, sourcesTable, importedPostsTable, pendingJobsTable, listingsTable, listingLikesTable, listingFavoritesTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, lt, or, sql, inArray, like } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getUpdates, isBotTokenSet, isClientConnected, fetchChannelMessages, PAGES_PER_CYCLE, ensureTelegramConnected } from "../services/telegram-client";
import type { BotUpdate, ChannelMessage } from "../services/telegram-client";
import { extractSalary, extractGender, extractLocation, extractTitle, isSecurityJobPosting, isSponsoredPost, isJobSeekerPost } from "../lib/job-parsing";
import type { ParsedLocation } from "../lib/job-parsing";
import { announceNewListing } from "../lib/listing-announcements";
import { emitRealtime } from "../lib/realtime";

// ── Keyword lists ──────────────────────────────────────────────────
const CHAT_SKIP_KEYWORDS = [
  "selam", "merhaba", "nasılsın", "iş var mı", "iş arıyorum", "iş arayışı",
  "özelden yaz", "teşekkür", "tamam", "günaydın", "iyi akşam", "iyi geceler",
  "kolay gelsin", "iyi günler", "iyi akşamlar", "allaha emanet", "rica ederim",
  "ne zaman açıklanacak", "sonuçlar", "abla yaz", "atlarız", "hadı hayırlısı",
  "lazım varsa dm", "iş aramaktan yoruldum", "işverenler dm",
];

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

function resolveListingCity(location: ParsedLocation): string {
  return location.display ?? location.district ?? location.city ?? "Türkiye";
}

function matchesTargetCities(
  text: string,
  location: ParsedLocation,
  targets: string[] | null | undefined,
  strict: boolean,
): boolean {
  if (!strict || !targets?.length) return true;
  const plain = text.toLocaleLowerCase("tr-TR");
  const cityNorm = (location.city ?? "").toLocaleLowerCase("tr-TR");
  const displayNorm = (location.display ?? "").toLocaleLowerCase("tr-TR");
  const matches = targets.some((raw) => {
    const t = raw.trim().toLocaleLowerCase("tr-TR");
    if (!t) return false;
    return plain.includes(t) || cityNorm.includes(t) || t.includes(cityNorm)
      || displayNorm.includes(t) || t.includes(displayNorm);
  });
  if (matches) return true;
  // Konum çıkarılamadıysa bölgesel kanaldaki ilanları yine geçir
  if (!location.city && !location.district) return true;
  return false;
}

function createDuplicateHash(text: string): string {
  // Sadece metin birebir aynıysa duplicate — telefon/şehir/tarih tek başına yetmez
  const normalized = normalizeText(text);
  return crypto.createHash("sha256").update(`content:${normalized}`).digest("hex");
}

async function findDuplicateImported(hash: string, sourceId: number, externalId?: string): Promise<boolean> {
  if (externalId) {
    const [sameMsg] = await db.select({ id: importedPostsTable.id })
      .from(importedPostsTable)
      .where(and(
        eq(importedPostsTable.sourceId, sourceId),
        eq(importedPostsTable.externalId, externalId),
      ))
      .limit(1);
    if (sameMsg) return true;
  }
  const [row] = await db.select({ id: importedPostsTable.id })
    .from(importedPostsTable)
    .where(and(
      eq(importedPostsTable.duplicateHash, hash),
      eq(importedPostsTable.sourceId, sourceId),
    ))
    .limit(1);
  return !!row;
}

async function findListingBySourceMessage(sourceId: number, messageId: string): Promise<number | null> {
  const [row] = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.sourceId, sourceId),
      eq(listingsTable.messageId, messageId),
    ))
    .limit(1);
  return row?.id ?? null;
}

function shouldAutoPublish(source: typeof sourcesTable.$inferSelect): boolean {
  if (source.platform === "telegram") return true;
  return source.autoPublish || !source.requireApproval;
}

// İlk tarama: son 30 gün. Sonraki taramalar: lastTelegramMessageId sonrası.
const envInitialDays = Number(process.env["SCRAPER_INITIAL_DAYS"]);
const INITIAL_SCAN_DAYS = Number.isFinite(envInitialDays) && envInitialDays > 0 ? envInitialDays : 30;
const INITIAL_SCAN_MS = INITIAL_SCAN_DAYS * 24 * 60 * 60 * 1000;
const SOURCE_SCAN_DELAY_MS = 2_000;
const STALE_SCAN_LOCK_MS = 15 * 60 * 1000;
const MESSAGE_PROCESS_DELAY_MS = 100;
const INCREMENTAL_SCAN_INTERVAL_MIN = 1;
const INCREMENTAL_SOURCE_GAP_MS = 60_000;
const INITIAL_BACKFILL_INTERVAL_MIN = 1;
const INITIAL_BACKFILL_INTERVAL_MS = 5_000;
const BACKWARD_PAGES_PER_RUN = 5;
const ALLOWED_SCAN_INTERVALS = [1, 5, 10, 30] as const;

let scanBackoffMinutes = 0;
let scraperIntervalHandle: ReturnType<typeof setInterval> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasIncompleteInitialScan(): Promise<boolean> {
  const rows = await db.select({ id: sourcesTable.id })
    .from(sourcesTable)
    .where(and(
      eq(sourcesTable.platform, "telegram"),
      eq(sourcesTable.active, true),
      eq(sourcesTable.initialScanDone, false),
    ))
    .limit(1);
  return rows.length > 0;
}

async function getTelegramScanIntervalMinutes(): Promise<number> {
  try {
    const incomplete = await hasIncompleteInitialScan();
    if (incomplete) {
      return INITIAL_BACKFILL_INTERVAL_MIN;
    }
    return Math.max(INCREMENTAL_SCAN_INTERVAL_MIN, scanBackoffMinutes);
  } catch {
    return INCREMENTAL_SCAN_INTERVAL_MIN;
  }
}

export async function getEffectiveScanIntervalMinutes(): Promise<number> {
  return getTelegramScanIntervalMinutes();
}

export async function getScanPhase(): Promise<"initial" | "incremental"> {
  return (await hasIncompleteInitialScan()) ? "initial" : "incremental";
}

type InitialScanPhase = "backward" | "forward";

const CONNECTION_ERR =
  "Telegram hesabı bu kaynağı okuyamadı: Telegram hesabı bağlı değil veya oturum yenilenemedi. " +
  "Admin → Telegram Hesabı sekmesinden bağlayın.";

function resolveInitialPhase(source: typeof sourcesTable.$inferSelect): InitialScanPhase {
  if (source.initialScanDone) return "forward";
  if (source.initialScanPhase === "forward") return "forward";
  return "backward";
}

function mergeIdRange(anchor: number, top: number, batchMin: number, batchMax: number): { anchor: number; top: number } {
  let a = anchor;
  let t = top;
  if (batchMin > 0 && (a === 0 || batchMin < a)) a = batchMin;
  if (batchMax > 0 && batchMax > t) t = batchMax;
  return { anchor: a, top: t };
}

function computeBackwardProgress(
  oldestInBatch: Date | null | undefined,
  cumulativeOldest: Date | null | undefined,
  current: number,
  reachedCutoff: boolean,
): number {
  if (reachedCutoff) return 19;
  let next = Math.min(18, Math.max(current, 1) + 4);
  const oldest = cumulativeOldest ?? oldestInBatch;
  if (oldest) {
    const ageMs = Math.max(0, Date.now() - oldest.getTime());
    const byAge = 1 + Math.floor((Math.min(ageMs, INITIAL_SCAN_MS) / INITIAL_SCAN_MS) * 17);
    next = Math.max(next, byAge);
  }
  return Math.min(19, next);
}

function computeForwardProgress(anchorId: number, topId: number, lastProcessedId: number): number {
  if (topId <= 0 || anchorId <= 0) return 21;
  if (topId <= anchorId) return 100;
  const ratio = Math.max(0, Math.min(1, (lastProcessedId - anchorId) / (topId - anchorId)));
  return Math.min(99, Math.max(21, 20 + Math.floor(ratio * 79)));
}

function mergeScanStats(
  source: typeof sourcesTable.$inferSelect,
  stats: ScanStats,
): {
  lastScanMessagesRead: number;
  lastScanFound: number;
  lastScanAdded: number;
  lastScanDuplicates: number;
  lastScanErrors: number;
} {
  return {
    lastScanMessagesRead: (source.lastScanMessagesRead ?? 0) + stats.messagesRead,
    lastScanFound: (source.lastScanFound ?? 0) + stats.found,
    lastScanAdded: (source.lastScanAdded ?? 0) + stats.added,
    lastScanDuplicates: (source.lastScanDuplicates ?? 0) + stats.duplicates,
    lastScanErrors: (source.lastScanErrors ?? 0) + stats.errors,
  };
}

async function patchSourceProgress(
  sourceId: number,
  patch: Partial<typeof sourcesTable.$inferInsert>,
): Promise<void> {
  await db.update(sourcesTable).set(patch).where(eq(sourcesTable.id, sourceId));
  emitRealtime("scraper:source", { sourceId, ...patch });
}

async function deleteListingsForSource(source: typeof sourcesTable.$inferSelect): Promise<number> {
  const username = extractTelegramUsername(source.url);
  const deleteConditions = [eq(listingsTable.sourceId, source.id)];
  if (username) {
    deleteConditions.push(like(listingsTable.sourceUrl, `%t.me/${username}/%`));
  }
  const deleted = await db.delete(listingsTable)
    .where(or(...deleteConditions))
    .returning({ id: listingsTable.id });
  return deleted.length;
}

function bumpScanBackoffOnRateLimit(): void {
  if (scanBackoffMinutes < 5) scanBackoffMinutes = 5;
  else if (scanBackoffMinutes < 10) scanBackoffMinutes = 10;
  else scanBackoffMinutes = 30;
  logger.warn({ scanBackoffMinutes }, "scraper: rate limit — tarama aralığı artırıldı");
}

function listingExpiryFrom(postedAt?: Date): Date {
  const base = postedAt ?? new Date();
  return new Date(base.getTime() + INITIAL_SCAN_MS);
}

function isChatMessage(text: string): boolean {
  if (isSecurityJobPosting(text)) return false;
  if (isSponsoredPost(text) || isJobSeekerPost(text)) return true;
  if (text.length > 500) return false;
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
type ProcessResult = "added" | "duplicate" | "updated" | "skipped";

async function processMessage(
  source: typeof sourcesTable.$inferSelect,
  externalId: string,
  text: string,
  sourceUrl: string,
  postedAt?: Date,
  isInitialScan = false,
): Promise<ProcessResult> {
  if (!text?.trim() || isChatMessage(text)) return "skipped";
  if (!isSecurityJobPosting(text)) return "skipped";

  if (isInitialScan && postedAt && Date.now() - postedAt.getTime() > INITIAL_SCAN_MS) {
    return "skipped";
  }

  const location = extractLocation(text);
  if (!matchesTargetCities(text, location, source.targetCities, source.publishOnlyTargetCities)) {
    return "skipped";
  }

  const messageId = externalId.includes("_") ? externalId.split("_").pop()! : externalId;
  const now = new Date();

  const [seenExt] = await db.select({ id: importedPostsTable.id })
    .from(importedPostsTable)
    .where(and(
      eq(importedPostsTable.sourceId, source.id),
      eq(importedPostsTable.externalId, externalId),
    ))
    .limit(1);
  if (seenExt) return "duplicate";

  const hash = createDuplicateHash(text);
  if (await findDuplicateImported(hash, source.id, externalId)) return "duplicate";

  const existingByMessage = await findListingBySourceMessage(source.id, messageId);
  if (existingByMessage) return "duplicate";

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

  if (!imported) return "skipped";

  const title = extractTitle(text);
  const city = resolveListingCity(location);
  const salary = extractSalary(text);
  const phone = extractPhone(text);
  const gender = extractGender(text);
  const listingMeta = {
    sourceId: source.id,
    messageId,
    sourceUrl,
    publishedAt: postedAt ?? now,
    firstSeenAt: now,
    lastSeenAt: now,
    rawText: text,
  };

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
    return "skipped";
  }

  const [newListing] = await db.insert(listingsTable).values({
    title: title ?? "Güvenlik Personeli Aranıyor",
    company: "Belirtilmemiş",
    city,
    salary: salary ?? undefined,
    workType: "Tam Zamanlı",
    description: text,
    requirements: `Cinsiyet: ${gender ?? "Belirtilmemiş"}`,
    status: "active",
    isActive: true,
    autoDeleteOnExpiry: true,
    sourceTag: source.platform,
    applyUrl: phone ? `tel:${phone}` : sourceUrl,
    expiresAt: listingExpiryFrom(postedAt),
    ...listingMeta,
    ...(postedAt ? { createdAt: postedAt } : {}),
  }).returning();
  if (!newListing) return "skipped";

  await db.update(importedPostsTable)
    .set({ status: "approved" })
    .where(eq(importedPostsTable.id, imported.id));

  if (!isInitialScan) {
    void announceNewListing({
      id: newListing.id,
      title: newListing.title,
      city: newListing.city,
      company: newListing.company,
    }).catch((err) => logger.error({ err }, "scraper: announceNewListing failed"));
  }

  return "added";
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
type ScanStats = {
  messagesRead: number;
  found: number;
  added: number;
  duplicates: number;
  errors: number;
  maxId: number;
};

async function releaseStaleScanLocks(forceAll = false): Promise<number> {
  if (forceAll) {
    const released = await db.update(sourcesTable)
      .set({ isScanning: false })
      .where(eq(sourcesTable.isScanning, true))
      .returning({ id: sourcesTable.id });
    if (released.length > 0) {
      logger.warn({ count: released.length }, "scraper: takılı scan kilidi temizlendi");
    }
    return released.length;
  }
  const staleBefore = new Date(Date.now() - STALE_SCAN_LOCK_MS);
  const released = await db.update(sourcesTable)
    .set({ isScanning: false })
    .where(and(
      eq(sourcesTable.isScanning, true),
      sql`(${sourcesTable.lastCheckedAt} IS NULL OR ${sourcesTable.lastCheckedAt} < ${staleBefore})`,
    ))
    .returning({ id: sourcesTable.id });
  if (released.length > 0) {
    logger.warn({ count: released.length }, "scraper: eski scan kilidi temizlendi");
  }
  return released.length;
}

async function loadSourceById(id: number) {
  const [row] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, id)).limit(1);
  return row ?? null;
}

async function acquireSourceScanLock(sourceId: number): Promise<boolean> {
  const locked = await db.update(sourcesTable)
    .set({ isScanning: true })
    .where(and(eq(sourcesTable.id, sourceId), eq(sourcesTable.isScanning, false)))
    .returning({ id: sourcesTable.id });
  return locked.length > 0;
}

async function releaseSourceScanLock(sourceId: number): Promise<void> {
  await db.update(sourcesTable).set({ isScanning: false }).where(eq(sourcesTable.id, sourceId));
}

async function fetchWithReconnect(
  username: string,
  options: Parameters<typeof fetchChannelMessages>[1],
): Promise<Awaited<ReturnType<typeof fetchChannelMessages>>> {
  try {
    return await fetchChannelMessages(username, options);
  } catch (firstErr) {
    logger.warn({ err: firstErr, username }, "scraper: fetch failed, reconnect deneniyor");
    const ok = await ensureTelegramConnected(5);
    if (!ok) throw firstErr;
    return fetchChannelMessages(username, options);
  }
}

async function checkTelegramSource(source: typeof sourcesTable.$inferSelect): Promise<ScanStats> {
  const stats: ScanStats = { messagesRead: 0, found: 0, added: 0, duplicates: 0, errors: 0, maxId: parseInt(source.lastTelegramMessageId ?? "0", 10) || 0 };
  const username = extractTelegramUsername(source.url);
  if (!username) {
    await patchSourceProgress(source.id, { lastError: "Geçersiz Telegram kanal linki. Örnek: https://t.me/kanal_adi", isScanning: false });
    return stats;
  }

  const isInitialScan = !source.initialScanDone;
  const phase = resolveInitialPhase(source);
  let lastId = parseInt(source.lastTelegramMessageId ?? "0", 10) || 0;
  const scanOffset = parseInt(source.initialScanOffsetId ?? "0", 10) || 0;
  let anchorId = parseInt(source.initialScanAnchorId ?? "0", 10) || 0;
  let topId = parseInt(source.initialScanTopId ?? "0", 10) || 0;

  logger.info(
    `scraper: @${username} ${isInitialScan
      ? `ilk tarama [${phase}] %${source.initialScanProgress ?? 1}`
      : `yeni mesajlar (id>${lastId})`}`,
  );

  await patchSourceProgress(source.id, { lastError: null, isScanning: true });

  // ── Aşama 1: 30 gün sınırına geri git (mesaj işleme yok, sayfa sayfa ilerle) ──
  if (isInitialScan && phase === "backward") {
    let currentOffset = scanOffset;
    let currentProgress = source.initialScanProgress ?? 1;
    let cumulativeOldest: Date | null = source.initialScanOldestAt ?? null;
    let totalRead = 0;
    const baseMessagesRead = source.lastScanMessagesRead ?? 0;

    for (let page = 0; page < BACKWARD_PAGES_PER_RUN; page++) {
      let result;
      try {
        result = await fetchWithReconnect(username, {
          maxAgeDays: INITIAL_SCAN_DAYS,
          offsetId: currentOffset,
          maxPages: 1,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (/FLOOD_WAIT|rate limit|wait of \d+ seconds/i.test(errMsg)) bumpScanBackoffOnRateLimit();
        if (!(await ensureTelegramConnected(2))) {
          await patchSourceProgress(source.id, { lastCheckedAt: new Date(), lastError: CONNECTION_ERR, isScanning: false });
          return stats;
        }
        throw e;
      }

      if (result.messages.length === 0 && !(await ensureTelegramConnected(1))) {
        await patchSourceProgress(source.id, { lastCheckedAt: new Date(), lastError: CONNECTION_ERR, isScanning: false });
        return stats;
      }

      const merged = mergeIdRange(anchorId, topId, result.minIdInBatch, result.maxIdInBatch);
      anchorId = merged.anchor;
      topId = merged.top;
      totalRead += result.messages.length;

      let oldestPostedAt: Date | undefined;
      for (const m of result.messages) {
        if (m.postedAt && (!oldestPostedAt || m.postedAt < oldestPostedAt)) oldestPostedAt = m.postedAt;
      }
      if (oldestPostedAt) {
        cumulativeOldest = !cumulativeOldest || oldestPostedAt < cumulativeOldest ? oldestPostedAt : cumulativeOldest;
      }

      currentProgress = computeBackwardProgress(
        oldestPostedAt,
        cumulativeOldest,
        currentProgress,
        result.reachedCutoff,
      );

      const channelOlderThanCutoff = cumulativeOldest != null && cumulativeOldest <= new Date(Date.now() - INITIAL_SCAN_MS);
      const discoveryComplete = result.reachedCutoff
        || (result.noMoreMessages && (channelOlderThanCutoff || result.messages.length === 0));

      currentOffset = result.nextOffsetId;

      await patchSourceProgress(source.id, {
        lastCheckedAt: new Date(),
        initialScanOffsetId: currentOffset > 0 ? String(currentOffset) : source.initialScanOffsetId,
        initialScanAnchorId: anchorId > 0 ? String(anchorId) : source.initialScanAnchorId,
        initialScanTopId: topId > 0 ? String(topId) : source.initialScanTopId,
        initialScanOldestAt: cumulativeOldest,
        initialScanProgress: currentProgress,
        lastScanMessagesRead: baseMessagesRead + totalRead,
        isScanning: page < BACKWARD_PAGES_PER_RUN - 1,
      });

      stats.messagesRead = baseMessagesRead + totalRead;

      if (discoveryComplete) {
        const forwardStart = anchorId > 0 ? anchorId - 1 : 0;
        if (anchorId === 0 && topId === 0) {
          await patchSourceProgress(source.id, {
            initialScanDone: true,
            initialScanPhase: null,
            initialScanProgress: 100,
            initialScanOffsetId: null,
            isScanning: false,
            lastError: "Kanalda son 30 gün içinde metin mesajı bulunamadı.",
          });
          return stats;
        }

        await patchSourceProgress(source.id, {
          initialScanPhase: "forward",
          initialScanAnchorId: String(anchorId),
          initialScanTopId: String(topId),
          initialScanOffsetId: null,
          lastTelegramMessageId: String(forwardStart),
          initialScanProgress: Math.max(currentProgress, 20),
          isScanning: false,
          lastError: null,
        });
        logger.info({ username, anchorId, topId }, "scraper: 30 gün sınırına ulaşıldı, eski→yeni tarama başlıyor");
        return stats;
      }

      if (result.noMoreMessages && !result.reachedCutoff) break;
      if (page < BACKWARD_PAGES_PER_RUN - 1) await sleep(500);
    }

    await patchSourceProgress(source.id, { isScanning: false, lastError: null });
    return stats;
  }

  // ── Aşama 2: 30 gün sınırından yeniye doğru işle ──
  let messages: ChannelMessage[] = [];
  let noMoreMessages = false;

  try {
    const fetchOpts = isInitialScan && phase === "forward"
      ? { minMessageId: lastId, maxPages: PAGES_PER_CYCLE }
      : { minMessageId: lastId, maxPages: 15 };
    const result = await fetchWithReconnect(username, fetchOpts);
    messages = result.messages;
    noMoreMessages = result.noMoreMessages;
    if (isInitialScan && phase === "forward") {
      anchorId = parseInt(source.initialScanAnchorId ?? "0", 10) || anchorId;
      topId = parseInt(source.initialScanTopId ?? "0", 10) || topId;
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (/FLOOD_WAIT|rate limit|wait of \d+ seconds/i.test(errMsg)) bumpScanBackoffOnRateLimit();
    if (!(await ensureTelegramConnected(2))) {
      await patchSourceProgress(source.id, { lastCheckedAt: new Date(), lastError: CONNECTION_ERR, isScanning: false });
      return stats;
    }
    throw e;
  }

  if (messages.length === 0 && !(await ensureTelegramConnected(1)) && isInitialScan) {
    await patchSourceProgress(source.id, {
      lastCheckedAt: new Date(),
      lastError: CONNECTION_ERR,
      isScanning: false,
    });
    return stats;
  }

  stats.messagesRead = messages.length;
  let maxId = lastId;
  let processedCount = 0;
  let liveFound = 0;
  let liveAdded = 0;
  let liveDuplicates = 0;
  let liveErrors = 0;
  const mergedBase = mergeScanStats(source, { messagesRead: 0, found: 0, added: 0, duplicates: 0, errors: 0, maxId: 0 });

  for (const msg of messages) {
    const msgId = parseInt(msg.id, 10);
    if (!Number.isFinite(msgId)) continue;
    if (msgId <= lastId) continue;
    if (msgId > maxId) maxId = msgId;
    try {
      const procResult = await processMessage(
        source,
        `${username}_${msg.id}`,
        msg.text,
        msg.url,
        msg.postedAt,
        isInitialScan,
      );
      if (procResult === "added") { stats.added++; stats.found++; liveAdded++; liveFound++; }
      else if (procResult === "updated") { stats.found++; liveFound++; }
      else if (procResult === "duplicate") { stats.duplicates++; stats.found++; liveDuplicates++; liveFound++; }
    } catch (e) {
      stats.errors++;
      liveErrors++;
      logger.error(e, `scraper: msg ${msg.id} @${username}`);
    }
    processedCount++;
    if (isInitialScan && phase === "forward" && (processedCount % 3 === 0 || processedCount === messages.length)) {
      const livePct = computeForwardProgress(anchorId, topId, msgId);
      await patchSourceProgress(source.id, {
        initialScanProgress: livePct,
        lastScanMessagesRead: mergedBase.lastScanMessagesRead + processedCount,
        lastScanFound: mergedBase.lastScanFound + liveFound,
        lastScanAdded: mergedBase.lastScanAdded + liveAdded,
        lastScanDuplicates: mergedBase.lastScanDuplicates + liveDuplicates,
        lastScanErrors: mergedBase.lastScanErrors + liveErrors,
      });
    }
    if (MESSAGE_PROCESS_DELAY_MS > 0) await sleep(MESSAGE_PROCESS_DELAY_MS);
  }

  stats.maxId = maxId;

  const initialComplete = isInitialScan && phase === "forward" && (
    (topId > 0 && maxId >= topId) ||
    (messages.length === 0 && lastId >= topId - 1 && topId > 0) ||
    (noMoreMessages && maxId >= topId - 1 && topId > 0)
  );

  const scanProgress = isInitialScan && phase === "forward"
    ? (initialComplete ? 100 : computeForwardProgress(anchorId, topId, maxId))
    : 100;

  let scanError: string | null = null;
  if (messages.length === 0 && !initialComplete && isInitialScan && phase === "forward") {
    scanError = null;
  } else if (messages.length === 0 && !isInitialScan) {
    scanError = null;
  }

  const cumulativeStats = mergeScanStats(source, stats);
  await patchSourceProgress(source.id, {
    lastCheckedAt: new Date(),
    lastTelegramMessageId: maxId > lastId ? String(maxId) : source.lastTelegramMessageId,
    initialScanOffsetId: initialComplete ? null : source.initialScanOffsetId,
    initialScanDone: initialComplete ? true : source.initialScanDone,
    initialScanPhase: initialComplete ? null : (isInitialScan ? "forward" : source.initialScanPhase),
    initialScanProgress: initialComplete ? 100 : (isInitialScan ? scanProgress : 100),
    lastScanPublished: stats.added,
    ...cumulativeStats,
    totalImported: (source.totalImported ?? 0) + stats.added,
    lastError: scanError,
    isScanning: false,
  });

  logger.info({
    source: source.name, username, phase,
    messagesRead: cumulativeStats.lastScanMessagesRead, batchRead: stats.messagesRead, added: stats.added,
    maxId, topId, anchorId, scanProgress, initialComplete,
  }, `scraper: @${username} tarama özeti`);

  if (initialComplete) void refreshScraperInterval().catch(() => {});
  return stats;
}

/** Sıradaki tek Telegram kaynağını seç: önce ilk taraması bitmemiş (id sırası), sonra id sırasıyla round-robin. */
function pickNextTelegramSource(
  telegramSources: Array<typeof sourcesTable.$inferSelect>,
): typeof sourcesTable.$inferSelect | null {
  const active = [...telegramSources.filter(s => s.active)].sort((a, b) => a.id - b.id);
  if (!active.length) return null;

  const incomplete = active.filter(s => !s.initialScanDone);
  if (incomplete.length > 0) return incomplete[0] ?? null;

  const allDone = active.every(s => s.initialScanDone);
  if (allDone) {
    const oldest = [...active].sort(
      (a, b) => (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0),
    )[0];
    return oldest ?? null;
  }

  return active[0] ?? null;
}

async function scanTelegramSources(
  telegramSources: Array<typeof sourcesTable.$inferSelect>,
  _force: boolean,
): Promise<void> {
  await releaseStaleScanLocks();
  const now = new Date();

  const target = pickNextTelegramSource(telegramSources);
  if (!target) return;

  // Sırada bekleyen kaynaklarda hata gösterme
  const waiting = telegramSources.filter(s => s.active && !s.initialScanDone && s.id !== target.id);
  for (const w of waiting) {
    await patchSourceProgress(w.id, { lastError: "Sırada bekliyor…" });
  }

  const fresh = await loadSourceById(target.id);
  if (!fresh?.active) return;

  if (fresh.isScanning) {
    logger.info(`scraper: kaynak #${fresh.id} "${fresh.name}" kilitli, atlanıyor`);
    return;
  }

  const username = extractTelegramUsername(fresh.url);
  const queueIndex = telegramSources.filter(s => s.active).sort((a, b) => a.id - b.id);
  const pos = queueIndex.findIndex(s => s.id === fresh.id) + 1;
  logger.info(
    `scraper: sıra → kaynak #${fresh.id} "${fresh.name}" @${username ?? "?"} ` +
    `(${pos}/${queueIndex.length}, ilk=${!fresh.initialScanDone}, %${fresh.initialScanProgress ?? 0}, offset=${fresh.initialScanOffsetId ?? "0"})`,
  );

  const locked = await acquireSourceScanLock(fresh.id);
  if (!locked) return;

  let cycleAdded = 0;
  let cycleErrors = 0;

  try {
    const stats = await checkTelegramSource(fresh);
    cycleAdded += stats.added;
    cycleErrors += stats.errors;
  } catch (e) {
    cycleErrors++;
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.warn(`scraper: telegram source ${fresh.id} (@${username ?? "?"}) failed: ${errMsg}`);
    await db.update(sourcesTable)
      .set({
        lastError: errMsg.slice(0, 500),
        lastCheckedAt: now,
        isScanning: false,
        lastScanErrors: (fresh.lastScanErrors ?? 0) + 1,
      })
      .where(eq(sourcesTable.id, fresh.id));
  } finally {
    await releaseSourceScanLock(fresh.id);
  }

  logger.info({ sourceId: fresh.id, cycleAdded, cycleErrors }, "scraper: döngü özeti (tek kaynak)");

  emitRealtime("scraper:status", {
    telegramGramJsConnected: await ensureTelegramConnected(1),
    scanPhase: await getScanPhase(),
    effectiveScanIntervalMinutes: await getEffectiveScanIntervalMinutes(),
  });

  if (await hasIncompleteInitialScan()) {
    setTimeout(() => {
      void runScraperCycle(true).catch((e) => logger.error(e, "scraper: chained cycle error"));
    }, INITIAL_BACKFILL_INTERVAL_MS);
  } else if (telegramSources.some(s => s.active)) {
    setTimeout(() => {
      void runScraperCycle(true).catch((e) => logger.error(e, "scraper: incremental chain error"));
    }, INCREMENTAL_SOURCE_GAP_MS);
  }
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
  await ensureTelegramConnected();
  await processBotUpdates();

  const sources = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.active, true));

  const now = new Date();
  const telegramSources = sources.filter(s => s.platform === "telegram");
  if (telegramSources.length > 0) {
    await scanTelegramSources(telegramSources, force);
  }

  for (const source of sources) {
    if (source.platform === "telegram") continue;

    const intervalMin = source.checkInterval ?? 15;
    const intervalMs = intervalMin * 60 * 1000;
    const lastChecked = source.lastCheckedAt?.getTime() ?? 0;
    if (!force && now.getTime() - lastChecked < intervalMs) continue;

    if (source.platform === "facebook") {
      await db.update(sourcesTable)
        .set({ lastError: "Facebook entegrasyonu henüz aktif değil." })
        .where(eq(sourcesTable.id, source.id));
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────
async function scheduleScraperInterval(): Promise<void> {
  const minutes = await getTelegramScanIntervalMinutes();
  const ms = minutes * 60_000;
  if (scraperIntervalHandle) clearInterval(scraperIntervalHandle);
  scraperIntervalHandle = setInterval(async () => {
    try { await runScraperCycle(); }
    catch (e) { logger.error(e, "scraper: cycle error"); }
  }, ms);
  logger.info({ minutes, ms }, "scraper: tarama aralığı ayarlandı");
}

export function startScraperWorker(): void {
  void releaseStaleScanLocks(true);
  void ensureTelegramConnected().then((ok) => {
    logger.info(`scraper: GramJS ${ok ? "bağlı" : "bağlı değil — Admin panelinden Telegram hesabı gerekli"}`);
  });
  const mode = isClientConnected()
    ? "GramJS"
    : isBotTokenSet()
      ? "Bot API (GramJS bekleniyor)"
      : "GramJS bekleniyor";
  logger.info(`scraper: Telegram bot başlatıldı (${mode}, ${INITIAL_SCAN_DAYS}g ilk tarama, tamamlanınca gruplar 1dk arayla)`);

  void refreshScraperInterval();

  setInterval(() => {
    if (!isClientConnected()) void ensureTelegramConnected(2).catch(() => {});
  }, 5 * 60 * 1000);

  if (isBotTokenSet()) {
    void (async () => {
      const minutes = await getTelegramScanIntervalMinutes();
      setInterval(async () => {
        try { await processBotUpdates(); }
        catch (e) { logger.error(e, "scraper: bot poll error"); }
      }, minutes * 60_000);
    })();
  }

  void scheduleScraperInterval();

  setTimeout(async () => {
    try { await runScraperCycle(); }
    catch (e) { logger.error(e, "scraper: initial run error"); }
  }, 5_000);
}

export async function refreshScraperInterval(): Promise<void> {
  await scheduleScraperInterval();
}

export function isTelegramTokenSet(): boolean {
  return isBotTokenSet();
}

async function deleteListingsByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  await db.delete(listingLikesTable).where(inArray(listingLikesTable.listingId, ids));
  await db.delete(listingFavoritesTable).where(inArray(listingFavoritesTable.listingId, ids));
  const deleted = await db.delete(listingsTable)
    .where(inArray(listingsTable.id, ids))
    .returning({ id: listingsTable.id });
  return deleted.length;
}

/** Süresi dolan ilanlar: tikli ise sil, tiksiz ise pasif yap. */
export async function purgeExpiredListings(): Promise<number> {
  const now = new Date();
  const cutoff = new Date(Date.now() - INITIAL_SCAN_MS);

  const toDeleteRows = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(or(
      and(
        isNotNull(listingsTable.expiresAt),
        lt(listingsTable.expiresAt, now),
        or(eq(listingsTable.autoDeleteOnExpiry, true), isNotNull(listingsTable.sourceTag)),
      ),
      and(
        isNotNull(listingsTable.sourceTag),
        lt(sql`COALESCE(${listingsTable.publishedAt}, ${listingsTable.createdAt})`, cutoff),
      ),
    ));

  const toDeactivateRows = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(
      isNotNull(listingsTable.expiresAt),
      lt(listingsTable.expiresAt, now),
      eq(listingsTable.autoDeleteOnExpiry, false),
      isNull(listingsTable.sourceTag),
      eq(listingsTable.status, "active"),
    ));

  const deleteIds = toDeleteRows.map((r) => r.id);
  const deactivateIds = toDeactivateRows.map((r) => r.id).filter((id) => !deleteIds.includes(id));

  let affected = 0;
  if (deleteIds.length > 0) {
    const n = await deleteListingsByIds(deleteIds);
    affected += n;
    logger.info({ count: n }, "scraper: süresi dolan ilanlar silindi");
  }
  if (deactivateIds.length > 0) {
    const deactivated = await db.update(listingsTable)
      .set({ status: "inactive", isActive: false })
      .where(inArray(listingsTable.id, deactivateIds))
      .returning({ id: listingsTable.id });
    affected += deactivated.length;
    logger.info({ count: deactivated.length }, "scraper: süresi dolan ilanlar pasife alındı");
  }
  return affected;
}

/** @deprecated purgeExpiredListings kullanın */
export async function expireImportedListings(): Promise<number> {
  return purgeExpiredListings();
}

/** Tüm Telegram botlarını sıfırla: bot ilanlarını sil, sırayla 30 gün yeniden tara. */
export async function resetAllTelegramBots(): Promise<{ deletedListings: number }> {
  await releaseStaleScanLocks(true);

  const telegramSources = await db.select().from(sourcesTable).where(eq(sourcesTable.platform, "telegram"));
  let totalDeleted = 0;

  for (const s of telegramSources) {
    totalDeleted += await deleteListingsForSource(s);
    await db.delete(importedPostsTable).where(eq(importedPostsTable.sourceId, s.id));
    await db.delete(pendingJobsTable).where(eq(pendingJobsTable.sourceId, s.id));
  }

  await db.delete(pendingJobsTable);

  for (const s of telegramSources) {
    const cleanUrl = s.url.trim().replace(/@+$/g, "").replace(/\/+$/g, "");
    if (cleanUrl !== s.url) {
      await db.update(sourcesTable).set({ url: cleanUrl }).where(eq(sourcesTable.id, s.id));
    }
  }

  await db.update(sourcesTable).set({
    lastCheckedAt: null,
    lastTelegramMessageId: null,
    initialScanOffsetId: null,
    initialScanDone: false,
    initialScanProgress: 1,
    initialScanPhase: "backward",
    initialScanAnchorId: null,
    initialScanTopId: null,
    initialScanOldestAt: null,
    totalImported: 0,
    lastScanPublished: 0,
    lastScanMessagesRead: 0,
    lastScanFound: 0,
    lastScanAdded: 0,
    lastScanDuplicates: 0,
    lastScanErrors: 0,
    isScanning: false,
    lastError: null,
  }).where(eq(sourcesTable.platform, "telegram"));

  logger.info({ sources: telegramSources.length, deletedListings: totalDeleted }, "scraper: tüm botlar sıfırlandı");
  await refreshScraperInterval();
  await triggerRescan();
  return { deletedListings: totalDeleted };
}

/** Tek Telegram kaynağını sıfırla: o gruptan gelen ilanları sil, son 30 günü yeniden tara. */
export async function resetSingleTelegramSource(sourceId: number): Promise<{ deletedListings: number }> {
  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, sourceId)).limit(1);
  if (!source) throw new Error("Kaynak bulunamadı");
  if (source.platform !== "telegram") throw new Error("Sadece Telegram kaynakları sıfırlanabilir");

  await db.update(sourcesTable).set({ isScanning: false }).where(eq(sourcesTable.id, sourceId));

  const deletedListings = await deleteListingsForSource(source);

  await db.delete(importedPostsTable).where(eq(importedPostsTable.sourceId, sourceId));
  await db.delete(pendingJobsTable).where(eq(pendingJobsTable.sourceId, sourceId));

  await db.update(sourcesTable).set({
    lastCheckedAt: null,
    lastTelegramMessageId: null,
    initialScanOffsetId: null,
    initialScanDone: false,
    initialScanProgress: 1,
    initialScanPhase: "backward",
    initialScanAnchorId: null,
    initialScanTopId: null,
    initialScanOldestAt: null,
    totalImported: 0,
    lastScanPublished: 0,
    lastScanMessagesRead: 0,
    lastScanFound: 0,
    lastScanAdded: 0,
    lastScanDuplicates: 0,
    lastScanErrors: 0,
    isScanning: false,
    lastError: null,
  }).where(eq(sourcesTable.id, sourceId));

  logger.info({ sourceId, name: source.name, deletedListings }, "scraper: kaynak sıfırlandı");
  await refreshScraperInterval();
  await triggerRescan();
  return { deletedListings };
}

export async function triggerDeepRescan30Days(): Promise<void> {
  await releaseStaleScanLocks(true);
  const telegramSources = await db.select({ id: sourcesTable.id }).from(sourcesTable).where(eq(sourcesTable.platform, "telegram"));
  const ids = telegramSources.map(s => s.id);
  if (ids.length > 0) {
    await db.delete(importedPostsTable).where(inArray(importedPostsTable.sourceId, ids));
  }
  await db.update(sourcesTable).set({
    initialScanDone: false,
    initialScanOffsetId: null,
    initialScanProgress: 1,
    initialScanPhase: "backward",
    initialScanAnchorId: null,
    initialScanTopId: null,
    initialScanOldestAt: null,
    lastTelegramMessageId: null,
    isScanning: false,
    lastError: null,
  }).where(eq(sourcesTable.platform, "telegram"));
  logger.info({ sources: ids.length }, "scraper: 30 gün derin tarama başlatıldı");
  await triggerRescan();
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
    const newCity = resolveListingCity(extractLocation(text));
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
