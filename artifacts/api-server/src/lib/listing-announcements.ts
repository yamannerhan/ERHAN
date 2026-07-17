import { db, chatMessagesTable, notificationsTable, usersTable, adminSettingsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { emitRealtime } from "./realtime";
import { stripListingSourceLabels } from "./strip-listing-source";

type ListingAnnouncement = {
  id: number;
  title: string;
  city?: string | null;
  company?: string | null;
};

export type AnnounceOptions = {
  /** true: yalnızca admin/moderatör bildirimi (kullanıcıya / sohbete gitmez) */
  adminOnly?: boolean;
  /** true: sohbet kanalına yazma */
  skipChat?: boolean;
  /** Yalnızca admin bildirim metninde kaynak adı */
  sourceLabel?: string;
};

/** Admin bildirimlerinde görünen kısa kaynak adı (kullanıcıya yazılmaz) */
export function announceSourceLabel(platform: string | null | undefined): string {
  switch ((platform || "").toLowerCase()) {
    case "url_pool": return "Link";
    case "telegram": return "Telegram";
    case "whatsapp": return "WhatsApp";
    case "eleman": return "Eleman.net";
    case "demo": return "Demo";
    default: return (platform || "Bot").trim() || "Bot";
  }
}

const BOT_USER_ID = 0;

/** Sohbet + kullanıcı bildirimi — kaynak adı asla yazılmaz */
function publicAnnouncementText(listing: ListingAnnouncement, authorName?: string | null): string {
  const location = listing.city ? ` · ${listing.city}` : "";
  const company = listing.company && listing.company !== "Belirtilmemiş" ? ` · ${listing.company}` : "";
  const who = (authorName || "").trim();
  const raw = who
    ? `📢 ${who} yeni ilan paylaştı: ${listing.title}${location}${company}\n/ilan/${listing.id}`
    : `📢 Yeni ilan eklendi: ${listing.title}${location}${company}\n/ilan/${listing.id}`;
  return stripListingSourceLabels(raw);
}

export async function announceNewListing(
  listing: ListingAnnouncement,
  opts: AnnounceOptions & { authorName?: string | null } = {},
): Promise<void> {
  const linkUrl = `/ilan/${listing.id}`;
  let adminOnly = !!opts.adminOnly;

  // Herhangi bir bot ilk taramadaysa kullanıcıya asla bildirim/sohbet/push gitmez
  try {
    const { isUserListingAnnounceGloballyMuted } = await import("./bot-public-announce");
    if (await isUserListingAnnounceGloballyMuted()) {
      adminOnly = true;
    }
  } catch { /* ignore */ }

  const skipChat = opts.skipChat ?? adminOnly;
  const sourceLabel = opts.sourceLabel?.trim() || null;
  const authorName = (opts.authorName || "").trim();
  const publicMessage = publicAnnouncementText(listing, authorName);

  // Canlı sohbet: yalnızca kaynak-siz metin (bot ilanları genelde skipChat)
  if (!skipChat && !adminOnly) {
    const settings = await db.select({ chatAnnounceListings: adminSettingsTable.chatAnnounceListings })
      .from(adminSettingsTable).limit(1);
    const chatEnabled = settings[0]?.chatAnnounceListings !== false;

    if (chatEnabled) {
      const [chatMsg] = await db.insert(chatMessagesTable).values({
        userId: BOT_USER_ID,
        content: publicMessage,
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
  }

  const { getNotifPrefsMap, prefsAllowInAppType, DEFAULT_NOTIF_PREFS } = await import("./user-notif-prefs");

  // Kullanıcı bildirimi — kaynak yok
  if (!adminOnly) {
    const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
    const prefsMap = await getNotifPrefsMap(allUsers.map((u) => u.id));
    const recipients = allUsers.filter((u) => {
      const prefs = prefsMap.get(u.id) ?? DEFAULT_NOTIF_PREFS;
      return prefsAllowInAppType(prefs, "listing");
    });
    const userMessage = stripListingSourceLabels(
      authorName
        ? `${authorName} yeni ilan paylaştı: ${listing.title}`
        : `Yeni ilan eklendi: ${listing.title}`,
    );
    if (recipients.length > 0) {
      await db.insert(notificationsTable).values(recipients.map((user) => ({
        userId: user.id,
        type: "listing",
        message: userMessage,
        linkUrl,
        isRead: false,
      })));
    }
    emitRealtime("notification:new", {
      type: "listing",
      message: userMessage,
      linkUrl,
      adminOnly: false,
      createdAt: new Date().toISOString(),
    });
    // Kaynak adı olmadan normal site bildirimi gibi push
    void import("./web-push").then((m) =>
      m.maybePushNewListing({
        id: listing.id,
        title: listing.title,
        city: listing.city,
        authorName: authorName || null,
      }),
    ).catch(() => undefined);
  }

  // Admin/mod — kaynak adı yalnızca burada
  if (adminOnly || sourceLabel) {
    const adminMessage = sourceLabel
      ? `${sourceLabel} ilanı yayınlandı: ${listing.title}`
      : `Yeni ilan eklendi: ${listing.title}`;
    const staff = await db.select({ id: usersTable.id }).from(usersTable)
      .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "moderator")));
    const prefsMap = await getNotifPrefsMap(staff.map((u) => u.id));
    const recipients = staff.filter((u) => {
      const prefs = prefsMap.get(u.id) ?? DEFAULT_NOTIF_PREFS;
      return prefsAllowInAppType(prefs, "admin");
    });
    if (recipients.length > 0) {
      await db.insert(notificationsTable).values(recipients.map((user) => ({
        userId: user.id,
        type: "admin_listing",
        message: adminMessage,
        linkUrl,
        isRead: false,
      })));
    }
    emitRealtime("notification:new", {
      type: "admin_listing",
      message: adminMessage,
      linkUrl,
      adminOnly: true,
      createdAt: new Date().toISOString(),
    });
  }
}
