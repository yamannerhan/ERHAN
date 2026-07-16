import { db, whatsappSourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import {
  compareMessages,
  daysAgoUnixSeconds,
  maskChatId,
  unixSecondsToDate,
} from "./whatsapp.client";
import { WhatsAppManager } from "./whatsapp.manager";
import { processWhatsAppMessage } from "./whatsapp.publisher.service";
import { advanceCheckpoint, getSourceById } from "./whatsapp.repository";
import {
  FETCH_PAGE_SIZE,
  HISTORY_DAYS,
  MAX_INITIAL_PAGES,
  SESSION_ID,
} from "./whatsapp.types";

type WaMessage = {
  id?: { _serialized?: string } | string;
  timestamp?: number;
  body?: string;
  caption?: string;
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

/** İlk tarama: max HISTORY_DAYS geri, eskiden → yeniye. */
export async function runInitialScan(sourceId: number, sessionId = SESSION_ID) {
  const source = await getSourceById(sourceId);
  if (!source) throw new Error("Kaynak bulunamadı");
  if (!source.legacySourceId) throw new Error("legacySourceId eksik");

  const stats = {
    messagesRead: 0, published: 0, skipped: 0, duplicates: 0, errors: 0,
    oldestReachedAt: null as string | null,
  };

  await db.update(whatsappSourcesTable).set({
    initialScanStatus: "running",
    initialScanStartedAt: source.initialScanStartedAt ?? new Date(),
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(whatsappSourcesTable.id, sourceId));

  const cutoffSec = daysAgoUnixSeconds(HISTORY_DAYS);
  const started = Date.now();

  try {
    const chat = await WhatsAppManager.getChatById(source.chatId) as {
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
        batch = await chat.fetchMessages({ limit });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/timeout|Execution context|Target closed|Protocol error|Store/i.test(msg) && pages > 1) {
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
        .sort((a, b) => a.timestamp! - b.timestamp!)[0];
      const oldestId = oldest ? messageIdOf(oldest) : null;
      const oldestTs = oldest?.timestamp ?? null;

      if (oldestTs != null && oldestTs <= cutoffSec) break;
      if (oldestId && oldestId === previousOldestId) break;
      previousOldestId = oldestId;
      if (batch.length < limit) break;
      limit = Math.min(limit + FETCH_PAGE_SIZE, FETCH_PAGE_SIZE * 20);
    }

    const ordered = [...collected.values()]
      .map((m) => ({
        id: messageIdOf(m)!,
        timestamp: Number(m.timestamp),
        text: messageText(m),
      }))
      .filter((m) => m.id && Number.isFinite(m.timestamp) && m.timestamp >= cutoffSec)
      .sort((a, b) => compareMessages(a, b));

    const toProcess = ordered.length > 0
      ? ordered
      : [...collected.values()]
        .map((m) => ({
          id: messageIdOf(m)!,
          timestamp: Number(m.timestamp),
          text: messageText(m),
        }))
        .filter((m) => m.id && Number.isFinite(m.timestamp))
        .sort((a, b) => compareMessages(a, b));

    if (toProcess.length > 0) {
      stats.oldestReachedAt = unixSecondsToDate(toProcess[0].timestamp).toISOString();
      await db.update(whatsappSourcesTable).set({
        oldestReachedAt: unixSecondsToDate(toProcess[0].timestamp),
      }).where(eq(whatsappSourcesTable.id, sourceId));
    }

    for (const msg of toProcess) {
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
      if (result === "published") stats.published += 1;
      else if (result === "duplicate") stats.duplicates += 1;
      else if (result === "skipped") stats.skipped += 1;
      else {
        stats.errors += 1;
        await db.update(whatsappSourcesTable).set({
          lastError: "Mesaj işleme hatası — sonraki taramada devam",
          updatedAt: new Date(),
        }).where(eq(whatsappSourcesTable.id, sourceId));
        break;
      }
      await advanceCheckpoint(sourceId, msg.id, msg.timestamp);
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
    logger.error({ err, sessionId, sourceId, chatId: maskChatId(source.chatId) }, "wa: initial scan failed");
    throw err;
  }
}
