import React, { useState } from "react";
import { isLiteMode } from "@/lib/display-mode";

type Props = {
  src?: string | null;
  name: string;
  role?: string;
  isVip?: boolean;
  frame?: string | null;
  size?: number;
  online?: boolean;
};

/** Avatar — çerçeveler herkes için kapalı */
export function FramedAvatar({
  src,
  name,
  size = 32,
  online,
}: Props) {
  const [failed, setFailed] = useState(false);
  const show = !!src && !failed;

  return (
    <div
      className="og-avatar-frame relative shrink-0 og-frame-none"
      style={{ width: size, height: size }}
    >
      <div
        className="og-avatar-frame-inner rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
        style={{
          width: size,
          height: size,
          margin: 0,
          background: show ? "transparent" : "linear-gradient(135deg,#1a1f2e,#2a3348)",
        }}
      >
        {show ? (
          <img
            src={src!}
            alt={name}
            className="w-full h-full object-cover"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          name.substring(0, 2).toUpperCase()
        )}
      </div>
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#12161f] z-[3]"
          style={{ boxShadow: "0 0 6px rgba(52,211,153,0.9)" }}
        />
      )}
    </div>
  );
}

export function chatBubbleClass(style: string | null | undefined, isMe: boolean): string {
  if (typeof window !== "undefined" && isLiteMode()) {
    return `og-chat-bubble og-bubble-default${isMe ? " og-bubble-me" : ""}`;
  }
  const key = style && style !== "default" ? style : "default";
  return `og-chat-bubble og-bubble-${key}${isMe ? " og-bubble-me" : ""}`;
}
