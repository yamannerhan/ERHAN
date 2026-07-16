import { db, whatsappSourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import {
  compareMessages,
  daysAgoUnixSeconds,
  isMessageNewerThanCheckpoint,
  unixSecondsToDate,
} from "./checkpoint";
import { WhatsAppClientManager, maskChatId } from "./manager";
import { advanceCheckpoint, processWhatsAppMessage } from "./publisher";
import {
  DEFAULT_SESSION_ID,
  FETCH_PAGE_SIZE,
  INITIAL_SCAN_DAYS,
  MAX_INCREMENTAL_PAGES,
  MAX_INITIAL_PAGES,
} from "./types";

type WaMessage = {
  id?: { _serialized?: string } | string;
  timestamp?: number;
  body?: string;
  caption?: string;
  hasMedia?: boolean;
};

function messageIdOf(m: WaMessage): string | null {
  if (!m.id) return null;
  if (typeof m.id === "string") return m.id;
  return m.id._serialized ?? null;
}

function messageText(m: WaMessage): string {
  const body = String(m.body ?? "").trim();
  if (body) return body;
  return String(m.caption ?? "").trim();
}

async function fetchMessagesPage(chat: {
  fetchMessages: (opts: { limit: number; fromMe?: boolean }) => Promise<WaMessage[]>;
}, limit: number): Promise<WaMessage[]> {
  return chat.fetchMessages({ limit });
}

/**
 * İlk tarama: en fazla 15 gün geri (veya ulaşılabilen en eski),
 * sonra eskiden yeniye işle.
 */
export async function runInitialScan(sourceId: number, sessionId = DEFAULT_SESSION_ID): Promise<{
  messagesRead: number;
  published: number;
  skipped: number;
  duplicates: number;
  errors: number;
  oldestReachedAt: string | null;
}> {
  const [source] = await db.select().from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.id, sourceId)).limit(1);
  if (!source) throw new Error("Kaynak bulunamadı");
  if (!source.legacySourceId) throw new Error("legacySourceId eksik");

  const stats = { messagesRead: 0, published: 0, skipped: 0, duplicates: 0, errors: 0, oldestReachedAt: null as string | null };

  await db.update(whatsappSourcesTable).set({
    initialScanStatus: "running",
    initialScanStartedAt: source.initialScanStartedAt ?? new Date(),
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(whatsappSourcesTable.id, sourceId));

  const cutoffSec = daysAgoUnixSeconds(INITIAL_SCAN_DAYS);
  const started = Date.now();

  try {
    const chat = await WhatsAppClientManager.getChatById(source.chatId, sessionId) as {
      fetchMessages: (opts: { limit: number }) => Promise<WaMessage[]>;
    };

    const collected = new Map<string, WaMessage>();
    let previousOldestId: string | null = null;
    let pages = 0;
    let limit = FETCH_PAGE_SIZE;

    while (pages < MAX_INITIAL_PAGES) {
      pages += 1;
      let batch: WaMessage[];
      try {
        batch = await fetchMessagesPage(chat, limit);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/timeout|Execution context|Target closed|Protocol error/i.test(msg) && pages > 1) {
          logger.warn({ sourceId, err: msg, pages }, "wa: initial fetch stop (recoverable)");
          break;
        }
        throw err;
      }

      if (!batch.length) break;

      for (const m of batch) {
        const id = messageIdOf(m);
        if (!id || m.timestamp == null) continue;
        collected.set(id, m);
      }

      const oldest = [...collected.values()]
        .filter((m) => m.timestamp != null)
        .sort((a, b) => (a.timestamp! - b.timestamp!))[0];

      const oldestId = oldest ? messageIdOf(oldest) : null;
      const oldestTs = oldest?.timestamp ?? null;

      if (oldestTs != null && oldestTs <= cutoffSec) break;
      if (oldestId && oldestId === previousOldestId) break; // WhatsApp daha eski vermedi
      previousOldestId = oldestId;

      if (batch.length < limit) break; // history exhausted
      limit = Math.min(limit + FETCH_PAGE_SIZE, FETCH_PAGE_SIZE * 20);
    }

    const ordered = [...collected.values()]
      .map((m) => ({
        id: messageIdOf(m)!,
        timestamp: Number(m.timestamp),
        text: messageText(m),
        raw: m,
      }))
      .filter((m) => m.id && Number.isFinite(m.timestamp) && m.timestamp >= cutoffSec)
      .sort((a, b) => compareMessages(a, b));

    // 15 güne ulaşılamadıysa: eldeki en eski → yeni (cutoff filtresi zaten uygulamadıysa tümü)
    const toProcess = ordered.length > 0
      ? ordered
      : [...collected.values()]
        .map((m) => ({
          id: messageIdOf(m)!,
          timestamp: Number(m.timestamp),
          text: messageText(m),
          raw: m,
        }))
        .filter((m) => m.id && Number.isFinite(m.timestamp))
        .sort((a, b) => compareMessages(a, b));

    if (toProcess.length > 0) {
      const oldest = toProcess[0];
      stats.oldestReachedAt = unixSecondsToDate(oldest.timestamp).toISOString();
      await db.update(whatsappSourcesTable).set({
        oldestReachedAt: unixSecondsToDate(oldest.timestamp),
      }).where(eq(whatsappSourcesTable.id, sourceId));
    }

    for (const msg of toProcess) {
      stats.messagesRead += 1;
      try {
        const { result } = await processWhatsAppMessage({
          sessionId,
          sourceId,
          chatId: source.chatId,
          chatName: source.chatName,
          legacySourceId: source.legacySourceId,
          messageId: msg.id,
          timestampSec: msg.timestamp,
          text: msg.text,
        });
        if (result === "published") stats.published += 1;
        else if (result === "duplicate") stats.duplicates += 1;
        else if (result === "skipped") stats.skipped += 1;
        else stats.errors += 1;

        // Checkpoint: başarıyla işlenen (error hariç) mesajda ilerle
        if (result !== "error") {
          await advanceCheckpoint({
            sourceId,
            messageId: msg.id,
            timestampSec: msg.timestamp,
          });
        } else {
          // Hata: kaldığı noktadan devam için döngüyü kır
          throw new Error("message_process_error");
        }
      } catch (err) {
        if (err instanceof Error && err.message === "message_process_error") {
          await db.update(whatsappSourcesTable).set({
            lastError: "Mesaj işleme hatası — sonraki taramada devam",
            updatedAt: new Date(),
          }).where(eq(whatsappSourcesTable.id, sourceId));
          break;
        }
        stats.errors += 1;
        logger.warn({ err, sourceId, messageId: msg.id }, "wa: message process error");
        break;
      }
    }

    await db.update(whatsappSourcesTable).set({
      initialScanStatus: "completed",
      initialScanCompletedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(whatsappSourcesTable.id, sourceId));

    logger.info({
      sessionId,
      sourceId,
      chatId: maskChatId(source.chatId),
      operation: "initial_scan",
      durationMs: Date.now() - started,
      messageCount: stats.messagesRead,
      postingCount: stats.published,
    }, "wa: initial scan completed");

    return stats;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(whatsappSourcesTable).set({
      initialScanStatus: "failed",
      lastError: msg.slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(whatsappSourcesTable.id, sourceId));
    logger.error({
      err,
      sessionId,
      sourceId,
      chatId: maskChatId(source.chatId),
      operation: "initial_scan",
    }, "wa: initial scan failed");
    throw err;
  }
}

/**
 * Incremental: checkpoint'ten yeni mesajlar, eskiden yeniye.
 * 15 gün geriye gitmez; yalnızca checkpoint'e kadar pagination.
 */
export async function runIncrementalScan(sourceId: number, sessionId = DEFAULT_SESSION_ID): Promise<{
  messagesRead: number;
  published: number;
  skipped: number;
  duplicates: number;
  errors: number;
}> {
  const [source] = await db.select().from(whatsappSourcesTable)
    .where(eq(whatsappSourcesTable.id, sourceId)).limit(1);
  if (!source) throw new Error("Kaynak bulunamadı");
  if (!source.isEnabled) return { messagesRead: 0, published: 0, skipped: 0, duplicates: 0, errors: 0 };
  if (source.initialScanStatus !== "completed") {
    return { messagesRead: 0, published: 0, skipped: 0, duplicates: 0, errors: 0 };
  }
  if (!source.legacySourceId) throw new Error("legacySourceId eksik");

  const stats = { messagesRead: 0, published: 0, skipped: 0, duplicates: 0, errors: 0 };
  const checkpoint = {
    messageId: source.latestScannedMessageId,
    timestamp: source.latestScannedTimestamp ?? null,
  };

  const chat = await WhatsAppClientManager.getChatById(source.chatId, sessionId) as {
    fetchMessages: (opts: { limit: number }) => Promise<WaMessage[]>;
  };

  const collected = new Map<string, WaMessage>();
  let limit = FETCH_PAGE_SIZE;
  let pages = 0;
  let reachedCheckpoint = checkpoint.timestamp == null;

  while (pages < MAX_INCREMENTAL_PAGES && !reachedCheckpoint) {
    pages += 1;
    const batch = await fetchMessagesPage(chat, limit);
    if (!batch.length) break;
    for (const m of batch) {
      const id = messageIdOf(m);
      if (!id || m.timestamp == null) continue;
      collected.set(id, m);
      if (
        checkpoint.timestamp != null
        && checkpoint.messageId
        && m.timestamp <= checkpoint.timestamp
      ) {
        // Checkpoint mesajı veya daha eski görüldü
        if (m.timestamp < checkpoint.timestamp || id === checkpoint.messageId) {
          reachedCheckpoint = true;
        }
      }
    }
    if (reachedCheckpoint || batch.length < limit) break;
    limit = Math.min(limit + FETCH_PAGE_SIZE, FETCH_PAGE_SIZE * 10);
  }

  const newer = [...collected.values()]
    .map((m) => ({
      id: messageIdOf(m)!,
      timestamp: Number(m.timestamp),
      text: messageText(m),
    }))
    .filter((m) => m.id && isMessageNewerThanCheckpoint(m.timestamp, m.id, checkpoint))
    .sort((a, b) => compareMessages(a, b));

  for (const msg of newer) {
    stats.messagesRead += 1;
    const { result } = await processWhatsAppMessage({
      sessionId,
      sourceId,
      chatId: source.chatId,
      chatName: source.chatName,
      legacySourceId: source.legacySourceId,
      messageId: msg.id,
      timestampSec: msg.timestamp,
      text: msg.text,
    });
    if (result === "error") {
      stats.errors += 1;
      break;
    }
    if (result === "published") stats.published += 1;
    else if (result === "duplicate") stats.duplicates += 1;
    else stats.skipped += 1;

    await advanceCheckpoint({
      sourceId,
      messageId: msg.id,
      timestampSec: msg.timestamp,
    });
  }

  await db.update(whatsappSourcesTable).set({
    lastError: stats.errors ? "Incremental tarama kısmen hatalı" : null,
    updatedAt: new Date(),
  }).where(eq(whatsappSourcesTable.id, sourceId));

  return stats;
}
