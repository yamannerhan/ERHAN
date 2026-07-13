/** Lite modda zil sayacına dahil edilen bildirim türleri */
const LITE_NOTIF_TYPES = new Set(["listing", "admin_listing", "admin", "system"]);

export type LiteNotifRow = {
  id?: number;
  type?: string | null;
  isRead?: boolean;
  linkUrl?: string | null;
};

export function isLiteListingNotif(type: string | null | undefined): boolean {
  return LITE_NOTIF_TYPES.has(type ?? "");
}

export function countLiteUnread(list: LiteNotifRow[]): number {
  return list.filter((n) => !n.isRead && isLiteListingNotif(n.type)).length;
}

export function findFirstLiteUnread(list: LiteNotifRow[]): LiteNotifRow | undefined {
  return list.find((n) => !n.isRead && isLiteListingNotif(n.type) && n.linkUrl);
}
