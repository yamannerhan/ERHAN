import { db, whatsappSourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { compareMessages, isNewerThanCheckpoint } from "./whatsapp.client";
import { WhatsAppManager } from "./whatsapp.manager";
import { processWhatsAppMessage } from "./whatsapp.publisher.service";
import { advanceCheckpoint, getSourceById } from "./whatsapp.repository";
import {
  FETCH_PAGE_SIZE,
  MAX_INCREMENTAL_PAGES,
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

/** Checkpoint'ten yeni mesajlar — eskiden → yeniye. */
export async function runIncrementalScan(sourceId: number, sessionId = SESSION_ID) {
  const source = await getSourceById(sourceId);
  if (!source) throw new Error("Kaynak bulunamadı");
  if (!source.isEnabled) return { messagesRead: 0, published: 0, skipped: 0, duplicates: 0, errors: 0 };
  if (source.initialScanStatus !== "completed") {
    return { messagesRead: 0, published: 0, skipped: 0, duplicates: 0, errors: 0 };
  }
  if (!source.legacySourceId) throw new Error("legacySourceId eksik");

  const stats = { messagesRead: 0, published: 0, skipped: 0, duplicates: 0, errors: 0 };
  if (!WhatsAppManager.isConnected()) {
    throw new Error("WhatsApp bağlı değil — incremental tarama ertelendi");
  }
  const checkpoint = {
    messageId: source.latestScannedMessageId,
    timestamp: source.latestScannedTimestamp ?? null,
  };

  const chat = await WhatsAppManager.getChatById(source.chatId) as {
    fetchMessages: (opts: { limit: number }) => Promise<WaMessage[]>;
  };

  const collected = new Map<string, WaMessage>();
  let limit = FETCH_PAGE_SIZE;
  let pages = 0;
  let reachedCheckpoint = checkpoint.timestamp == null;

  while (pages < MAX_INCREMENTAL_PAGES && !reachedCheckpoint) {
    pages += 1;
    if (!WhatsAppManager.isConnected()) {
      throw new Error("WhatsApp bağlantısı tarama sırasında koptu");
    }
    const batch = await chat.fetchMessages({ limit });
    if (!batch.length) break;
    for (const m of batch) {
      const id = messageIdOf(m);
      if (!id || m.timestamp == null) continue;
      collected.set(id, m);
      if (
        checkpoint.timestamp != null
        && checkpoint.messageId
        && m.timestamp <= checkpoint.timestamp
        && (m.timestamp < checkpoint.timestamp || id === checkpoint.messageId)
      ) {
        reachedCheckpoint = true;
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
    .filter((m) => m.id && isNewerThanCheckpoint(m.timestamp, m.id, checkpoint))
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
    await advanceCheckpoint(sourceId, msg.id, msg.timestamp);
  }

  await db.update(whatsappSourcesTable).set({
    lastError: stats.errors ? "Incremental tarama kısmen hatalı" : null,
    updatedAt: new Date(),
  }).where(eq(whatsappSourcesTable.id, sourceId));

  return stats;
}
