import { db, chatMessagesTable } from "@workspace/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { logger } from "./logger";

export const CHAT_HISTORY_LIMIT = 200;

/** Katılım, bot ve üye mesajları dahil yalnızca en yeni 200 görünür kaydı tutar. */
export async function trimChatHistory(): Promise<void> {
  try {
    const kept = await db
      .select({ id: chatMessagesTable.id })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.isDeleted, false))
      .orderBy(desc(chatMessagesTable.createdAt), desc(chatMessagesTable.id))
      .limit(CHAT_HISTORY_LIMIT);

    if (kept.length >= CHAT_HISTORY_LIMIT) {
      const minId = Math.min(...kept.map((row) => row.id));
      await db.delete(chatMessagesTable)
        .where(and(eq(chatMessagesTable.isDeleted, false), lt(chatMessagesTable.id, minId)));
    }

    await db.delete(chatMessagesTable).where(and(
      eq(chatMessagesTable.isDeleted, true),
      lt(chatMessagesTable.createdAt, new Date(Date.now() - 2 * 24 * 3600 * 1000)),
    ));
  } catch (error) {
    logger.error(error, "trimChatHistory error");
  }
}
