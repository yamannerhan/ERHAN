import { db, sourcesTable, importedPostsTable, pendingJobsTable, listingsTable, listingLikesTable, listingFavoritesTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, lt, or, sql, inArray, like, desc, asc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getUpdates, isBotTokenSet, isClientConnected, fetchChannelMessages, PAGES_PER_CYCLE, ensureTelegramConnected, hasTelegramSessionStored } from "../services/telegram-client";
import type { BotUpdate, ChannelMessage } from "../services/telegram-client";
import { fetchWhatsAppMessagesDetailed, isWhatsAppReady, hasWhatsAppLocalSession, ensureWhatsAppAutoConnect, isWhatsAppStarting } from "../services/whatsapp-client";
import { telegramSessionsTable } from "@workspace/db/schema";
import {
  elemanCityCount,
  formatElemanCursor,
  getElemanCityByIndex,
  parseElemanCursor,
  scrapeElemanCityPages,
  finalizeElemanListingText,
} from "../services/eleman-client";
import type { ElemanJobDetail } from "../services/eleman-client";
import { extractSalary, extractGender, extractLocation, extractExplicitWorkLocation, extractPhoneNumbers, formatTelApplyUrl, extractTitle, extractWorkType, isSecurityJobPosting, isSponsoredPost, isJobSeekerPost } from "../lib/job-parsing";
import { maybeClassifyWithV2 } from "../services/location/classifyListingLocationV2";
import type { ParsedLocation } from "../lib/job-parsing";
import { getProvinceMatchTerms, textMatchesProvince } from "../lib/location-terms";
import { announceNewListing } from "../lib/listing-announcements";
import { emitRealtime } from "../lib/realtime";
import { createDuplicateHash } from "../lib/job-dedup";

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
  return extractPhoneNumbers(text)[0] ?? null;
}

function extractPhones(text: string): string[] {
  return extractPhoneNumbers(text);
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
  const districtNorm = (location.district ?? "").toLocaleLowerCase("tr-TR");

  const matches = targets.some((raw) => {
    const t = raw.trim().toLocaleLowerCase("tr-TR");
    if (!t) return false;
    if (plain.includes(t) || cityNorm.includes(t) || districtNorm.includes(t)
      || displayNorm.includes(t) || t.includes(cityNorm) || t.includes(districtNorm)) {
      return true;
    }
    if (textMatchesProvince(text, raw)) return true;
    return getProvinceMatchTerms(raw).some(term => plain.includes(term.toLocaleLowerCase("tr-TR")));
  });
  if (matches) return true;
  if (!location.city && !location.district) return true;
  return false;
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
    .where(eq(importedPostsTable.duplicateHash, hash))
    .limit(1);
  return !!row;
}

async function findDuplicateActiveListing(text: string, hash: string): Promise<number | null> {
  // Sadece TAM metin (hash) eşleşmesi — benzer ilanlar yayınlanır
  const recent = await db.select({
    id: listingsTable.id,
    description: listingsTable.description,
    rawText: listingsTable.rawText,
  })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.status, "active"),
      eq(listingsTable.isActive, true),
      isNotNull(listingsTable.sourceTag),
    ))
    .orderBy(desc(listingsTable.createdAt))
    .limit(1200);

  for (const row of recent) {
    const content = row.rawText ?? row.description ?? "";
    if (!content) continue;
    if (createDuplicateHash(content) === hash) return row.id;
  }
  return null;
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
  if (source.platform === "telegram" || source.platform === "whatsapp" || source.platform === "eleman") return true;
  return source.autoPublish || !source.requireApproval;
}

// Telegram ilk tarama: son 30 gün. WhatsApp: gidebildiği kadar. Sonraki: imleç sonrası.
const envInitialDays = Number(process.env["SCRAPER_INITIAL_DAYS"]);
const INITIAL_SCAN_DAYS = Number.isFinite(envInitialDays) && envInitialDays > 0 ? envInitialDays : 30;
const INITIAL_SCAN_MS = INITIAL_SCAN_DAYS * 24 * 60 * 60 * 1000;
/** WhatsApp geçmişi — Chromium ne kadar verirse (üst sınır sadece cutoff hesabı) */
const WA_INITIAL_SCAN_DAYS = 730;
const WA_INITIAL_SCAN_MS = WA_INITIAL_SCAN_DAYS * 24 * 60 * 60 * 1000;
/** Bot ilanları sitede kalma süresi (tarama penceresinden bağımsız) */
const LISTING_TTL_DAYS = 15;
const LISTING_TTL_MS = LISTING_TTL_DAYS * 24 * 60 * 60 * 1000;
const SOURCE_SCAN_DELAY_MS = 2_000;
const STALE_SCAN_LOCK_MS = 90 * 1000;
const MESSAGE_PROCESS_DELAY_MS = 100;
const WA_MESSAGE_PROCESS_DELAY_MS = 200;
const WA_GROUP_GAP_MS = 12_000;
const WA_INCREMENTAL_SCAN_INTERVAL_MS = 30 * 60 * 1000;
const WA_CURSOR_OVERLAP_MS = 2 * 60 * 1000;
const INCREMENTAL_SCAN_INTERVAL_MIN = 1;
const INCREMENTAL_SOURCE_GAP_MS = 60_000;
const INITIAL_BACKFILL_INTERVAL_MIN = 1;
const INITIAL_BACKFILL_INTERVAL_MS = 5_000;
/** Her döngüde geriye kaç sayfa (×100 mesaj) — 30 güne daha hızlı ulaşmak için */
const BACKWARD_PAGES_PER_RUN = 8;
const ALLOWED_SCAN_INTERVALS = [1, 5, 10, 30] as const;

let scanBackoffMinutes = 0;
let scraperIntervalHandle: ReturnType<typeof setInterval> | null = null;
/** Admin «Tüm Botları Durdur» — sadece Telegram tarama durur (WA/Eleman etkilenmez) */
let telegramScraperPaused = false;

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

const CONNECTION_RECONNECTING =
  "Telegram oturumu yeniden bağlanıyor… Son mesaj imleci korunuyor (Sıfırla gerekmez).";

async function telegramConnectionErrorMessage(): Promise<string> {
  return (await hasTelegramSessionStored()) ? CONNECTION_RECONNECTING : CONNECTION_ERR;
}

function whatsappNotReadyError(): string {
  if (hasWhatsAppLocalSession() || isWhatsAppStarting()) {
    return "WhatsApp yeniden bağlanıyor… İmleçler korunuyor (Sıfırla gerekmez).";
  }
  return "WhatsApp bağlı değil. Admin → WhatsApp Kaynakları'ndan QR/onay kodu ile bağlanın.";
}

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
  if (reachedCutoff) return 99;
  let next = Math.min(95, Math.max(current, 1) + 6);
  const oldest = cumulativeOldest ?? oldestInBatch;
  if (oldest) {
    const ageMs = Math.max(0, Date.now() - oldest.getTime());
    const byAge = 1 + Math.floor((Math.min(ageMs, INITIAL_SCAN_MS) / INITIAL_SCAN_MS) * 94);
    next = Math.max(next, byAge);
  }
  return Math.min(99, next);
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

/**
 * Bot ilanı sitede LISTING_TTL_DAYS (15) gün kalsın — tarama süresi (30g / WA geçmiş) ayrı.
 */
function listingExpiryFrom(_postedAt?: Date): Date {
  return new Date(Date.now() + LISTING_TTL_MS);
}

