import { db, chatMessagesTable, notificationsTable, usersTable } from "@workspace/db";
import { emitRealtime } from "../lib/realtime";

const BOT_USER_ID = 0;

/** İlk tarama sonrası yeni haber: sohbet + kullanıcı bildirimi */
export async function announceNewNews(article: {
  id: number;
  title: string;
  slug: string;
}): Promise<void> {
  const linkUrl = `/haberler/${article.slug}`;
  const chatMessage = `📰 Yeni haber yayınlandı: ${article.title}\n${linkUrl}`;
  const notifMessage = `Yeni haber yayınlandı: ${article.title}`;

  try {
    const [chatMsg] = await db.insert(chatMessagesTable).values({
      userId: BOT_USER_ID,
      content: chatMessage,
      isPinned: false,
      isDeleted: false,
    }).returning();

    emitRealtime("chat:message", {
      id: chatMsg.id,
      content: chatMsg.content,
      userId: BOT_USER_ID,
      username: "GuvenlikBot",
      displayName: "GuvenlikBot",
      userAvatarUrl: null,
      userNameColor: "#22d3ee",
      userNameAnimated: true,
      userRole: "bot",
      isBot: true,
      replyToId: null,
      replyToUsername: null,
      replyToContent: null,
      isPinned: false,
      isDeleted: false,
      reactions: [],
      createdAt: chatMsg.createdAt.toISOString(),
    });
  } catch {
    /* sohbet hatası duyuruyu tamamen engellemesin */
  }

  try {
    const { getNotifPrefsMap, prefsAllowInAppType, DEFAULT_NOTIF_PREFS } = await import("../lib/user-notif-prefs");
    const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
    const prefsMap = await getNotifPrefsMap(allUsers.map((u) => u.id));
    const recipients = allUsers.filter((u) => {
      const prefs = prefsMap.get(u.id) ?? DEFAULT_NOTIF_PREFS;
      return prefsAllowInAppType(prefs, "news");
    });
    if (recipients.length > 0) {
      await db.insert(notificationsTable).values(recipients.map((user) => ({
        userId: user.id,
        type: "news",
        message: notifMessage,
        linkUrl,
        isRead: false,
      })));
    }
    emitRealtime("notification:new", {
      type: "news",
      message: notifMessage,
      linkUrl,
      adminOnly: false,
      createdAt: new Date().toISOString(),
    });
  } catch {
    /* bildirim hatası yok say */
  }
}
