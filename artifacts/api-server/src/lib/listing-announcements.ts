import { db, chatMessagesTable, notificationsTable, usersTable } from "@workspace/db";
import { emitRealtime } from "./realtime";

type ListingAnnouncement = {
  id: number;
  title: string;
  city?: string | null;
  company?: string | null;
};

const BOT_USER_ID = 0;

function announcementText(listing: ListingAnnouncement): string {
  const location = listing.city ? ` · ${listing.city}` : "";
  const company = listing.company && listing.company !== "Belirtilmemiş" ? ` · ${listing.company}` : "";
  return `📢 Yeni ilan eklendi: ${listing.title}${location}${company}\n/ilan/${listing.id}`;
}

export async function announceNewListing(listing: ListingAnnouncement): Promise<void> {
  const linkUrl = `/ilan/${listing.id}`;
  const message = announcementText(listing);

  const [chatMsg] = await db.insert(chatMessagesTable).values({
    userId: BOT_USER_ID,
    content: message,
    isPinned: false,
    isDeleted: false,
  }).returning();

  const chatPayload = {
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
  };

  const users = await db.select({ id: usersTable.id }).from(usersTable);
  if (users.length > 0) {
    await db.insert(notificationsTable).values(users.map(user => ({
      userId: user.id,
      type: "listing",
      message: `Yeni ilan eklendi: ${listing.title}`,
      linkUrl,
      isRead: false,
    })));
  }

  emitRealtime("chat:message", chatPayload);
  emitRealtime("notification:new", {
    type: "listing",
    message: `Yeni ilan eklendi: ${listing.title}`,
    linkUrl,
    createdAt: new Date().toISOString(),
  });
}