/** Tekrar görülen ilan: lastSeen / lastChecked güncelle, yayın tarihini değiştirme. */
async function touchListingSeen(listingId: number): Promise<void> {
  const now = new Date();
  await db.update(listingsTable)
    .set({
      lastSeenAt: now,
      lastCheckedAt: now,
      status: "active",
      isActive: true,
    })
    .where(eq(listingsTable.id, listingId));
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

  const explicitLocation = extractExplicitWorkLocation(text);
  const location = explicitLocation ?? extractLocation(text);
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
  if (seenExt) {
    const existingId = await findListingBySourceMessage(source.id, messageId);
    if (existingId && postedAt) {
      await db.update(listingsTable)
        .set({ sourcePublishedAt: postedAt, publishedAt: postedAt, lastCheckedAt: now, lastSeenAt: now })
        .where(eq(listingsTable.id, existingId));
    }
    return "duplicate";
  }

  const hash = createDuplicateHash(text);
  if (await findDuplicateImported(hash, source.id, externalId)) return "duplicate";

  const duplicateListingId = await findDuplicateActiveListing(text, hash);
  if (duplicateListingId) {
    await touchListingSeen(duplicateListingId);
    return "duplicate";
  }

  const existingByMessage = await findListingBySourceMessage(source.id, messageId);
  if (existingByMessage) {
    if (postedAt) {
      await db.update(listingsTable)
        .set({ sourcePublishedAt: postedAt, publishedAt: postedAt, lastCheckedAt: now, lastSeenAt: now })
        .where(eq(listingsTable.id, existingByMessage));
    }
    return "duplicate";
  }

  const [imported] = await db.insert(importedPostsTable).values({
    sourceId: source.id,
    platform: source.platform,
    externalId,
    rawText: text,
    sourceUrl,
    duplicateHash: hash,
    isJob: true,
    status: "pending",
  }).onConflictDoNothing().returning();

  if (!imported) return "duplicate";

  const title = extractTitle(text);
  const v2City = await maybeClassifyWithV2({
    title,
    text,
    sourceName: source.name,
    sourceUrl,
    legacy: location,
  });
  const city = explicitLocation ? resolveListingCity(explicitLocation) : v2City.city;
  const salary = extractSalary(text);
  // Bir bot mesajı tek ilanı temsil eder; sayfa/ileti geçmişinden taşan
  // numaraların aynı ilana eklenmesini önlemek için yalnızca ilk numarayı al.
  const phones = extractPhones(text).slice(0, 1);
  const phoneField = phones.length ? phones.join(",") : null;
  const gender = extractGender(text);
  const workType = extractWorkType(text);
  const { assignCoordsFromCity } = await import("../lib/nearby-listings");
  const coords = assignCoordsFromCity(city);
  const { matchKnownCompany, matchKnownCompanyInBlob } = await import("../lib/known-companies");
  const { extractCompany } = await import("../lib/job-parsing");
  const parsedCo = extractCompany(text);
  const brand = (await matchKnownCompany(parsedCo)) || matchKnownCompanyInBlob(text);
  const companyName = brand?.name ?? (parsedCo !== "Belirtilmemiş" ? parsedCo : "Belirtilmemiş");
  const listingMeta = {
    sourceId: source.id,
    messageId,
    sourceUrl,
    publishedAt: postedAt ?? now,
    firstSeenAt: now,
    lastSeenAt: now,
    lastCheckedAt: now,
    rawText: text,
  };

  if (!shouldAutoPublish(source)) {
    await db.insert(pendingJobsTable).values({
      sourceId: source.id,
      importedPostId: imported.id,
      rawText: text,
      title,
      company: companyName !== "Belirtilmemiş" ? companyName : null,
      city,
      salary,
      phone: phoneField,
      description: text,
      applicationUrl: null,
      sourceUrl,
      platform: source.platform,
      status: "pending",
      duplicateHash: hash,
    });
    return "skipped";
  }

  const [newListing] = await db.insert(listingsTable).values({
    title: title ?? "Güvenlik Personeli Aranıyor",
    company: companyName,
    city,
    salary: salary ?? undefined,
    workType,
    description: text,
    requirements: `Cinsiyet: ${gender ?? "Belirtilmemiş"}`,
    status: "active",
    isActive: true,
    autoDeleteOnExpiry: true,
    sourceTag: source.platform,
    sourceType: "bot_imported",
    sourceName: source.platform === "telegram" ? "Telegram"
      : source.platform === "whatsapp" ? "WhatsApp"
      : source.platform === "eleman" ? "Eleman.net"
      : (source.platform || "Kaynak"),
    sourcePublishedAt: postedAt ?? now,
    verifiedPublisher: false,
    applyUrl: formatTelApplyUrl(phones),
    companyLogoUrl: brand?.logoUrl ?? null,
    expiresAt: listingExpiryFrom(postedAt),
    ...listingMeta,
    ...(coords ?? {}),
  }).returning();
  if (!newListing) return "skipped";

  try {
    const { logListingSourceHistory } = await import("../lib/listing-rank");
    void logListingSourceHistory(newListing.id, {
      sourceType: "bot_imported",
      sourceName: newListing.sourceName,
      sourceUrl: sourceUrl ?? null,
      sourcePublishedAt: postedAt ?? now,
      verifiedPublisher: false,
      verificationSnapshot: null,
      directPriorityUntil: null,
      freshnessConfirmedAt: null,
      firstSeenAt: now,
      lastSeenAt: now,
      lastCheckedAt: now,
    });
  } catch { /* ignore */ }

  await db.update(importedPostsTable)
    .set({ status: "approved" })
    .where(eq(importedPostsTable.id, imported.id));

  // WhatsApp / Eleman: admin bildirimi + kaynak adı
  // Telegram: duyuruda ve bildirimde "Telegram" yazsın (ilk taramada sadece admin)
  if (source.platform === "whatsapp") {
    void announceNewListing({
      id: newListing.id,
      title: newListing.title,
      city: newListing.city,
      company: newListing.company,
    }, { adminOnly: true, skipChat: true, sourceLabel: "WhatsApp" })
      .catch((err) => logger.error({ err }, "scraper: wa admin notify failed"));
  } else if (source.platform === "telegram") {
    void announceNewListing({
      id: newListing.id,
      title: newListing.title,
      city: newListing.city,
      company: newListing.company,
    }, isInitialScan
      ? { adminOnly: true, skipChat: true, sourceLabel: "Telegram" }
      : { sourceLabel: "Telegram" })
      .catch((err) => logger.error({ err }, "scraper: telegram announce failed"));
  } else if (!isInitialScan) {
    void announceNewListing({
      id: newListing.id,
      title: newListing.title,
      city: newListing.city,
      company: newListing.company,
    }, { sourceLabel: source.platform === "eleman" ? "Eleman.net" : (source.name || source.platform) })
      .catch((err) => logger.error({ err }, "scraper: announceNewListing failed"));
  }

  return "added";
}

// ── Bot API polling state ──────────────────────────────────────────
let botUpdateOffset = 0;
let botOffsetLoaded = false;

async function loadBotUpdateOffset(): Promise<void> {
  if (botOffsetLoaded) return;
  try {
    const rows = await db.select({ botUpdateOffset: telegramSessionsTable.botUpdateOffset })
      .from(telegramSessionsTable).limit(1);
    botUpdateOffset = rows[0]?.botUpdateOffset ?? 0;
    botOffsetLoaded = true;
  } catch {
    botOffsetLoaded = true;
  }
}

async function persistBotUpdateOffset(offset: number): Promise<void> {
  botUpdateOffset = offset;
  try {
    const rows = await db.select({ id: telegramSessionsTable.id }).from(telegramSessionsTable).limit(1);
    if (rows[0]) {
      await db.update(telegramSessionsTable)
        .set({ botUpdateOffset: offset, updatedAt: new Date() })
        .where(eq(telegramSessionsTable.id, rows[0].id));
    } else {
      await db.insert(telegramSessionsTable).values({
        authState: "disconnected",
        botUpdateOffset: offset,
      });
    }
  } catch (e) {
    logger.warn({ err: e }, "scraper: botUpdateOffset kaydedilemedi");
  }
}

