import React, { useState } from "react";

type Props = {
  src?: string | null;
  name: string;
  role?: string;
  isVip?: boolean;
  frame?: string | null;
  size?: number;
  online?: boolean;
};

/** Animasyonlu avatar çerçevesi — GIF destekli */
export function FramedAvatar({
  src,
  name,
  role = "user",
  isVip,
  frame = "none",
  size = 32,
  online,
}: Props) {
  const [failed, setFailed] = useState(false);
  const show = !!src && !failed;
  const f = frame && frame !== "none" ? frame : null;

  const roleRing =
    role === "admin" ? "rgba(250,204,21,0.95)" :
    role === "moderator" ? "rgba(96,165,250,0.9)" :
    isVip ? "rgba(250,204,21,0.95)" :
    "rgba(255,193,7,0.35)";

  return (
    <div
      className={`og-avatar-frame relative shrink-0 ${f ? `og-frame-${f}` : ""}`}
      style={{ width: size + (f ? 8 : 0), height: size + (f ? 8 : 0) }}
    >
      <div
        className="og-avatar-frame-inner rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
        style={{
          width: size,
          height: size,
          margin: f ? 4 : 0,
          boxShadow: f ? undefined : `0 0 0 2px ${roleRing}`,
          background: show ? "transparent" : "linear-gradient(135deg,#1a1f2e,#2a3348)",
        }}
      >
        {show ? (
          <img
            src={src!}
            alt={name}
            className="w-full h-full object-cover"
            // GIF animasyonu için decoding async
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          name.substring(0, 2).toUpperCase()
        )}
      </div>
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#12161f]"
          style={{ boxShadow: "0 0 6px rgba(52,211,153,0.9)" }}
        />
      )}
    </div>
  );
}

export function chatBubbleClass(style: string | null | undefined, isMe: boolean): string {
  const key = style && style !== "default" ? style : "default";
  return `og-chat-bubble og-bubble-${key}${isMe ? " og-bubble-me" : ""}`;
}
