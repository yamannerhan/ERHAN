/** Çerçeveler kapalı — kimseye avatar çerçevesi verilmez. */
export function resolveChatCosmetics(user: {
  role?: string | null;
  isVip?: boolean | null;
  vipUntil?: Date | null;
  avatarFrame?: string | null;
  avatarFrameExpiresAt?: Date | null;
  chatBubble?: string | null;
  chatBubbleExpiresAt?: Date | null;
} | null | undefined): { avatarFrame: string; chatBubble: string } {
  if (!user) return { avatarFrame: "none", chatBubble: "default" };

  const now = Date.now();
  const vipActive = !!(user.isVip && (!user.vipUntil || user.vipUntil.getTime() > now));

  let bubble = user.chatBubble && user.chatBubble !== "" ? user.chatBubble : "default";
  if (user.chatBubbleExpiresAt && user.chatBubbleExpiresAt.getTime() < now) {
    bubble = vipActive ? "vip" : "default";
  } else if (vipActive && (bubble === "default" || bubble === "vip")) {
    bubble = "vip";
  }

  return { avatarFrame: "none", chatBubble: bubble };
}