async function processBotUpdates(): Promise<void> {
  if (!isBotTokenSet()) return;
  await loadBotUpdateOffset();

  const updates = await getUpdates(botUpdateOffset);
  if (updates.length === 0) return;

  // Load active telegram sources once
  const sources = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.active, true));
  const telegramSources = sources.filter(s => s.platform === "telegram");

  for (const update of updates) {
    const post = update.channel_post ?? update.message;
    if (!post?.text || post.text.length < 30) {
      await persistBotUpdateOffset(update.update_id + 1);
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

    await persistBotUpdateOffset(update.update_id + 1);
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

  // ── İlk tarama: geriye giderken İLANLARI İŞLE (eski 2 aşama takılıyordu / 0 ilan) ──
  if (isInitialScan && phase !== "forward") {
    let currentOffset = scanOffset;
    let currentProgress = source.initialScanProgress ?? 1;
    let cumulativeOldest: Date | null = source.initialScanOldestAt ?? null;
    let totalRead = 0;
    let newestId = topId;
    const baseMessagesRead = source.lastScanMessagesRead ?? 0;
    const baseFound = source.lastScanFound ?? 0;
    const baseAdded = source.lastScanAdded ?? 0;
    const baseDupes = source.lastScanDuplicates ?? 0;
    const baseErrors = source.lastScanErrors ?? 0;

    for (let page = 0; page < BACKWARD_PAGES_PER_RUN; page++) {
      let result;
      try {
        result = await fetchWithReconnect(username, {
          maxAgeDays: INITIAL_SCAN_DAYS,
          offsetId: currentOffset,
          maxPages: 2,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (/FLOOD_WAIT|rate limit|wait of \d+ seconds/i.test(errMsg)) bumpScanBackoffOnRateLimit();
        if (!(await ensureTelegramConnected(5))) {
          await patchSourceProgress(source.id, { lastCheckedAt: new Date(), lastError: await telegramConnectionErrorMessage(), isScanning: false });
          return stats;
        }
        throw e;
      }

      if (result.notConnected) {
        await patchSourceProgress(source.id, { lastCheckedAt: new Date(), lastError: await telegramConnectionErrorMessage(), isScanning: false });
        return stats;
      }

      if (result.maxIdInBatch > newestId) newestId = result.maxIdInBatch;
      if (result.minIdInBatch > 0) {
        const merged = mergeIdRange(anchorId, topId, result.minIdInBatch, result.maxIdInBatch);
        anchorId = merged.anchor;
        topId = merged.top;
        if (topId > newestId) newestId = topId;
      }

      let oldestPostedAt: Date | undefined;
      for (const m of result.messages) {
        totalRead++;
        if (m.postedAt && (!oldestPostedAt || m.postedAt < oldestPostedAt)) oldestPostedAt = m.postedAt;

        const msgId = parseInt(m.id, 10);
        if (!Number.isFinite(msgId)) continue;
        try {
          const procResult = await processMessage(
            source,
            `${username}_${m.id}`,
            m.text,
            m.url,
            m.postedAt,
            true,
          );
          if (procResult === "added") { stats.added++; stats.found++; }
          else if (procResult === "updated") { stats.found++; }
          else if (procResult === "duplicate") { stats.duplicates++; stats.found++; }
        } catch (e) {
          stats.errors++;
          logger.error(e, `scraper: msg ${m.id} @${username}`);
        }
        if (MESSAGE_PROCESS_DELAY_MS > 0) await sleep(MESSAGE_PROCESS_DELAY_MS);
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

      // Offset ilerlemese bile (boş metin batch) ham ID ile ilerle
      const nextOff = result.nextOffsetId > 0 ? result.nextOffsetId : currentOffset;
      if (nextOff === currentOffset && result.minIdInBatch > 0 && result.minIdInBatch < (currentOffset || Infinity)) {
        currentOffset = result.minIdInBatch;
    } else {
        currentOffset = nextOff;
      }

      const done = result.reachedCutoff
        || result.noMoreMessages
        || (cumulativeOldest != null && cumulativeOldest.getTime() <= Date.now() - INITIAL_SCAN_MS);

      stats.messagesRead = baseMessagesRead + totalRead;

      await patchSourceProgress(source.id, {
        lastCheckedAt: new Date(),
        initialScanOffsetId: currentOffset > 0 ? String(currentOffset) : source.initialScanOffsetId,
        initialScanAnchorId: anchorId > 0 ? String(anchorId) : source.initialScanAnchorId,
        initialScanTopId: newestId > 0 ? String(newestId) : source.initialScanTopId,
        initialScanOldestAt: cumulativeOldest,
        initialScanPhase: "backward",
        initialScanProgress: done ? 100 : currentProgress,
        initialScanDone: done,
        lastTelegramMessageId: newestId > 0 ? String(newestId) : source.lastTelegramMessageId,
        lastScanMessagesRead: baseMessagesRead + totalRead,
        lastScanFound: baseFound + stats.found,
        lastScanAdded: baseAdded + stats.added,
        lastScanDuplicates: baseDupes + stats.duplicates,
        lastScanErrors: baseErrors + stats.errors,
        lastScanPublished: stats.added,
        totalImported: (source.totalImported ?? 0) + stats.added,
        lastError: done
          ? (totalRead === 0 && stats.added === 0 ? "Kanalda gidebildiği kadar geçmişte işlenebilir metin ilanı bulunamadı." : null)
          : `Geriye tarama… en eski→yeni %${done ? 100 : currentProgress} (hedef ${INITIAL_SCAN_DAYS}g)`,
        isScanning: !done && page < BACKWARD_PAGES_PER_RUN - 1,
      });

      if (done) {
        logger.info(
          { username, newestId, totalRead, added: stats.added, reason: result.reachedCutoff ? `${INITIAL_SCAN_DAYS}g` : "end" },
          "scraper: ilk tarama tamam (geriye+işle, eski→yeni)",
        );
        await patchSourceProgress(source.id, { isScanning: false, initialScanProgress: 100, initialScanDone: true, lastError: null });
        return stats;
      }

      if (page < BACKWARD_PAGES_PER_RUN - 1) await sleep(300);
    }

    await patchSourceProgress(source.id, {
      isScanning: false,
      lastError: `Geriye tarama… en eski→yeni %${currentProgress} (hedef ${INITIAL_SCAN_DAYS}g, sonra yeni mesajlar)`,
    });
    return stats;
  }

  // ── Aşama 2 (eski forward) veya artımlı: yeni mesajları işle ──
  let messages: ChannelMessage[] = [];
  let noMoreMessages = false;

  try {
    const fetchOpts = isInitialScan && phase === "forward"
      ? { minMessageId: lastId, maxPages: PAGES_PER_CYCLE }
      : { minMessageId: lastId, maxPages: 15 };
    const result = await fetchWithReconnect(username, fetchOpts);
    messages = result.messages;
    noMoreMessages = result.noMoreMessages;
    if (result.notConnected) {
      await patchSourceProgress(source.id, { lastCheckedAt: new Date(), lastError: await telegramConnectionErrorMessage(), isScanning: false });
      return stats;
    }
    if (isInitialScan && phase === "forward") {
      anchorId = parseInt(source.initialScanAnchorId ?? "0", 10) || anchorId;
      topId = parseInt(source.initialScanTopId ?? "0", 10) || topId;
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (/FLOOD_WAIT|rate limit|wait of \d+ seconds/i.test(errMsg)) bumpScanBackoffOnRateLimit();
    if (!(await ensureTelegramConnected(5))) {
      await patchSourceProgress(source.id, { lastCheckedAt: new Date(), lastError: await telegramConnectionErrorMessage(), isScanning: false });
      return stats;
    }
    throw e;
  }

  if (messages.length === 0 && isInitialScan && !(await ensureTelegramConnected(5))) {
    await patchSourceProgress(source.id, {
      lastCheckedAt: new Date(),
      lastError: await telegramConnectionErrorMessage(),
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

  return stats;
}

/** Sıradaki tek Telegram kaynağını seç: önce ilk taraması bitmemiş (id sırası), kilitli olanları atla. */
function pickNextTelegramSource(
  telegramSources: Array<typeof sourcesTable.$inferSelect>,
): typeof sourcesTable.$inferSelect | null {
  const active = [...telegramSources.filter(s => s.active)].sort((a, b) => a.id - b.id);
  if (!active.length) return null;

  const incomplete = active.filter(s => !s.initialScanDone);
  if (incomplete.length > 0) {
    const now = Date.now();
    const free = incomplete.filter((s) => {
      if (!s.isScanning) return true;
      const t = s.lastCheckedAt?.getTime() ?? 0;
      return now - t > STALE_SCAN_LOCK_MS;
    });
    return (free[0] ?? incomplete[0]) ?? null;
  }

  const allDone = active.every(s => s.initialScanDone);
  if (allDone) {
    const oldest = [...active].sort(
      (a, b) => (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0),
    )[0];
    return oldest ?? null;
  }

  return active[0] ?? null;
}

/** "Sırada bekliyor" ile donmuş kuyruğu kurtar */
async function recoverStuckTelegramQueue(
  telegramSources: Array<typeof sourcesTable.$inferSelect>,
): Promise<void> {
  const incomplete = telegramSources.filter((s) => s.active && !s.initialScanDone);
  if (incomplete.length === 0) return;

  const now = Date.now();
  let forced = 0;
  for (const s of incomplete) {
    if (!s.isScanning) continue;
    const age = now - (s.lastCheckedAt?.getTime() ?? 0);
    if (age > STALE_SCAN_LOCK_MS || !s.lastCheckedAt) {
      await db.update(sourcesTable)
        .set({ isScanning: false })
        .where(eq(sourcesTable.id, s.id));
      forced++;
    }
  }
  if (forced > 0) {
    logger.warn({ forced }, "scraper: takılı Telegram kilitleri zorla açıldı");
  }

  const anyLive = incomplete.some((s) => {
    if (s.isScanning) return true;
    const t = s.lastCheckedAt?.getTime() ?? 0;
    return t > 0 && now - t < 120_000 && s.lastError !== "Sırada bekliyor…";
  });

  if (!anyLive) {
    await releaseStaleScanLocks(true);
    for (const s of incomplete) {
      if (s.lastError === "Sırada bekliyor…" || !s.lastError) {
        await patchSourceProgress(s.id, {
          lastError: "Kuyruk kurtarıldı — tarama başlıyor…",
          isScanning: false,
        });
      }
    }
    logger.warn({ count: incomplete.length }, "scraper: ölü Telegram kuyruğu kurtarıldı");
  }
}

function scheduleNextTelegramCycle(hasActiveTelegram: boolean, delayMs = INITIAL_BACKFILL_INTERVAL_MS): void {
  if (telegramScraperPaused) return;
  void hasIncompleteInitialScan().then((incomplete) => {
    if (incomplete) {
      setTimeout(() => {
        if (telegramScraperPaused) return;
        void runScraperCycle(true).catch((e) => logger.error(e, "scraper: chained cycle error"));
      }, delayMs);
    } else if (hasActiveTelegram) {
      setTimeout(() => {
        if (telegramScraperPaused) return;
        void runScraperCycle(true).catch((e) => logger.error(e, "scraper: incremental chain error"));
      }, INCREMENTAL_SOURCE_GAP_MS);
    }
  }).catch(() => {});
}

async function scanOneTelegramSource(
  source: typeof sourcesTable.$inferSelect,
  now: Date,
): Promise<{ added: number; errors: number; stillInitial: boolean }> {
  const username = extractTelegramUsername(source.url);
  const locked = await acquireSourceScanLock(source.id);
  if (!locked) {
    // Kilit alınamadı — zorla açmayı dene (takılma)
    await db.update(sourcesTable).set({ isScanning: false }).where(eq(sourcesTable.id, source.id));
    const retry = await acquireSourceScanLock(source.id);
    if (!retry) return { added: 0, errors: 0, stillInitial: !source.initialScanDone };
  }

  let cycleAdded = 0;
  let cycleErrors = 0;
  try {
    await patchSourceProgress(source.id, { lastError: `Taranıyor… @${username ?? "?"}`, isScanning: true });
    const stats = await checkTelegramSource(source);
    cycleAdded += stats.added;
    cycleErrors += stats.errors;
  } catch (e) {
    cycleErrors++;
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.warn(`scraper: telegram source ${source.id} (@${username ?? "?"}) failed: ${errMsg}`);
    await db.update(sourcesTable)
      .set({
        lastError: errMsg.slice(0, 500),
        lastCheckedAt: now,
        isScanning: false,
        lastScanErrors: (source.lastScanErrors ?? 0) + 1,
    })
    .where(eq(sourcesTable.id, source.id));
  } finally {
    await releaseSourceScanLock(source.id);
  }

  const fresh = await loadSourceById(source.id);
  return {
    added: cycleAdded,
    errors: cycleErrors,
    stillInitial: !!(fresh && !fresh.initialScanDone),
  };
}

async function scanTelegramSources(
  telegramSources: Array<typeof sourcesTable.$inferSelect>,
  _force: boolean,
): Promise<void> {
  await releaseStaleScanLocks();
  await recoverStuckTelegramQueue(telegramSources);
  const now = new Date();
  const hasActive = telegramSources.some(s => s.active);

  // Aynı döngüde en fazla 3 kaynak ilerle — kuyruk "Sırada bekliyor"da donmasın
  const maxPerCycle = 3;
  let scanned = 0;

  for (let n = 0; n < maxPerCycle; n++) {
    const live = await db.select().from(sourcesTable)
      .where(and(eq(sourcesTable.active, true), eq(sourcesTable.platform, "telegram")));
    const target = pickNextTelegramSource(live);
    if (!target) break;

    const waiting = live.filter(s => s.active && !s.initialScanDone && s.id !== target.id);
    for (const w of waiting) {
      await patchSourceProgress(w.id, { lastError: "Sırada bekliyor…" });
    }

    const fresh = await loadSourceById(target.id);
    if (!fresh?.active) break;

    if (fresh.isScanning) {
      const age = Date.now() - (fresh.lastCheckedAt?.getTime() ?? 0);
      if (age < STALE_SCAN_LOCK_MS) {
        logger.info(`scraper: kaynak #${fresh.id} kilitli, sıradakine geç`);
        await db.update(sourcesTable).set({ isScanning: false }).where(eq(sourcesTable.id, fresh.id));
      }
    }

    const username = extractTelegramUsername(fresh.url);
    const queueIndex = live.filter(s => s.active).sort((a, b) => a.id - b.id);
    const pos = queueIndex.findIndex(s => s.id === fresh.id) + 1;
    logger.info(
      `scraper: sıra → kaynak #${fresh.id} "${fresh.name}" @${username ?? "?"} ` +
      `(${pos}/${queueIndex.length}, ilk=${!fresh.initialScanDone}, %${fresh.initialScanProgress ?? 0}, offset=${fresh.initialScanOffsetId ?? "0"})`,
    );

    const result = await scanOneTelegramSource(fresh, now);
    scanned++;
    logger.info({ sourceId: fresh.id, ...result }, "scraper: döngü özeti (tek kaynak)");

    // Bu kaynak hâlâ ilk taramadaysa sonraki döngüde devam (rate limit)
    if (result.stillInitial) break;
  }

  emitRealtime("scraper:status", {
    telegramGramJsConnected: await ensureTelegramConnected(1),
    scanPhase: await getScanPhase(),
    effectiveScanIntervalMinutes: await getEffectiveScanIntervalMinutes(),
  });

  if (scanned > 0 || await hasIncompleteInitialScan()) {
    scheduleNextTelegramCycle(hasActive, await hasIncompleteInitialScan() ? 3_000 : INITIAL_BACKFILL_INTERVAL_MS);
  } else if (hasActive) {
    scheduleNextTelegramCycle(hasActive);
  }
}

async function publishElemanJob(
  source: typeof sourcesTable.$inferSelect,
  job: ElemanJobDetail,
): Promise<ProcessResult> {
  if (!job.phone?.trim()) return "skipped";
  if (!isSecurityJobPosting(job.rawText) && !isSecurityJobPosting(`${job.title}\n${job.description}`)) {
    return "skipped";
  }

  const externalId = `eleman_${job.id}`;
  const hash = createDuplicateHash(job.rawText);
  const now = new Date();
  const messageId = job.id;

  const existingBySource = await findListingBySourceMessage(source.id, messageId);
  if (existingBySource) {
    const structuredCity = job.locationDisplay ?? job.city;
    if (structuredCity) {
      const { assignCoordsFromCity } = await import("../lib/nearby-listings");
      await db.update(listingsTable)
        .set({
          city: structuredCity,
          lastSeenAt: now,
          lastCheckedAt: now,
          ...(job.postedAt ? { sourcePublishedAt: job.postedAt, publishedAt: job.postedAt } : {}),
          ...(assignCoordsFromCity(structuredCity) ?? {}),
        })
        .where(eq(listingsTable.id, existingBySource));
    } else {
      await db.update(listingsTable)
        .set({
          lastSeenAt: now,
          lastCheckedAt: now,
          ...(job.postedAt ? { sourcePublishedAt: job.postedAt, publishedAt: job.postedAt } : {}),
        })
        .where(eq(listingsTable.id, existingBySource));
    }
    return "duplicate";
  }

  if (await findDuplicateImported(hash, source.id, externalId)) return "duplicate";

  const duplicateListingId = await findDuplicateActiveListing(job.rawText, hash);
  if (duplicateListingId) {
    await touchListingSeen(duplicateListingId);
    return "duplicate";
  }

  const [seenExt] = await db.select({ id: importedPostsTable.id })
    .from(importedPostsTable)
    .where(and(
      eq(importedPostsTable.sourceId, source.id),
      eq(importedPostsTable.externalId, externalId),
    ))
    .limit(1);
  if (seenExt) return "duplicate";

  const [imported] = await db.insert(importedPostsTable).values({
    sourceId: source.id,
    platform: "eleman",
    externalId,
    rawText: job.rawText,
    sourceUrl: job.url,
    duplicateHash: hash,
    isJob: true,
    status: "pending",
  }).onConflictDoNothing().returning();
  if (!imported) return "duplicate";

  const jobCity = job.locationDisplay ?? job.city;
  const parsedCity = resolveListingCity(extractLocation(job.rawText));
  // Eleman.net'in yapılandırılmış il/ilçe alanı açıklamadaki servis/merkez adından daha güvenilir.
  const city = jobCity ?? parsedCity;
  const gender = extractGender(job.rawText);
  const contactPhones = extractPhoneNumbers(
    `${job.phone || ""}\n${job.description || ""}\n${job.rawText || ""}`,
  ).slice(0, 1);
  const cleanDescription = finalizeElemanListingText(
    job.description || job.rawText,
    contactPhones[0] || job.phone || "",
  );

  const postedAt = job.postedAt ?? now;
  const { assignCoordsFromCity } = await import("../lib/nearby-listings");
  const coords = assignCoordsFromCity(city);
  const { matchKnownCompany, matchKnownCompanyInBlob } = await import("../lib/known-companies");
  let companyName = job.companyName ?? "Belirtilmemiş";
  const brand =
    (await matchKnownCompany(companyName)) ||
    matchKnownCompanyInBlob(`${companyName} ${job.title} ${job.rawText}`);
  if (brand && (!job.companyName || companyName === "Belirtilmemiş")) companyName = brand.name;
  const [newListing] = await db.insert(listingsTable).values({
    title: job.title || "Güvenlik Personeli Aranıyor",
    company: companyName,
    city,
    salary: extractSalary(job.rawText) ?? undefined,
    workType: extractWorkType(job.rawText),
    description: cleanDescription,
    requirements: `Cinsiyet: ${gender ?? "Belirtilmemiş"}`,
    status: "active",
    isActive: true,
    autoDeleteOnExpiry: true,
    sourceId: source.id,
    messageId,
    sourceUrl: job.url,
    sourceTag: "eleman",
    sourceType: "bot_imported",
    sourceName: "Eleman.net",
    sourcePublishedAt: postedAt,
    verifiedPublisher: false,
    lastCheckedAt: now,
    applyUrl: formatTelApplyUrl(contactPhones),
    companyLogoUrl: brand?.logoUrl ?? null,
    publishedAt: postedAt,
    firstSeenAt: now,
    lastSeenAt: now,
    rawText: job.rawText,
    expiresAt: listingExpiryFrom(postedAt),
    ...(coords ?? {}),
  }).returning();
  if (!newListing) return "skipped";

  await db.update(importedPostsTable)
    .set({ status: "approved" })
    .where(eq(importedPostsTable.id, imported.id));

  void announceNewListing({
    id: newListing.id,
    title: newListing.title,
    city: newListing.city,
    company: newListing.company,
  }, { adminOnly: true, skipChat: true, sourceLabel: "Eleman.net" })
    .catch((err) => logger.error({ err }, "scraper: Eleman.net admin notify failed"));

  return "added";
}

async function checkElemanSource(source: typeof sourcesTable.$inferSelect): Promise<ScanStats> {
  const stats: ScanStats = { messagesRead: 0, found: 0, added: 0, duplicates: 0, errors: 0, maxId: 0 };
  const isInitialScan = !source.initialScanDone;
  const { cityIndex, page } = parseElemanCursor(source.initialScanOffsetId);
  const city = isInitialScan ? getElemanCityByIndex(cityIndex) : null;

  if (isInitialScan && !city) {
    await patchSourceProgress(source.id, {
      initialScanDone: true,
      initialScanProgress: 100,
      initialScanOffsetId: null,
      isScanning: false,
      lastCheckedAt: new Date(),
      lastError: null,
    });
    return stats;
  }

  await patchSourceProgress(source.id, {
    isScanning: true,
    lastError: isInitialScan
      ? `Eleman.net: ${city?.name ?? "?"} taranıyor…`
      : "Eleman.net: yeni ilanlar kontrol ediliyor…",
  });
  const jobs = await scrapeElemanCityPages(city?.slug ?? null, isInitialScan ? page : 1, 2);
  stats.messagesRead = jobs.length;

  for (const job of jobs) {
    try {
      const result = await publishElemanJob(source, job);
      if (result === "added") {
        stats.added++;
        stats.found++;
      } else if (result === "duplicate") {
        stats.duplicates++;
        stats.found++;
      }
    } catch (err) {
      stats.errors++;
      logger.warn({ err, sourceId: source.id, jobId: job.id }, "scraper: Eleman.net ilanı işlenemedi");
    }
  }

  const nextCityIndex = isInitialScan ? cityIndex + 1 : 0;
  const initialComplete = isInitialScan && nextCityIndex >= elemanCityCount();
  const progress = isInitialScan
    ? Math.min(100, Math.floor((nextCityIndex / elemanCityCount()) * 100))
    : 100;
  await patchSourceProgress(source.id, {
    lastCheckedAt: new Date(),
    initialScanDone: initialComplete || source.initialScanDone,
    initialScanProgress: initialComplete ? 100 : progress,
    initialScanOffsetId: isInitialScan && !initialComplete ? formatElemanCursor(nextCityIndex, 1) : null,
    lastScanMessagesRead: stats.messagesRead,
    lastScanFound: stats.found,
    lastScanAdded: stats.added,
    lastScanDuplicates: stats.duplicates,
    lastScanErrors: stats.errors,
    lastScanPublished: stats.added,
    totalImported: (source.totalImported ?? 0) + stats.added,
    isScanning: false,
    lastError: null,
  });
  return stats;
}

async function scanElemanSources(
  elemanSources: Array<typeof sourcesTable.$inferSelect>,
  force: boolean,
): Promise<void> {
  const now = Date.now();
  for (const source of elemanSources) {
    const intervalMs = (source.checkInterval ?? 30) * 60_000;
    const lastChecked = source.lastCheckedAt?.getTime() ?? 0;
    if (!force && source.initialScanDone && now - lastChecked < intervalMs) continue;
    if (source.isScanning || !(await acquireSourceScanLock(source.id))) continue;

    try {
      await checkElemanSource(source);
      const [fresh] = await db.select({ initialScanDone: sourcesTable.initialScanDone })
        .from(sourcesTable).where(eq(sourcesTable.id, source.id)).limit(1);
      if (fresh && !fresh.initialScanDone) {
        setTimeout(() => {
          void runScraperCycle(true).catch((e) => logger.error(e, "scraper: eleman chain error"));
        }, 8_000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err, sourceId: source.id }, "scraper: Eleman.net kaynak taraması başarısız");
      await patchSourceProgress(source.id, {
        lastCheckedAt: new Date(),
        lastError: message.slice(0, 500),
        lastScanErrors: (source.lastScanErrors ?? 0) + 1,
        isScanning: false,
      });
    } finally {
      await releaseSourceScanLock(source.id);
    }
  }
}

// ── Main scraper loop ──────────────────────────────────────────────
// Aynı anda iki tarama döngüsü çalışmasın (interval + manuel tetikleme yarışını önler).
let cycleRunning = false;
let cycleQueued = false;

async function runScraperCycle(force = false): Promise<void> {
  if (cycleRunning) {
    cycleQueued = true;
    return;
  }
  cycleRunning = true;
  try {
    do {
      cycleQueued = false;
    await runScraperCycleInner(force);
      force = true;
    } while (cycleQueued);
  } finally {
    cycleRunning = false;
  }
}

async function runScraperCycleInner(force = false): Promise<void> {
  await ensureTelegramConnected(5);
  await processBotUpdates();

  const sources = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.active, true));
  const now = new Date();

  // Telegram önce — ilk tarama sırasında Eleman uzun sürmesin diye zinciri kesmesin
  const telegramSources = sources.filter(s => s.platform === "telegram");
  if (telegramSources.length > 0 && !telegramScraperPaused) {
    await scanTelegramSources(telegramSources, force);
  } else if (telegramScraperPaused && telegramSources.length > 0) {
    logger.info("scraper: Telegram tarama duraklatıldı (admin)");
  }

  const whatsappSources = sources.filter(s => s.platform === "whatsapp");
  if (whatsappSources.length > 0) {
    await scanWhatsAppSources(whatsappSources, force);
  }

  // Telegram ilk tarama bitmeden Eleman'ı aynı döngüde bekletme (cycle kilidi)
  const tgInitialBusy = !telegramScraperPaused && await hasIncompleteInitialScan();
  if (!tgInitialBusy) {
    const elemanSources = sources.filter(s => s.platform === "eleman");
    if (elemanSources.length > 0) {
      await scanElemanSources(elemanSources, force);
    }
  }

  for (const source of sources) {
    if (source.platform === "telegram" || source.platform === "whatsapp" || source.platform === "eleman") continue;

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

async function checkWhatsAppSource(source: typeof sourcesTable.$inferSelect): Promise<ScanStats> {
  const stats: ScanStats = {
    messagesRead: 0, found: 0, added: 0, duplicates: 0, errors: 0,
    maxId: parseInt(source.lastTelegramMessageId ?? "0", 10) || 0,
  };

  if (!isWhatsAppReady()) {
    ensureWhatsAppAutoConnect();
    await patchSourceProgress(source.id, {
      lastError: whatsappNotReadyError(),
      isScanning: false,
      lastCheckedAt: new Date(),
    });
    return stats;
  }

  const groupJid = source.url?.trim();
  if (!groupJid || !(groupJid.includes("@g.us") || groupJid.includes("@newsletter") || groupJid.includes("@"))) {
    await patchSourceProgress(source.id, {
      lastError: "Geçersiz WhatsApp grup/kanal ID. Önce grup veya kanal kaydedin.",
      isScanning: false,
    });
    return stats;
  }

  const isChannel = groupJid.includes("@newsletter");
  const isInitialScan = !source.initialScanDone;
  const lastTs = parseInt(source.lastTelegramMessageId ?? "0", 10) || 0;

  await patchSourceProgress(source.id, {
    lastError: isInitialScan
      ? (isChannel
        ? "Kanal geçmişi yükleniyor (gidebildiği kadar, en eski→yeni)…"
        : "WhatsApp geçmişi yükleniyor (Chromium’un verdiği kadar, en eski→yeni)…")
      : null,
    isScanning: true,
    initialScanPhase: isInitialScan ? "backward" : null,
    initialScanProgress: isInitialScan ? Math.max(2, source.initialScanProgress ?? 1) : 100,
  });

  logger.info(
    { sourceId: source.id, name: source.name, initial: isInitialScan, lastTs, kind: isChannel ? "channel" : "group" },
    "scraper: whatsapp kaynak taraması başladı",
  );

  let messages;
  let reachedCutoff = false;
  let historyExhausted = false;
  let fetchRounds = 0;
  let oldestTs = Date.now();
  try {
    // İlk tarama: WA gidebildiği kadar (Chromium); TG ayrı 30g
    const fetched = await fetchWhatsAppMessagesDetailed(groupJid, isInitialScan
      ? { maxAgeDays: WA_INITIAL_SCAN_DAYS, deep: true }
      : { afterTimestampMs: Math.max(0, lastTs - WA_CURSOR_OVERLAP_MS), limit: 1000, deep: true });
    messages = fetched.messages;
    reachedCutoff = fetched.reachedCutoff;
    historyExhausted = fetched.historyExhausted;
    fetchRounds = fetched.rounds;
    oldestTs = fetched.oldestTs || Date.now();
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
    await patchSourceProgress(source.id, {
      lastError: errMsg.slice(0, 500),
      isScanning: false,
      lastCheckedAt: new Date(),
      lastScanErrors: (source.lastScanErrors ?? 0) + 1,
      initialScanDone: isInitialScan ? false : source.initialScanDone,
    });
    stats.errors++;
    return stats;
  }

  // İlk taramada 0 mesaj: done yapma — imleç korunur
  if (isInitialScan && messages.length === 0) {
    await patchSourceProgress(source.id, {
      lastError: "Bu turda mesaj çekilemedi — grup sıraya alındı, tekrar denenecek (geçmiş henüz yüklenmemiş olabilir).",
      isScanning: false,
      lastCheckedAt: new Date(),
      initialScanDone: false,
      initialScanProgress: Math.max(1, source.initialScanProgress ?? 1),
      lastScanMessagesRead: 0,
      lastScanFound: 0,
      lastScanAdded: 0,
    });
    logger.warn({ sourceId: source.id, name: source.name, lastTs, rounds: fetchRounds }, "scraper: wa 0 mesaj — imleç korundu, tekrar denenecek");
    return stats;
  }

  stats.messagesRead = messages.length;
  let maxTs = lastTs;
  let processed = 0;

  // Derinlik: en eski mesaj hedefe ne kadar yaklaştı; tükenince %100’e çekilir
  const depthMs = Math.max(0, Date.now() - oldestTs);
  const depthDays = Math.max(0, Math.round(depthMs / 86400000));
  const depthPct = Math.min(95, Math.max(5, Math.round((depthMs / WA_INITIAL_SCAN_MS) * 95)));
  let liveProgress = Math.max(Number(source.initialScanProgress ?? 1), depthPct);

  await patchSourceProgress(source.id, {
    lastError: isInitialScan && !reachedCutoff && !historyExhausted
      ? `Geçmiş yükleniyor… ${messages.length} mesaj · en eski ~${depthDays}g (gidebildiği kadar)`
      : null,
    initialScanPhase: isInitialScan ? "backward" : null,
    initialScanProgress: isInitialScan ? liveProgress : 100,
    lastScanMessagesRead: messages.length,
    initialScanOldestAt: Number.isFinite(oldestTs) ? new Date(oldestTs) : null,
  });

  // Mesajlar zaten eski→yeni sıralı; ilanları bu sırayla işle
  for (const m of messages) {
    if (m.timestamp > maxTs) maxTs = m.timestamp;
    try {
      const result = await processMessage(
        source,
        `wa_${m.id}`,
        m.text,
        `whatsapp://${groupJid}`,
        new Date(m.timestamp),
        isInitialScan,
      );
      if (result === "added") {
        stats.added++;
        stats.found++;
      } else if (result === "duplicate" || result === "updated") {
        stats.duplicates++;
        stats.found++;
      }
    } catch (e) {
      stats.errors++;
      logger.warn({ err: e, sourceId: source.id }, "scraper: wa message process error");
    }
    processed++;
    if (isInitialScan && processed % 10 === 0) {
      const batchPct = Math.min(99, Math.round((processed / Math.max(messages.length, 1)) * 100));
      liveProgress = Math.max(liveProgress, depthPct, Math.min(95, Math.round(batchPct * 0.85 + depthPct * 0.15)));
      await patchSourceProgress(source.id, {
        initialScanProgress: liveProgress,
        lastScanMessagesRead: processed,
        lastScanAdded: stats.added,
        lastScanFound: stats.found,
        lastScanDuplicates: stats.duplicates,
        lastTelegramMessageId: maxTs > 0 ? String(maxTs) : source.lastTelegramMessageId,
      });
    }
    await sleep(isInitialScan ? WA_MESSAGE_PROCESS_DELAY_MS : MESSAGE_PROCESS_DELAY_MS);
  }

  stats.maxId = maxTs;

  // 30g hedef; WA/Chromium yetmezse gidebildiği kadar (historyExhausted) → ilk tarama bitsin
  const markDone = !isInitialScan
    || reachedCutoff
    || historyExhausted
    || (messages.length > 0 && fetchRounds >= 20);

  liveProgress = markDone ? 100 : Math.min(95, Math.max(liveProgress, depthPct));

  await patchSourceProgress(source.id, {
    lastCheckedAt: new Date(),
    lastTelegramMessageId: maxTs > 0 ? String(maxTs) : source.lastTelegramMessageId,
    initialScanDone: markDone ? true : false,
    initialScanProgress: liveProgress,
    initialScanPhase: markDone ? null : "backward",
    isScanning: false,
    lastError: markDone
      ? null
      : `Geçmiş devam ediyor (en eski ~${depthDays}g, ${messages.length} mesaj, ${fetchRounds} tur). Sonraki turda devam.`,
    lastScanMessagesRead: messages.length,
    lastScanFound: stats.found,
    lastScanAdded: stats.added,
    lastScanDuplicates: stats.duplicates,
    lastScanErrors: stats.errors,
    lastScanPublished: stats.added,
    totalImported: (source.totalImported ?? 0) + stats.added,
    initialScanOldestAt: Number.isFinite(oldestTs) ? new Date(oldestTs) : null,
  });

  if (markDone && isInitialScan) {
    logger.info(
      {
        sourceId: source.id,
        name: source.name,
        reachedCutoff,
        historyExhausted,
        oldestDays: depthDays,
        messages: messages.length,
      },
      reachedCutoff
        ? `scraper: wa ilk tarama tamam (gidebildiği kadar)`
        : `scraper: wa ilk tarama tamam (gidebildiği kadar ~${depthDays}g, eski→yeni)`,
    );
  }

  logger.info(
    {
      sourceId: source.id,
      name: source.name,
      initial: isInitialScan,
      reachedCutoff,
      historyExhausted,
      markDone,
      rounds: fetchRounds,
      depthPct,
      liveProgress,
      oldestDays: depthDays,
      ...stats,
    },
    "scraper: whatsapp kaynak tarandı",
  );
  return stats;
}

/** Arka planda grup/kanalları sırayla gidebildiği kadar tara — tur tur round-robin. */
let waSequentialRunning = false;
let waScanGeneration = 0;

/** WhatsApp bağlanınca: aktif gruplara erişim + kaldığı yerden dinle (sıfırlama gerekmez) */
export function onWhatsAppReady(): void {
  logger.info("scraper: WhatsApp ready — gruplar erişime açılıyor, kaldığı yerden dinleniyor");
  void (async () => {
    try {
      const waSources = await db.select().from(sourcesTable)
        .where(and(eq(sourcesTable.platform, "whatsapp"), eq(sourcesTable.active, true)));
      for (const s of waSources) {
        await patchSourceProgress(s.id, {
          lastError: s.initialScanDone
            ? "Erişim sağlandı — kaldığı mesajdan dinleniyor"
            : "Erişim sağlandı — geçmiş gidebildiği kadar taranıyor",
          isScanning: false,
          lastCheckedAt: new Date(),
        });
      }
          await db.update(sourcesTable)
        .set({ status: "active" })
        .where(and(eq(sourcesTable.platform, "whatsapp"), eq(sourcesTable.active, true)));
    } catch (e) {
      logger.warn({ err: e }, "scraper: wa ready status update failed");
    }
    void runWhatsAppSequentialDeepScan();
    // Bitmiş gruplar için bir kez artımlı tarama (son mesajdan)
    try {
      await triggerWhatsAppScan();
    } catch (e) {
      logger.warn({ err: e }, "scraper: wa ready incremental kick failed");
    }
  })();
}

export function kickWhatsAppDeepScan(): void {
  void runWhatsAppSequentialDeepScan();
}

async function runWhatsAppSequentialDeepScan(): Promise<void> {
  const myGen = waScanGeneration;
  if (waSequentialRunning) return;
  waSequentialRunning = true;
  try {
    const emptyBySource = new Map<number, number>();
    let idleLoops = 0;
    for (;;) {
      if (myGen !== waScanGeneration) break;
      if (!isWhatsAppReady()) break;

      // En uzun süre taranmayan pending kaynak — böylece bir grupta takılmaz
      const pending = await db.select().from(sourcesTable)
        .where(and(
          eq(sourcesTable.active, true),
          eq(sourcesTable.platform, "whatsapp"),
          eq(sourcesTable.initialScanDone, false),
          eq(sourcesTable.isScanning, false),
        ))
        .orderBy(
          sql`COALESCE(${sourcesTable.lastCheckedAt}, to_timestamp(0)) ASC`,
          asc(sourcesTable.id),
        )
        .limit(1);

      const source = pending[0];
      if (!source) {
        // Takılı isScanning kilidi varsa açıp tekrar dene
        const stuck = await db.select({ id: sourcesTable.id }).from(sourcesTable)
          .where(and(
            eq(sourcesTable.active, true),
            eq(sourcesTable.platform, "whatsapp"),
            eq(sourcesTable.initialScanDone, false),
            eq(sourcesTable.isScanning, true),
          ))
          .limit(3);
        if (stuck.length > 0) {
          await releaseStaleScanLocks();
          idleLoops++;
          if (idleLoops > 12) {
            await releaseStaleScanLocks(true);
            idleLoops = 0;
          }
          await sleep(5_000);
          continue;
        }
        break;
      }
      idleLoops = 0;

      const locked = await acquireSourceScanLock(source.id);
      if (!locked) {
        await sleep(2_000);
        continue;
      }

      try {
        logger.info(
          { sourceId: source.id, name: source.name, lastCheckedAt: source.lastCheckedAt },
          "scraper: wa sıralı tarama — bu kaynak (round-robin)",
        );
        const stats = await checkWhatsAppSource(source);
        const [fresh] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, source.id)).limit(1);

        // lastCheckedAt checkWhatsAppSource içinde güncellenir → sıradaki turda başka kaynak seçilir
        if (fresh && !fresh.initialScanDone) {
          if ((stats.messagesRead ?? 0) === 0) {
            const n = (emptyBySource.get(source.id) ?? 0) + 1;
            emptyBySource.set(source.id, n);
            if (n >= 3) {
              logger.warn({ sourceId: source.id, emptyPasses: n }, "scraper: wa 3 boş tur — best-effort done");
              await patchSourceProgress(source.id, {
                initialScanDone: true,
                initialScanProgress: 100,
                initialScanPhase: null,
                lastError: "WhatsApp geçmişi sınırlı — gidebildiği kadar tamam. Yeni mesajlar artımlı taranacak.",
                lastCheckedAt: new Date(),
                isScanning: false,
              });
              emptyBySource.delete(source.id);
            }
        } else {
            emptyBySource.delete(source.id);
          }
        } else {
          emptyBySource.delete(source.id);
        }
        void stats;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.warn(`scraper: whatsapp source ${source.id} failed: ${errMsg}`);
          await db.update(sourcesTable)
          .set({
            lastError: errMsg.slice(0, 500),
            lastCheckedAt: new Date(),
            isScanning: false,
            initialScanDone: false,
            lastScanErrors: (source.lastScanErrors ?? 0) + 1,
          })
            .where(eq(sourcesTable.id, source.id));
      } finally {
        await releaseSourceScanLock(source.id);
      }

      if (myGen !== waScanGeneration) break;
      await sleep(WA_GROUP_GAP_MS);
    }
  } finally {
    if (myGen === waScanGeneration) waSequentialRunning = false;
    logger.info("scraper: wa sıralı derin tarama kuyruğu bitti");
  }
}

let waIncrementalRunning = false;

async function runWhatsAppIncrementalNow(): Promise<void> {
  if (waIncrementalRunning) return;
  waIncrementalRunning = true;
  try {
    const sources = await db.select().from(sourcesTable)
      .where(and(
        eq(sourcesTable.active, true),
        eq(sourcesTable.platform, "whatsapp"),
        eq(sourcesTable.initialScanDone, true),
      ))
      .orderBy(asc(sourcesTable.id));

    for (const source of sources) {
      if (source.isScanning) continue;
      const locked = await acquireSourceScanLock(source.id);
      if (!locked) continue;
      try {
        await checkWhatsAppSource(source);
      } catch (e) {
        logger.warn({ err: e, sourceId: source.id }, "scraper: wa incremental failed");
      } finally {
        await releaseSourceScanLock(source.id);
      }
      await sleep(5_000);
    }
  } finally {
    waIncrementalRunning = false;
  }
}

async function resetWhatsAppSourceState(sourceId: number): Promise<void> {
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
}

/** WhatsApp ilanlarını sil + gidebildiği kadar temiz tarama (Telegram Botları Sıfırla gibi). */
export async function resetAllWhatsAppSources(opts?: { deferRescan?: boolean }): Promise<{ deletedListings: number; pendingGroups: number }> {
  waScanGeneration++;
  waSequentialRunning = false;

  const waSources = await db.select().from(sourcesTable).where(eq(sourcesTable.platform, "whatsapp"));
  let deletedListings = 0;

  for (const s of waSources) {
    deletedListings += await deleteListingsForSource(s);
    await db.delete(importedPostsTable).where(eq(importedPostsTable.sourceId, s.id));
    await db.delete(pendingJobsTable).where(eq(pendingJobsTable.sourceId, s.id));
    await resetWhatsAppSourceState(s.id);
  }

  // Kaynağı silinmiş orphan WA ilanları
  const orphans = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(eq(listingsTable.sourceTag, "whatsapp"));
  if (orphans.length > 0) {
    deletedListings += await deleteListingsByIds(orphans.map((o) => o.id));
  }

  logger.info({ deletedListings, groups: waSources.length }, "scraper: WhatsApp sıfırlandı, gidebildiği kadar tarama başlıyor");

  if (!opts?.deferRescan && isWhatsAppReady() && waSources.some((s) => s.active)) {
    void runWhatsAppSequentialDeepScan();
  }

  return { deletedListings, pendingGroups: waSources.filter((s) => s.active).length };
}

/** Tek WA grubunu sıfırla + gidebildiği kadar yeniden tara. */
export async function resetSingleWhatsAppSource(sourceId: number): Promise<{ deletedListings: number }> {
  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, sourceId)).limit(1);
  if (!source) throw new Error("Kaynak bulunamadı");
  if (source.platform !== "whatsapp") throw new Error("Sadece WhatsApp kaynakları");

  waScanGeneration++;
  waSequentialRunning = false;

  const deletedListings = await deleteListingsForSource(source);
  await db.delete(importedPostsTable).where(eq(importedPostsTable.sourceId, sourceId));
  await db.delete(pendingJobsTable).where(eq(pendingJobsTable.sourceId, sourceId));
  await resetWhatsAppSourceState(sourceId);

  if (isWhatsAppReady() && source.active) {
    void runWhatsAppSequentialDeepScan();
  }
  return { deletedListings };
}

/** Şimdi Tara: bitmemiş ilk tarama varsa devam; bittiyse sadece yeni mesajlar. */
export async function triggerWhatsAppScan(): Promise<{
  scanned: number;
  ready: boolean;
  queued: boolean;
  mode: "initial" | "incremental";
  pendingGroups: number;
  currentGroup: string | null;
  results: Array<{ id: number; name: string; added: number; duplicates: number; messagesRead: number; found: number }>;
}> {
  if (!isWhatsAppReady()) {
    return { scanned: 0, ready: false, queued: false, mode: "incremental", pendingGroups: 0, currentGroup: null, results: [] };
  }

  const pending = await db.select({ id: sourcesTable.id, name: sourcesTable.name })
    .from(sourcesTable)
    .where(and(
      eq(sourcesTable.active, true),
      eq(sourcesTable.platform, "whatsapp"),
      eq(sourcesTable.initialScanDone, false),
    ))
    .orderBy(asc(sourcesTable.id));

  if (pending.length > 0) {
    void runWhatsAppSequentialDeepScan();
    return {
      scanned: 0,
      ready: true,
      queued: true,
      mode: "initial",
      pendingGroups: pending.length,
      currentGroup: pending[0]?.name ?? null,
      results: [],
    };
  }

  const all = await db.select({ id: sourcesTable.id, name: sourcesTable.name })
    .from(sourcesTable)
    .where(and(eq(sourcesTable.active, true), eq(sourcesTable.platform, "whatsapp")))
    .orderBy(asc(sourcesTable.id));

  void runWhatsAppIncrementalNow();

  return {
    scanned: 0,
    ready: true,
    queued: true,
    mode: "incremental",
    pendingGroups: all.length,
    currentGroup: all[0]?.name ?? null,
    results: [],
  };
}

async function scanWhatsAppSources(
  whatsappSources: Array<typeof sourcesTable.$inferSelect>,
  force: boolean,
): Promise<void> {
  if (whatsappSources.length === 0) return;

  if (!isWhatsAppReady()) {
    ensureWhatsAppAutoConnect();
    for (const s of whatsappSources) {
      await patchSourceProgress(s.id, {
        lastError: whatsappNotReadyError(),
        lastCheckedAt: new Date(),
      });
    }
    return;
  }

  // İlk tarama bitmemişse sıralı derin tarama; bittiyse artımlı devam
  const hasPendingInitial = whatsappSources.some((s) => !s.initialScanDone);
  if (hasPendingInitial) {
    void runWhatsAppSequentialDeepScan();
    return;
  }

  const now = Date.now();
  const ordered = [...whatsappSources].sort((a, b) => a.id - b.id);

  for (const source of ordered) {
    const intervalMin = 30;
    const intervalMs = intervalMin * 60 * 1000;
    const lastChecked = source.lastCheckedAt?.getTime() ?? 0;
    if (!force && now - lastChecked < intervalMs) continue;
    if (source.isScanning) continue;

    const locked = await acquireSourceScanLock(source.id);
    if (!locked) continue;

    try {
      // initialScanDone=true → sadece lastTs sonrası yeni mesajlar
      await checkWhatsAppSource(source);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.warn(`scraper: whatsapp source ${source.id} failed: ${errMsg}`);
      await db.update(sourcesTable)
        .set({
          lastError: errMsg.slice(0, 500),
          lastCheckedAt: new Date(),
          isScanning: false,
          lastScanErrors: (source.lastScanErrors ?? 0) + 1,
        })
        .where(eq(sourcesTable.id, source.id));
    } finally {
      await releaseSourceScanLock(source.id);
    }

    await sleep(Math.min(WA_GROUP_GAP_MS, 5_000));
  }
}

export async function triggerElemanScan(): Promise<{ sourceId: number; created: boolean }> {
  let [source] = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.platform, "eleman"))
    .orderBy(asc(sourcesTable.id))
    .limit(1);
  let created = false;

  if (!source) {
    [source] = await db.insert(sourcesTable).values({
      name: "Eleman.net",
      platform: "eleman",
      url: "https://www.eleman.net",
      active: true,
      status: "active",
      autoPublish: true,
      requireApproval: false,
      checkInterval: 30,
      initialScanDone: false,
      initialScanProgress: 0,
    }).returning();
    created = true;
  }

  if (!source) throw new Error("Eleman.net kaynağı oluşturulamadı");
  void runScraperCycle(true).catch((err) => logger.error({ err }, "scraper: Eleman.net manuel tarama hatası"));
  return { sourceId: source.id, created };
}

export async function resetAllElemanSources(opts?: { deferRescan?: boolean }): Promise<{ deletedListings: number; sources: number }> {
  let elemanSources = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.platform, "eleman"));

  if (elemanSources.length === 0) {
    const [created] = await db.insert(sourcesTable).values({
      name: "Eleman.net",
      platform: "eleman",
      url: "https://www.eleman.net",
      active: true,
      status: "active",
      autoPublish: true,
      requireApproval: false,
      checkInterval: 30,
      initialScanDone: false,
      initialScanProgress: 1,
      initialScanOffsetId: formatElemanCursor(0, 1),
    }).returning();
    if (created) elemanSources = [created];
  }

  let deletedListings = 0;

  for (const source of elemanSources) {
    deletedListings += await deleteListingsForSource(source);
    await db.delete(importedPostsTable).where(eq(importedPostsTable.sourceId, source.id));
    await db.delete(pendingJobsTable).where(eq(pendingJobsTable.sourceId, source.id));
  }

  const orphanListings = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(eq(listingsTable.sourceTag, "eleman"));
  deletedListings += await deleteListingsByIds(orphanListings.map((listing) => listing.id));

  if (elemanSources.length > 0) {
    await db.update(sourcesTable).set({
      lastCheckedAt: null,
      lastTelegramMessageId: null,
      initialScanOffsetId: formatElemanCursor(0, 1),
      initialScanDone: false,
      initialScanProgress: 1,
      initialScanPhase: "forward",
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
      active: true,
      status: "active",
      checkInterval: 30,
      autoPublish: true,
      requireApproval: false,
    }).where(eq(sourcesTable.platform, "eleman"));
  }

  logger.info({ deletedListings, sources: elemanSources.length }, "scraper: Eleman.net sıfırlandı, ilk tarama başlıyor");
  if (!opts?.deferRescan) {
    void runScraperCycle(true).catch((err) => logger.error({ err }, "scraper: Eleman.net sıfırlama tarama hatası"));
  }
  return { deletedListings, sources: elemanSources.length };
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
  // Sadece takılı isScanning kilidini aç — imleç/progress ASLA sıfırlanmaz (deploy sonrası kaldığı yerden devam)
  void releaseStaleScanLocks(true).then(async (n) => {
    if (n > 0) logger.info({ released: n }, "scraper: deploy sonrası scan kilitleri açıldı (imleçler korundu)");

    // Aktif kaynakları uyandır: bağlan uyarısı / takılı hata temizle (Sıfırla değil — imleç korunur)
    try {
      const active = await db.select({ id: sourcesTable.id, lastError: sourcesTable.lastError })
        .from(sourcesTable).where(eq(sourcesTable.active, true));
      for (const s of active) {
        const err = (s.lastError ?? "").toLowerCase();
        const soft = /bağlı değil|bağlanın|oturum yenilenemedi|yeniden bağlanıyor|erişim sağlandı/.test(err);
        await db.update(sourcesTable)
          .set({ isScanning: false, ...(soft ? { lastError: null } : {}) })
          .where(eq(sourcesTable.id, s.id));
      }
    } catch (e) {
      logger.warn({ err: e }, "scraper: soft lastError temizliği atlandı");
    }

    const rows = await db.select({
      id: sourcesTable.id,
      platform: sourcesTable.platform,
      name: sourcesTable.name,
      initialScanDone: sourcesTable.initialScanDone,
      initialScanOffsetId: sourcesTable.initialScanOffsetId,
      lastTelegramMessageId: sourcesTable.lastTelegramMessageId,
      initialScanProgress: sourcesTable.initialScanProgress,
    }).from(sourcesTable).where(eq(sourcesTable.active, true));
    for (const s of rows) {
      logger.info({
        id: s.id,
        platform: s.platform,
        name: s.name,
        done: s.initialScanDone,
        progress: s.initialScanProgress,
        offset: s.initialScanOffsetId,
        lastId: s.lastTelegramMessageId,
      }, "scraper: kaynak kaldığı yerden devam edecek");
    }
  });
  void ensureTelegramConnected(8).then((ok) => {
    logger.info(`scraper: GramJS ${ok ? "bağlı — kaldığı mesajdan devam" : "bağlı değil — Admin panelinden Telegram hesabı gerekli"}`);
  });
  ensureWhatsAppAutoConnect();
  void loadBotUpdateOffset();
  const mode = isClientConnected()
    ? "GramJS"
    : isBotTokenSet()
      ? "Bot API (GramJS bekleniyor)"
      : "GramJS bekleniyor";
  logger.info(`scraper: Telegram bot başlatıldı (${mode}, ${INITIAL_SCAN_DAYS}g ilk tarama, tamamlanınca gruplar 1dk arayla)`);

  void refreshScraperInterval();

  setInterval(() => {
    if (!isClientConnected()) void ensureTelegramConnected(5).catch(() => {});
    ensureWhatsAppAutoConnect();
  }, 5 * 60 * 1000);

  // Canlı dinleme kaçırsa bile her 30 dakikada tüm WhatsApp gruplarını
  // DB'de saklanan son mesaj zaman damgasından başlayarak sırayla kontrol et.
  setInterval(() => {
    if (!isWhatsAppReady()) {
      ensureWhatsAppAutoConnect();
      return;
    }
    void triggerWhatsAppScan().catch((error) => {
      logger.error({ err: error }, "scraper: 30dk WhatsApp taraması başarısız");
    });
  }, WA_INCREMENTAL_SCAN_INTERVAL_MS);

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
    try {
      await ensureTelegramConnected(8);
      ensureWhatsAppAutoConnect();
      await runScraperCycle();
    }
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

/** Mevcut aktif bot ilanlarından tam aynı kopyaları temizle (en eskisini koru). */
export async function ensureExactBotDeduplication(): Promise<void> {
  // Eski aynı-hash kayıtlarında ilkini koru; ardından eşzamanlı bot taramalarını
  // veritabanı seviyesinde de tekilleştir.
  await db.execute(sql`
    DELETE FROM imported_posts newer
    USING imported_posts older
    WHERE newer.duplicate_hash = older.duplicate_hash
      AND newer.id > older.id
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS imported_posts_duplicate_hash_uidx
    ON imported_posts (duplicate_hash)
  `);
}

export async function dedupeExistingListings(): Promise<{ removed: number; kept: number }> {
  const rows = await db.select({
    id: listingsTable.id,
    title: listingsTable.title,
    description: listingsTable.description,
    rawText: listingsTable.rawText,
    createdAt: listingsTable.createdAt,
  })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.status, "active"),
      eq(listingsTable.isActive, true),
      isNotNull(listingsTable.sourceTag),
    ))
    .orderBy(listingsTable.createdAt);

  const survivors: typeof rows = [];
  const seenHashes = new Set<string>();
  const toRemove: number[] = [];

  for (const row of rows) {
    const content = row.rawText ?? row.description ?? row.title ?? "";
    const hash = createDuplicateHash(content);
    if (seenHashes.has(hash)) {
      toRemove.push(row.id);
    } else {
      seenHashes.add(hash);
      survivors.push(row);
    }
  }

  const removed = await deleteListingsByIds(toRemove);
  logger.info({ removed, kept: survivors.length }, "scraper: çift ilanlar temizlendi");
  return { removed, kept: survivors.length };
}

