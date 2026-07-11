import React, { useState } from "react";
import { CornerUpLeft, Pin, PinOff, Trash2, Bot } from "lucide-react";
import { FramedAvatar, chatBubbleClass } from "@/components/framed-avatar";
import { RankBadge, resolveRankKey } from "@/components/rank-badge";
import { ChatPollCard } from "@/components/chat-poll-card";

export type ChatMsgView = {
  id: number;
  content: string;
  userId: number;
  username: string;
  displayName?: string | null;
  userAvatarUrl?: string | null;
  userRole?: string | null;
  isVip?: boolean;
  isBot?: boolean;
  isFake?: boolean;
  isPinned?: boolean;
  level?: number;
  avatarFrame?: string | null;
  chatBubble?: string | null;
  replyToId?: number | null;
  replyToUsername?: string | null;
  replyToContent?: string | null;
  createdAt: string;
  poll?: {
    id: number;
    question: string;
    options: string[];
    counts: number[];
    totalVotes: number;
    myVote: number | null;
    isClosed: boolean;
  } | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function isDbMessageId(id: number): boolean {
  return Number.isFinite(id) && id > 0 && id < 1_000_000_000;
}

function isBotLike(msg: ChatMsgView): boolean {
  if (msg.isBot || msg.isFake) return true;
  if (msg.userId <= 0) return true;
  if (msg.userRole === "bot") return true;
  return false;
}

type Props = {
  msg: ChatMsgView;
  isOwn: boolean;
  currentUsername?: string | null;
  token?: string;
  canModerate?: boolean;
  canPin?: boolean;
  renderContent: (content: string) => React.ReactNode;
  onReply?: (msg: ChatMsgView) => void;
  onDeleted?: (id: number) => void;
  onPinned?: (id: number, pinned: boolean) => void;
  onPollUpdate?: (id: number, poll: NonNullable<ChatMsgView["poll"]>) => void;
  /** Mobilde dokununca aksiyonları göster */
  active?: boolean;
  onActivate?: () => void;
};

/**
 * Temiz flex mesaj satırı — avatar | meta(rank+time) | bubble | actions
 */
export function ChatMessageItem({
  msg,
  isOwn,
  currentUsername,
  token = "",
  canModerate,
  canPin,
  renderContent,
  onReply,
  onDeleted,
  onPinned,
  onPollUpdate,
  active,
  onActivate,
}: Props) {
  const [busy, setBusy] = useState(false);
  const bot = isBotLike(msg);
  const name = msg.displayName || msg.username;
  const role = msg.userRole ?? (bot ? "bot" : "user");
  const rank = resolveRankKey({
    role,
    level: msg.level,
    isVip: msg.isVip,
    isBot: bot,
  });
  const level = Math.max(1, msg.level ?? 1);
  const bubbleStyle =
    msg.chatBubble ||
    (role === "admin" ? "admin" : role === "moderator" ? "mod" : msg.isVip ? "vip" : bot ? "neon" : null);

  const roleClass =
    role === "admin" ? "role-admin" :
    role === "moderator" ? "role-moderator" : "";

  const deleteMessage = async () => {
    if (!window.confirm("Bu mesaj silinsin mi?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/chat/messages/${msg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok || r.status === 204) onDeleted?.(msg.id);
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/chat/messages/${msg.id}/pin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json().catch(() => ({})) as { isPinned?: boolean };
      if (r.ok) onPinned?.(msg.id, !!d.isPinned);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={[
        "chat-message",
        isOwn ? "is-own" : "",
        bot ? "is-bot" : "",
        roleClass,
        active ? "is-active" : "",
      ].filter(Boolean).join(" ")}
      onClick={() => onActivate?.()}
    >
      <div className="message-avatar">
        {bot && !msg.isFake ? (
          <div className="message-bot-avatar" aria-hidden>
            <Bot className="w-4 h-4 text-amber-400" />
          </div>
        ) : (
          <FramedAvatar
            src={msg.userAvatarUrl}
            name={name}
            role={role}
            isVip={msg.isVip}
            frame={msg.avatarFrame}
            size={32}
            online={!bot}
          />
        )}
      </div>

      <div className="message-content">
        <div className="message-meta">
          <span className="message-username" title={name}>{name}</span>
          <RankBadge rank={rank} level={level} />
          <span className="message-time">{formatTime(msg.createdAt)}</span>
        </div>

        {!!msg.replyToId && !!(msg.replyToUsername || msg.replyToContent) && (
          <div className="reply-preview">
            <span className="reply-preview__user">
              {msg.replyToUsername === currentUsername ? "Sen" : msg.replyToUsername}
            </span>
            <span className="reply-preview__text">{msg.replyToContent}</span>
          </div>
        )}

        <div className={`message-bubble ${chatBubbleClass(bubbleStyle, isOwn)}`}>
          {msg.isPinned && (
            <div className="message-pin-row">
              <span className="message-pin" title="Sabitlenmiş">
                <Pin />
              </span>
            </div>
          )}
          <div className="message-bubble-body">
            {msg.poll ? (
              <ChatPollCard
                poll={msg.poll}
                token={token}
                onUpdate={(p) => onPollUpdate?.(msg.id, p)}
              />
            ) : (
              <p className="break-words leading-relaxed m-0">{renderContent(msg.content)}</p>
            )}
          </div>
        </div>

        {(onReply || canModerate) && (
          <div className="message-actions" onClick={(e) => e.stopPropagation()}>
            {onReply && (
              <button
                type="button"
                className="message-action-btn"
                onClick={() => onReply(msg)}
              >
                <CornerUpLeft /> Yanıtla
              </button>
            )}
            {canPin && isDbMessageId(msg.id) && (
              <button
                type="button"
                className="message-action-btn"
                disabled={busy}
                onClick={() => void togglePin()}
              >
                {msg.isPinned ? <PinOff /> : <Pin />}
                {msg.isPinned ? "Kaldır" : "Sabitle"}
              </button>
            )}
            {canModerate && isDbMessageId(msg.id) && (
              <button
                type="button"
                className="message-action-btn message-action-btn--danger"
                disabled={busy}
                onClick={() => void deleteMessage()}
              >
                <Trash2 /> Sil
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
