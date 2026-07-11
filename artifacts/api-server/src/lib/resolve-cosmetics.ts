import type { usersTable } from "@workspace/db";

/** Süresi dolmuş günlük balonu düşür */
export function resolveChatCosmetics(user: {
  avatarFrame?: string | null;
  chatBubble?: string | null;
  chatBubbleExpiresAt?: Date | null;
} | null | undefined): { avatarFrame: string; chatBubble: string } {
  if (!user) return { avatarFrame: "none", chatBubble: "default" };
  const frame = user.avatarFrame && user.avatarFrame !== "" ? user.avatarFrame : "none";
  let bubble = user.chatBubble && user.chatBubble !== "" ? user.chatBubble : "default";
  if (user.chatBubbleExpiresAt && user.chatBubbleExpiresAt.getTime() < Date.now()) {
    // Süreli hediye bitti — varsayılana dön (kalıcı level hediyesi expires null)
    bubble = "default";
  }
  return { avatarFrame: frame, chatBubble: bubble };
}

export type UserRow = typeof usersTable.$inferSelect;