/** Süresi dolan ilanları sil. Süre = siteye eklenme (firstSeenAt) + LISTING_TTL_DAYS (15). */
export async function purgeExpiredListings(): Promise<number> {
  const now = new Date();
  const days = LISTING_TTL_DAYS;

  // Bot ilanları 15 gün sitede kalır (tarama 30g / WA geçmişinden bağımsız)
  try {
    await db.execute(sql.raw(`
      UPDATE listings
      SET
        first_seen_at = COALESCE(first_seen_at, NOW()),
        expires_at = COALESCE(first_seen_at, NOW()) + INTERVAL '${days} days',
        auto_delete_on_expiry = true
      WHERE status = 'active'
        AND is_active = true
        AND (
          expires_at IS NULL
          OR first_seen_at IS NULL
          OR expires_at < COALESCE(first_seen_at, NOW()) + INTERVAL '${Math.max(1, days - 1)} days'
        )
    `));
  } catch (e) {
    logger.warn({ err: e }, "scraper: expiresAt düzeltmesi atlandı");
  }

  // Eleman çöp açıklamaları — bunlar süre değil, kalite; sil
  try {
    const junk = await db.select({ id: listingsTable.id })
      .from(listingsTable)
      .where(and(
        eq(listingsTable.sourceTag, "eleman"),
        sql`(
          ${listingsTable.description} ILIKE '%Arama Seçimleriniz%'
          OR ${listingsTable.description} ILIKE '%##### Şehir%'
          OR ${listingsTable.description} ILIKE '%Haritada Göster%'
          OR length(${listingsTable.description}) > 8000
        )`,
      ));
    if (junk.length > 0) {
      const n = await deleteListingsByIds(junk.map((r) => r.id));
      logger.info({ count: n }, "scraper: Eleman.net çöp ilanlar silindi");
    }
  } catch (e) {
    logger.warn({ err: e }, "scraper: eleman çöp temizliği atlandı");
  }

  // Sadece expiresAt gerçekten geçmiş olanları sil
  const toDeleteRows = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(
      isNotNull(listingsTable.expiresAt),
      lt(listingsTable.expiresAt, now),
      eq(listingsTable.autoDeleteOnExpiry, true),
    ));

  if (toDeleteRows.length === 0) return 0;
  const n = await deleteListingsByIds(toDeleteRows.map((r) => r.id));
  logger.info({ count: n }, "scraper: süresi dolan ilanlar silindi");
  return n;
}

