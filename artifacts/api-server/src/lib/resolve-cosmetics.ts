/** Süresi dolmuş hediyeleri düşür; varsayılan çerçevede halka yok */
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
  const role = user.role ?? "user";

  let frame = user.avatarFrame && user.avatarFrame !== "" ? user.avatarFrame : "none";
  if (user.avatarFrameExpiresAt && user.avatarFrameExpiresAt.getTime() < now) {
    frame = "none";
  }

  // Admin / mod: zorunlu çerçeve yok — "none" seçilirse hiçbir halka/etiket yok
  if (role === "admin" || role === "moderator") {
    let bubble = user.chatBubble && user.chatBubble !== "" ? user.chatBubble : "default";
    if (user.chatBubbleExpiresAt && user.chatBubbleExpiresAt.getTime() < now) {
      bubble = "default";
    }
    return { avatarFrame: frame, chatBubble: bubble };
  }

  // VIP: none veya işveren seçildiyse korunur; aksi halde vip çerçevesi
  if (vipActive) {
    if (frame !== "employer" && frame !== "none") frame = "vip";
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
