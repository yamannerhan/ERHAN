import crypto from "crypto";
import { db, sourcesTable, importedPostsTable, pendingJobsTable, listingsTable, adminSettingsTable } from "@workspace/db";
import { eq, and, isNotNull, lt, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getUpdates, isBotTokenSet, isClientConnected, fetchChannelMessages, PAGES_PER_CYCLE } from "../services/telegram-client";
import type { BotUpdate, ChannelMessage } from "../services/telegram-client";
import { extractSalary, extractGender, extractLocation, extractTitle, isSecurityJobPosting } from "../lib/job-parsing";
import type { ParsedLocation } from "../lib/job-parsing";
import { announceNewListing } from "../lib/listing-announcements";

// ── Keyword lists ──────────────────────────────────────────────────
const CHAT_SKIP_KEYWORDS = [
  "selam", "merhaba", "nasılsın", "iş var mı", "iş arıyorum",
  "özelden yaz", "teşekkür", "tamam", "günaydın", "iyi akşam",
  "kolay gelsin", "iyi günler",
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
  return targets.some((raw) => {
    const t = raw.trim().toLocaleLowerCase("tr-TR");
    if (!t) return false;
    return plain.includes(t) || cityNorm.includes(t) || t.includes(cityNorm)
      || displayNorm.includes(t) || t.includes(displayNorm);
  });
}

function createDuplicateHash(text: string, location: ParsedLocation, postedAt?: Date): string {
  const phone = extractPhone(text);
  const city = location.city ?? "";
  const dateKey = postedAt ? postedAt.toISOString().slice(0, 10) : "";
  const title = normalizeText(extractTitle(text) ?? "").slice(0, 80);
  const normalized = normalizeText(text).slice(0, 250);
  if (phone) {
    return crypto.createHash("sha256").update(`tel:${phone}|${city}|${dateKey}`).digest("hex");
  }
  return crypto.createHash("sha256").update(`${city}|${dateKey}|${title}|${normalized.slice(0, 100)}`).digest("hex");
}