/** Demo/sahte kaynaklı ilanları kalıcı sil */
export async function purgeDemoListings(): Promise<number> {
  try {
    const rows = await db.select({ id: listingsTable.id })
      .from(listingsTable)
      .where(eq(listingsTable.sourceTag, "demo"));
    if (rows.length === 0) return 0;
    const n = await deleteListingsByIds(rows.map((r) => r.id));
    logger.info({ count: n }, "scraper: demo ilanlar silindi");
    return n;
  } catch (e) {
    logger.warn({ err: e }, "scraper: demo ilan temizliği atlandı");
    return 0;
  }
}

/** @deprecated purgeExpiredListings kullanın */
export async function expireImportedListings(): Promise<number> {
  return purgeExpiredListings();
}

/** Tüm Telegram botlarını sıfırla: bot ilanlarını sil, sırayla 30 gün yeniden tara. */
export async function resetAllTelegramBots(opts?: { deferRescan?: boolean }): Promise<{ deletedListings: number }> {
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
  if (!opts?.deferRescan) await triggerRescan();
  return { deletedListings: totalDeleted };
}

/**
 * Telegram + WhatsApp + Eleman.net: sırayla ilanları sil, imleçleri sıfırla, yeniden tara.
 * WA bağlı değilse atlanır (oturumu bozmaz).
 */
