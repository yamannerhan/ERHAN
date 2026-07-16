import {
  db,
  listingsTable,
  importedPostsTable,
  whatsappProcessedMessagesTable,
  whatsappSourcesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  extractTitle,
  extractLocation,
  extractSalary,
  extractPhoneNumbers,
  extractGender,
  extractWorkType,
  extractCompany,
} from "../../lib/job-parsing";
import { createDuplicateHash } from "../../lib/job-dedup";
import { announceNewListing } from "../../lib/listing-announcements";
import { logger } from "../../lib/logger";
import { classifySecurityJob } from "./whatsapp.classifier.service";
import { addDays, contentHash, maskChatId, unixSecondsToDate } from "./whatsapp.client";
import { isMessageProcessed, markProcessed } from "./whatsapp.repository";
import { EXPIRE_DAYS, type ProcessResult } from "./whatsapp.types";

export async function processWhatsAppMessage(params: {
  sessionId: string;
  sourceId: number;
  chatId: string;
  chatName: string;
  legacySourceId: number;
  messageId: string;
  timestampSec: number;
  text: string;
}): Promise<{ result: ProcessResult; listingId?: number }> {
  const {
    sessionId, sourceId, chatId, chatName, legacySourceId,
    messageId, timestampSec, text,
  } = params;

  if (await isMessageProcessed(sessionId, chatId, messageId)) {
    return { result: "duplicate" };
  }

  const body = String(text ?? "").trim();
  if (!body) {
    await markProcessed({
      sessionId, chatId, messageId, timestampSec, result: "skipped",
      contentHash: null, jobPostingId: null,
    });
    return { result: "skipped" };
  }

  const classified = classifySecurityJob(body);
  if (!classified.isJobPosting) {
    await markProcessed({
      sessionId, chatId, messageId, timestampSec, result: "skipped",
      contentHash: contentHash(body), jobPostingId: null,
    });
    return { result: "skipped" };
  }

  const hash = contentHash(body);
  const dupHash = createDuplicateHash(body);

  const [hashDup] = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.contentHash, hash),
      eq(listingsTable.isActive, true),
      eq(listingsTable.status, "active"),
    ))
    .limit(1);
  if (hashDup) {
    await markProcessed({
      sessionId, chatId, messageId, timestampSec, result: "duplicate",
      contentHash: hash, jobPostingId: hashDup.id,
    });
    return { result: "duplicate", listingId: hashDup.id };
  }

  const [msgDup] = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.sourceMessageId, messageId),
      eq(listingsTable.sourceTag, "whatsapp"),
    ))
    .limit(1);
  if (msgDup) {
    await markProcessed({
      sessionId, chatId, messageId, timestampSec, result: "duplicate",
      contentHash: hash, jobPostingId: msgDup.id,
    });
    return { result: "duplicate", listingId: msgDup.id };
  }

  const publishedAt = unixSecondsToDate(timestampSec);
  const expiresAt = addDays(publishedAt, EXPIRE_DAYS);
  const now = new Date();
  const title = extractTitle(body);
  const location = extractLocation(body);
  const city = location?.city || classified.extractedFields.city || "Türkiye";
  const salary = extractSalary(body) || classified.extractedFields.salary;
  const phones = extractPhoneNumbers(body).slice(0, 1);
  const phoneField = phones[0] || classified.extractedFields.phone || null;
  const gender = extractGender(body);
  const workType = extractWorkType(body);
  const company = extractCompany(body, chatName);

  try {
    const { assignCoordsFromCity } = await import("../../lib/nearby-listings");
    const coords = assignCoordsFromCity(city);

    const listingId = await db.transaction(async (tx) => {
      await tx.insert(importedPostsTable).values({
        sourceId: legacySourceId,
        platform: "whatsapp",
        externalId: `${chatId}_${messageId}`,
        rawText: body,
        sourceUrl: `whatsapp://${chatId}`,
        duplicateHash: dupHash,
        isJob: true,
        status: "published",
      }).onConflictDoNothing();

      const [listing] = await tx.insert(listingsTable).values({
        title,
        company: company || "Belirtilmemiş",
        city,
        salary,
        workType: workType || "Tam Zamanlı",
        description: body,
        requirements: gender ? `Cinsiyet: ${gender}` : null,
        status: "active",
        isActive: true,
        applyUrl: phoneField ? `tel:+${phoneField}` : null,
        sourceTag: "whatsapp",
        sourceId: legacySourceId,
        messageId,
        sourceUrl: `whatsapp://${chatId}`,
        sourceType: "bot_imported",
        sourceName: chatName,
        sourcePublishedAt: publishedAt,
        publishedAt,
        firstSeenAt: now,
        lastSeenAt: now,
        lastCheckedAt: now,
        rawText: body,
        expiresAt,
        autoDeleteOnExpiry: true,
        contentHash: hash,
        sourceMessageId: messageId,
        sourceChatId: chatId,
        sourceMessageTimestamp: timestampSec * 1000,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        locationSource: coords?.locationSource ?? null,
      }).returning({ id: listingsTable.id });

      await tx.insert(whatsappProcessedMessagesTable).values({
        sessionId,
        chatId,
        messageId,
        messageTimestamp: timestampSec,
        result: "published",
        jobPostingId: listing.id,
        contentHash: hash,
      }).onConflictDoNothing();

      await tx.update(whatsappSourcesTable).set({
        latestScannedMessageId: messageId,
        latestScannedTimestamp: timestampSec,
        latestScannedAt: now,
        updatedAt: now,
      }).where(eq(whatsappSourcesTable.id, sourceId));

      return listing.id;
    });

    void announceNewListing(
      { id: listingId, title, city, company: company || "Belirtilmemiş" },
      { sourceLabel: "WhatsApp" },
    ).catch((err) => logger.warn({ err, listingId }, "wa: announce failed"));

    logger.info({
      sessionId,
      sourceId,
      chatId: maskChatId(chatId),
      operation: "publish_listing",
      postingCount: 1,
    }, "wa: listing published");

    return { result: "published", listingId };
  } catch (err) {
    logger.error({ err, sessionId, sourceId, chatId: maskChatId(chatId) }, "wa: publish failed");
    return { result: "error" };
  }
}