// Aynı telefona sahip aktif ilan var mı? (gruplar arası çift kayıt engeli)
async function findActiveListingByPhone(phone: string): Promise<number | null> {
  const rows = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.applyUrl, `tel:${phone}`),
      eq(listingsTable.status, "active"),
    ))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function findDuplicateImported(hash: string, sourceId?: number, externalId?: string): Promise<boolean> {
  if (sourceId != null && externalId) {
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
const MAX_INITIAL_PAGES_TOTAL = 200;
const ALLOWED_SCAN_INTERVALS = [1, 5, 10, 30] as const;

let scanBackoffMinutes = 10;
let scraperIntervalHandle: ReturnType<typeof setInterval> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTelegramScanIntervalMinutes(): Promise<number> {
  try {
    const [row] = await db.select({ m: adminSettingsTable.telegramScanIntervalMinutes }).from(adminSettingsTable).limit(1);
    const configured = row?.m ?? 10;
    const base = ALLOWED_SCAN_INTERVALS.includes(configured as typeof ALLOWED_SCAN_INTERVALS[number])
      ? configured
      : 10;
    return Math.max(base, scanBackoffMinutes);
  } catch {
    return Math.max(10, scanBackoffMinutes);
  }
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

  const hash = createDuplicateHash(text, location, postedAt);
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

  const existingListingId = phone ? await findActiveListingByPhone(phone) : null;
  if (existingListingId) {
    await db.update(listingsTable).set({
      title: title ?? "Güvenlik Personeli Aranıyor",
      city,
      salary: salary ?? undefined,
      description: text,
      requirements: `Cinsiyet: ${gender ?? "Belirtilmemiş"}`,
      status: "active",
      isActive: true,
      updatedAt: now,
      lastSeenAt: now,
      sourceUrl,
      rawText: text,
      ...(postedAt ? { createdAt: postedAt, publishedAt: postedAt, expiresAt: listingExpiryFrom(postedAt) } : {}),
    }).where(eq(listingsTable.id, existingListingId));
    await db.update(importedPostsTable)
      .set({ status: "approved" })
      .where(eq(importedPostsTable.id, imported.id));
    return "updated";
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

async function checkTelegramSource(source: typeof sourcesTable.$inferSelect): Promise<ScanStats> {
  const stats: ScanStats = { messagesRead: 0, found: 0, added: 0, duplicates: 0, errors: 0, maxId: parseInt(source.lastTelegramMessageId ?? "0", 10) || 0 };
  const username = extractTelegramUsername(source.url);
  if (!username) {
    await db.update(sourcesTable)
      .set({ lastError: "Geçersiz Telegram kanal linki. Örnek: https://t.me/kanal_adi" })
      .where(eq(sourcesTable.id, source.id));
    return stats;
  }

  const lastId = parseInt(source.lastTelegramMessageId ?? "0", 10) || 0;
  const scanOffset = parseInt(source.initialScanOffsetId ?? "0", 10) || 0;
  const isInitialScan = !source.initialScanDone;

  logger.info(
    `scraper: @${username} ${isInitialScan
      ? `ilk tarama (${INITIAL_SCAN_DAYS}g, offset=${scanOffset})`
      : `yeni mesajlar (id>${lastId})`} gramjs=${isClientConnected()}`,
  );

  let messages: ChannelMessage[] = [];
  let reachedCutoff = false;
  let noMoreMessages = false;
  let nextOffsetId = scanOffset;
  const gramConnected = isClientConnected();

  try {
    if (gramConnected) {
      if (isInitialScan) {
        const seenIds = new Set<string>();
        let offset = scanOffset;
        let pagesTotal = 0;
        while (pagesTotal < MAX_INITIAL_PAGES_TOTAL) {
          const result = await fetchChannelMessages(username, {
            maxAgeDays: INITIAL_SCAN_DAYS,
            offsetId: offset,
            maxPages: PAGES_PER_CYCLE,
          });
          for (const m of result.messages) {
            if (!seenIds.has(m.id)) {
              seenIds.add(m.id);
              messages.push(m);
            }
          }
          reachedCutoff = result.reachedCutoff;
          noMoreMessages = result.noMoreMessages;
          nextOffsetId = result.nextOffsetId;
          pagesTotal += PAGES_PER_CYCLE;

          logger.info({
            username,
            batch: result.messages.length,
            total: messages.length,
            offset,
            nextOffsetId: result.nextOffsetId,
            reachedCutoff,
            noMoreMessages,
            pagesTotal,
          }, "scraper: ilk tarama sayfası");

          if (reachedCutoff || noMoreMessages) break;
          if (result.nextOffsetId <= 0 || result.nextOffsetId === offset) {
            noMoreMessages = true;
            break;
          }
          offset = result.nextOffsetId;
          await sleep(SOURCE_SCAN_DELAY_MS);
        }
      } else {
        const result = await fetchChannelMessages(username, { minMessageId: lastId });
        messages = result.messages;
        reachedCutoff = result.reachedCutoff;
        noMoreMessages = result.noMoreMessages;
        nextOffsetId = result.nextOffsetId;
      }
    } else {
      messages = await scrapeTelegramChannelFiltered(username, isInitialScan ? 0 : lastId, INITIAL_SCAN_DAYS);
      reachedCutoff = isInitialScan;
      noMoreMessages = true;
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (/FLOOD_WAIT|rate limit|wait of \d+ seconds/i.test(errMsg)) {
      bumpScanBackoffOnRateLimit();
    }
    throw e;
  }

  stats.messagesRead = messages.length;
  let maxId = lastId;

  for (const msg of messages) {
    const msgId = parseInt(msg.id, 10);
    if (!Number.isFinite(msgId)) continue;
    if (!isInitialScan && msgId <= lastId) continue;
    if (msgId > maxId) maxId = msgId;
    try {
      const result = await processMessage(
        source,
        `${username}_${msg.id}`,
        msg.text,
        msg.url,
        msg.postedAt,
        isInitialScan,
      );
      if (result === "added") { stats.added++; stats.found++; }
      else if (result === "updated") { stats.found++; }
      else if (result === "duplicate") { stats.duplicates++; stats.found++; }
    } catch (e) {
      stats.errors++;
      logger.error(e, `scraper: msg ${msg.id} @${username}`);
    }
  }

  stats.maxId = maxId;

  let oldestPostedAt: Date | undefined;
  for (const m of messages) {
    if (m.postedAt && (!oldestPostedAt || m.postedAt < oldestPostedAt)) {
      oldestPostedAt = m.postedAt;
    }
  }
  const cutoffDate = new Date(Date.now() - INITIAL_SCAN_MS);
  const channelOlderThanCutoff = oldestPostedAt != null && oldestPostedAt <= cutoffDate;
  const initialComplete = isInitialScan && (
    reachedCutoff ||
    (noMoreMessages && (messages.length === 0 || channelOlderThanCutoff))
  );

  await db.update(sourcesTable)
    .set({
      lastCheckedAt: new Date(),
      lastTelegramMessageId: initialComplete && maxId > lastId
        ? String(maxId)
        : (isInitialScan ? source.lastTelegramMessageId : (maxId > lastId ? String(maxId) : source.lastTelegramMessageId)),
      initialScanOffsetId: initialComplete ? null : (nextOffsetId > 0 ? String(nextOffsetId) : source.initialScanOffsetId),
      initialScanDone: initialComplete ? true : source.initialScanDone,
      lastScanPublished: stats.added,
      lastScanMessagesRead: stats.messagesRead,
      lastScanFound: stats.found,
      lastScanAdded: stats.added,
      lastScanDuplicates: stats.duplicates,
      lastScanErrors: stats.errors,
      totalImported: (source.totalImported ?? 0) + stats.added,
      lastError: messages.length === 0 && !gramConnected
        ? "Telegram hesabı bağlı değil — özel kanallar için admin panelden bağlayın."
        : null,
      isScanning: false,
    })
    .where(eq(sourcesTable.id, source.id));

  logger.info({
    source: source.name,
    username,
    messagesRead: stats.messagesRead,
    found: stats.found,
    added: stats.added,
    duplicates: stats.duplicates,
    errors: stats.errors,
    lastMessageId: maxId,
    initialComplete,
    nextOffsetId,
  }, `scraper: @${username} tarama özeti`);

  return stats;
}

async function scanTelegramSources(
  telegramSources: Array<typeof sourcesTable.$inferSelect>,
  force: boolean,
): Promise<void> {
  const now = new Date();
  const sorted = [...telegramSources].sort((a, b) => {
    if (!a.initialScanDone && b.initialScanDone) return -1;
    if (a.initialScanDone && !b.initialScanDone) return 1;
    return (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0);
  });

  let cycleAdded = 0;
  let cycleErrors = 0;

  for (const source of sorted) {
    if (source.isScanning) {
      logger.info(`scraper: kaynak #${source.id} "${source.name}" zaten taranıyor, atlandı`);
      continue;
    }

    const username = extractTelegramUsername(source.url);
    logger.info(`scraper: sıra → kaynak #${source.id} "${source.name}" @${username ?? "?"} (ilk=${!source.initialScanDone})`);

    const locked = await acquireSourceScanLock(source.id);
    if (!locked) continue;

    try {
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

    if (sorted.indexOf(source) < sorted.length - 1) {
      await sleep(SOURCE_SCAN_DELAY_MS);
    }
  }

  logger.info({ sources: sorted.length, cycleAdded, cycleErrors }, "scraper: döngü özeti");
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
  const mode = isClientConnected()
    ? "GramJS + web fallback"
    : isBotTokenSet()
      ? "Bot API + web fallback"
      : "web scraping only";
  logger.info(`scraper: Telegram bot başlatıldı (${mode}, ${INITIAL_SCAN_DAYS}g ilk tarama, tüm kaynaklar/döngü)`);

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

/** 30 günden eski otomatik içe aktarılan ilanları pasife al */
export async function expireImportedListings(): Promise<number> {
  const cutoff = new Date(Date.now() - INITIAL_SCAN_MS);
  const now = new Date();
  const expired = await db.update(listingsTable)
    .set({ status: "expired", isActive: false })
    .where(and(
      isNotNull(listingsTable.sourceTag),
      eq(listingsTable.status, "active"),
      or(
        lt(listingsTable.expiresAt, now),
        lt(sql`COALESCE(${listingsTable.publishedAt}, ${listingsTable.createdAt})`, cutoff),
      ),
    ))
    .returning({ id: listingsTable.id });
  if (expired.length > 0) {
    logger.info({ count: expired.length, cutoffDays: INITIAL_SCAN_DAYS }, "scraper: eski ilanlar pasife alındı");
  }
  return expired.length;
}

export async function triggerDeepRescan30Days(): Promise<void> {
  const telegramSources = await db.select({ id: sourcesTable.id }).from(sourcesTable).where(eq(sourcesTable.platform, "telegram"));
  const ids = telegramSources.map(s => s.id);
  if (ids.length > 0) {
    await db.delete(importedPostsTable).where(inArray(importedPostsTable.sourceId, ids));
  }
  await db.update(sourcesTable).set({
    initialScanDone: false,
    initialScanOffsetId: null,
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