export async function resetAllBotsAndRescan(): Promise<{
  telegramDeleted: number;
  whatsappDeleted: number;
  elemanDeleted: number;
  whatsappSkipped: boolean;
  message: string;
}> {
  await releaseStaleScanLocks(true);

  logger.info("scraper: TÜM BOTLAR sıfırlama başlıyor (TG → WA → Eleman)");

  // Önce hepsini sil/sıfırla (tarama tetiklemeden), sonra sırayla başlat
  const tg = await resetAllTelegramBots({ deferRescan: true });

  let whatsappDeleted = 0;
  let whatsappSkipped = true;
  if (isWhatsAppReady()) {
    whatsappSkipped = false;
    const wa = await resetAllWhatsAppSources({ deferRescan: true });
    whatsappDeleted = wa.deletedListings;
  } else {
    logger.warn("scraper: WhatsApp bağlı değil — WA sıfırlama atlandı (oturum korunur)");
  }

  const el = await resetAllElemanSources({ deferRescan: true });

  // Sıra: Telegram → WhatsApp → Eleman.net
  await triggerRescan();
  if (!whatsappSkipped) {
    void runWhatsAppSequentialDeepScan();
  }
  void runScraperCycle(true).catch((err) => logger.error({ err }, "scraper: Eleman.net global reset tarama hatası"));

  const parts = [
    `Telegram: ${tg.deletedListings} ilan silindi, yeniden taranıyor`,
    whatsappSkipped
      ? "WhatsApp: bağlı değil (önce QR ile bağlanın)"
      : `WhatsApp: ${whatsappDeleted} ilan silindi, gidebildiği kadar taranıyor`,
    `Eleman.net: ${el.deletedListings} ilan silindi, iller taranıyor (telefon zorunlu)`,
  ];

  return {
    telegramDeleted: tg.deletedListings,
    whatsappDeleted,
    elemanDeleted: el.deletedListings,
    whatsappSkipped,
    message: parts.join(". ") + ".",
  };
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
  await persistBotUpdateOffset(0);
  botOffsetLoaded = true;
  telegramScraperPaused = false;
  await runScraperCycle(true);
}

