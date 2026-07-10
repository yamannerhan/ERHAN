import { db, chatMessagesTable, notificationsTable, usersTable, adminSettingsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { emitRealtime } from "./realtime";

type ListingAnnouncement = {
  id: number;
  title: string;
  city?: string | null;
  company?: string | null;
};

export type AnnounceOptions = {
  /** true: sadece admin/moderatör bildirimi */
  adminOnly?: boolean;
  /** true: sohbet kanalına yazma */
  skipChat?: boolean;
  /** Admin bildirim metninde kaynak adı (WhatsApp / Eleman.net / …) */
  sourceLabel?: string;
};

const BOT_USER_ID = 0;

function announcementText(listing: ListingAnnouncement): string {
  const location = listing.city ? ` · ${listing.city}` : "";
  const company = listing.company && listing.company !== "Belirtilmemiş" ? ` · ${listing.company}` : "";
  return `📢 Yeni ilan eklendi: ${listing.title}${location}${company}\n/ilan/${listing.id}`;
}

export async function announceNewListing(
  listing: ListingAnnouncement,
  opts: AnnounceOptions = {},
): Promise<void> {
  const linkUrl = `/ilan/${listing.id}`;
  const message = announcementText(listing);
  const adminOnly = !!opts.adminOnly;
  const skipChat = opts.skipChat ?? adminOnly;
  const sourceLabel = opts.sourceLabel?.trim() || null;

  if (!skipChat) {
    const settings = await db.select({ chatAnnounceListings: adminSettingsTable.chatAnnounceListings })
      .from(adminSettingsTable).limit(1);
    const chatEnabled = settings[0]?.chatAnnounceListings !== false;

    if (chatEnabled) {
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
      emitRealtime("chat:message", chatPayload);
    }
  }

  const notifMessage = adminOnly
    ? `${sourceLabel ?? "Kaynak"} ilanı yayınlandı: ${listing.title}`
    : `Yeni ilan eklendi: ${listing.title}`;
  const notifType = adminOnly ? "admin_listing" : "listing";

  const users = adminOnly
    ? await db.select({ id: usersTable.id }).from(usersTable)
      .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "moderator")))
    : await db.select({ id: usersTable.id }).from(usersTable);

  if (users.length > 0) {
    await db.insert(notificationsTable).values(users.map(user => ({
      userId: user.id,
      type: notifType,
      message: notifMessage,
      linkUrl,
      isRead: false,
    })));
  }

  emitRealtime("notification:new", {
    type: notifType,
    message: notifMessage,
    linkUrl,
    adminOnly,
    createdAt: new Date().toISOString(),
  });
}
