/** Süresi dolmuş hediyeleri düşür; rol çerçevelerini uygula */
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

  // Rol zorunlu çerçeveler
  if (user.role === "admin") {
    return {
      avatarFrame: "admin",
      chatBubble: user.chatBubble && user.chatBubble !== "default" ? user.chatBubble : "admin",
    };
  }
  if (user.role === "moderator") {
    return {
      avatarFrame: "moderator",
      chatBubble: user.chatBubble && user.chatBubble !== "default" ? user.chatBubble : "mod",
    };
  }

  let frame = user.avatarFrame && user.avatarFrame !== "" ? user.avatarFrame : "none";
  if (user.avatarFrameExpiresAt && user.avatarFrameExpiresAt.getTime() < now) {
    frame = "none";
  }

  // VIP: VIP kaldırılana kadar vip çerçevesi (işveren admin ataması hariç)
  if (vipActive) {
    if (frame !== "employer") frame = "vip";
  } else if (frame === "vip") {
    frame = "none";
  }

  let bubble = user.chatBubble && user.chatBubble !== "" ? user.chatBubble : "default";
  if (user.chatBubbleExpiresAt && user.chatBubbleExpiresAt.getTime() < now) {
    bubble = vipActive ? "vip" : "default";
  } else if (vipActive && (bubble === "default" || bubble === "vip")) {
    bubble = "vip";
  }

  return { avatarFrame: frame, chatBubble: bubble };
}