export function pauseTelegramScraper(): { paused: boolean } {
  telegramScraperPaused = true;
  void releaseStaleScanLocks(true);
  logger.info("scraper: Telegram tarama DURDURULDU (admin)");
  return { paused: true };
}

export function resumeTelegramScraper(): { paused: boolean } {
  telegramScraperPaused = false;
  logger.info("scraper: Telegram tarama BAŞLATILDI (admin)");
  void triggerRescan().catch((e) => logger.error(e, "scraper: resume trigger failed"));
  return { paused: false };
}

export function isTelegramScraperPaused(): boolean {
  return telegramScraperPaused;
}

// Tüm aktif ilanların şehirlerini açıklama/başlıktan yeniden ayıklar.
export async function reparseImportedListings(): Promise<{ total: number; updated: number }> {
  const rows = await db.select().from(listingsTable)
    .where(eq(listingsTable.isActive, true));

  let updated = 0;
  for (const row of rows) {
    const text = [row.title, row.description, row.requirements].filter(Boolean).join("\n");
    if (!text.trim()) continue;

    const newTitle = extractTitle(row.description || text);
    const explicitLocation = extractExplicitWorkLocation(text);
    const legacy = explicitLocation ?? extractLocation(text);
    const v2 = await maybeClassifyWithV2({
      jobId: row.id,
      title: row.title || newTitle,
      text,
      sourceName: row.sourceTag,
      sourceUrl: row.sourceUrl,
      legacy,
    });
    const newCity = explicitLocation ? resolveListingCity(explicitLocation) : v2.city;
    const newSalary = extractSalary(row.description || text);
    const newGender = extractGender(row.description || text);
    const newPhones = extractPhones(row.description || text).slice(0, 1);
    const newPhone = newPhones[0] ?? null;

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
      requirements,
    };
    // Sadece açıklamada net konum çıktıysa şehir güncelle (Türkiye/boş üzerine yaz)
    if (newCity && newCity !== "Türkiye") next.city = newCity;
    if (newTitle && newTitle.length >= 8) next.title = newTitle;
    if (newSalary) next.salary = newSalary;
    if (newPhones.length) next.applyUrl = formatTelApplyUrl(newPhones);
    else if (row.applyUrl && /t\.me\/|telegram\.me\//i.test(row.applyUrl)) next.applyUrl = null;

    const changed = (next.title !== undefined && next.title !== row.title)
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
