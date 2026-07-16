import { db, chatMessagesTable, notificationsTable, usersTable, adminSettingsTable } from "@workspace/db";
import { emitRealtime } from "./realtime";

const BOT_USER_ID = 0;

type NewsAnnouncement = {
  id: number;
  title: string;
  slug: string;
};

/** İlk tarama sonrası yeni haberler — sohbet + bildirim + push */
export async function announceNewNews(article: NewsAnnouncement): Promise<void> {
  const linkUrl = `/haberler/${article.slug}`;
  const chatMessage = `📰 Yeni haber yayınlandı: ${article.title}\n${linkUrl}`;
  const userMessage = `Yeni haber yayınlandı: ${article.title}`;

  try {
    const settings = await db.select({ chatAnnounceListings: adminSettingsTable.chatAnnounceListings })
      .from(adminSettingsTable).limit(1);
    const chatEnabled = settings[0]?.chatAnnounceListings !== false;

    if (chatEnabled) {
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
    }
  } catch {
    /* sohbet opsiyonel */
  }

  try {
    const { getNotifPrefsMap, prefsAllowInAppType, DEFAULT_NOTIF_PREFS } = await import("./user-notif-prefs");
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
        message: userMessage,
        linkUrl,
        isRead: false,
      })));
    }
    emitRealtime("notification:new", {
      type: "news",
      message: userMessage,
      linkUrl,
      adminOnly: false,
      createdAt: new Date().toISOString(),
    });
  } catch {
    /* bildirim opsiyonel */
  }

  void import("./web-push").then((m) =>
    m.broadcastPush({
      title: "Yeni haber yayınlandı",
      body: article.title,
      url: linkUrl,
      tag: `news-${article.id}`,
      kind: "campaign",
    }),
  ).catch(() => undefined);
}
