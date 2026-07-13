import React, { useEffect, useRef, useState } from "react";
import {
  CornerUpLeft, Pin, PinOff, Trash2, Bot, MoreHorizontal,
} from "lucide-react";
import { FramedAvatar, chatBubbleClass } from "@/components/framed-avatar";
import { resolveRankKey, type RankKey } from "@/components/rank-badge";
import { ChatPollCard } from "@/components/chat-poll-card";
import { Link } from "wouter";

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

type RoleTone = "admin" | "moderator" | "support" | "bot" | "vip" | "user";

function resolveTone(opts: {
  role?: string | null;
  isBot?: boolean;
  isVip?: boolean;
}): RoleTone {
  if (opts.isBot || opts.role === "bot") return "bot";
  if (opts.role === "admin") return "admin";
  if (opts.role === "moderator") return "moderator";
  if (opts.role === "support") return "support";
  if (opts.isVip) return "vip";
  return "user";
}

const ROLE_PILL: Record<RoleTone, { label: string; show: boolean }> = {
  admin: { label: "YÖNETİCİ", show: true },
  moderator: { label: "MODERATÖR", show: true },
  support: { label: "DESTEK", show: true },
  bot: { label: "SİSTEM", show: true },
  vip: { label: "VIP ÜYE", show: true },
  user: { label: "ÜYE", show: false },
};

type Props = {
  msg: ChatMsgView;
  isOwn: boolean;
  currentUsername?: string | null;
  token?: string;
  canModerate?: boolean;
  canPin?: boolean;
  renderContent: (content: string) => React.ReactNode;
  onReply?: (msg: ChatMsgView) => void;
  onGreet?: (msg: ChatMsgView) => void;
  showGreet?: boolean;
  greetLabel?: string;
  onReact?: (msgId: number, emoji: string) => void;
  reactions?: Array<{ emoji: string; userId: number; username: string; displayName?: string | null }>;
  currentUserId?: number | null;
  onDeleted?: (id: number) => void;
  onPinned?: (id: number, pinned: boolean) => void;
  onPollUpdate?: (id: number, poll: NonNullable<ChatMsgView["poll"]>) => void;
  active?: boolean;
  onActivate?: () => void;
  memberStyle?: boolean;
};

const QUICK_EMOJIS: string[] = []; // emoji tepki UI kaldırıldı

/**
 * Ortak sohbet mesaj yerleşimi.
 * Admin/mod isim animasyonları (name-admin / name-mod) korunur — yalnızca layout değişir.
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
  onGreet,
  showGreet,
  greetLabel = "Hoşgeldin",
  onReact,
  reactions = [],
  currentUserId,
  onDeleted,
  onPinned,
  onPollUpdate,
  active,
  onActivate,
  memberStyle,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const systemBot =
    msg.isBot === true ||
    msg.userRole === "bot" ||
    msg.userId === 0 ||
    msg.userId === -999;
  const useMemberCard = memberStyle !== false && !systemBot;
  const bot = !useMemberCard;
  const name = msg.displayName || msg.username;
  const role = msg.userRole ?? (systemBot ? "bot" : "user");
  const tone = resolveTone({ role, isBot: systemBot, isVip: msg.isVip });
  const rank: RankKey = resolveRankKey({
    role,
    level: msg.level,
    isVip: msg.isVip,
    isBot: systemBot,
  });
  const level = msg.level != null && msg.level > 0 ? Math.max(1, msg.level) : null;
  const pill = ROLE_PILL[tone];
  const showRolePill = pill.show;
  /* Korunan animasyon class'ları — silinmez / yeniden yazılmaz */
  const nameAnimClass =
    tone === "admin" ? "name-admin" :
    tone === "moderator" ? "name-mod" :
    tone === "vip" ? "name-vip" :
    "";
  const bubbleStyle =
    msg.chatBubble ||
    (tone === "admin" ? "admin" : tone === "moderator" ? "mod" : msg.isVip ? "vip" : systemBot ? "neon" : null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

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
      setMenuOpen(false);
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
      setMenuOpen(false);
    }
  };

  const canShowModTools = !!(canModerate || canPin) && isDbMessageId(msg.id);
  const hasMenu =
    (!isOwn && !!(onReply || onGreet || (onReact && isDbMessageId(msg.id)))) ||
    canShowModTools ||
    !bot;

  return (
    <article
      className={[
        "cmc",
        `cmc--${tone}`,
        isOwn ? "cmc--own" : "",
        bot ? "cmc--bot" : "",
        msg.isPinned ? "cmc--pinned" : "",
        active ? "cmc--active" : "",
      ].filter(Boolean).join(" ")}
      onClick={() => onActivate?.()}
      data-rank={rank}
    >
      <div className="cmc-avatar">
        {bot ? (
          <div className="cmc-bot-avatar" aria-hidden>
            <Bot />
          </div>
        ) : (
          <FramedAvatar
            src={msg.userAvatarUrl}
            name={name}
            role={role}
            isVip={msg.isVip}
            frame={msg.avatarFrame}
            size={32}
            online
          />
        )}
      </div>

      <div className="cmc-col">
        <div className="cmc-meta">
          <div className="cmc-meta-left">
            {showRolePill && (
              <span className={`cmc-role-pill cmc-role-pill--${tone}`}>{pill.label}</span>
            )}
            <span
              className={["cmc-name", nameAnimClass].filter(Boolean).join(" ")}
              title={name}
            >
              {name}
            </span>
            {level != null && !bot && (
              <span className={`cmc-level cmc-level--${tone}`}>Lv.{level}</span>
            )}
            <span className="cmc-time">{formatTime(msg.createdAt)}</span>
          </div>

          {hasMenu && (
            <div className="cmc-more" ref={menuRef} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="cmc-more-btn"
                aria-label="Mesaj işlemleri"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreHorizontal />
              </button>
              {menuOpen && (
                <div className="cmc-menu" role="menu">
                  {showGreet && onGreet && !isOwn && (
                    <button type="button" onClick={() => { onGreet(msg); setMenuOpen(false); }}>
                      👋 {greetLabel}
                    </button>
                  )}
                  {onReply && !isOwn && (
                    <button type="button" onClick={() => { onReply(msg); setMenuOpen(false); }}>
                      <CornerUpLeft className="cmc-menu-ico" /> Yanıtla
                    </button>
                  )}
                  {canPin && (
                    <button type="button" disabled={busy} onClick={() => void togglePin()}>
                      {msg.isPinned ? <><PinOff className="cmc-menu-ico" /> Sabiti kaldır</> : <><Pin className="cmc-menu-ico" /> Sabitle</>}
                    </button>
                  )}
                  {canModerate && (
                    <button type="button" className="is-danger" disabled={busy} onClick={() => void deleteMessage()}>
                      <Trash2 className="cmc-menu-ico" /> Sil
                    </button>
                  )}
                  {!bot && (
                    <Link href={`/profil/${msg.username}`} onClick={() => setMenuOpen(false)}>
                      Kullanıcı Profilini Gör
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {msg.isPinned && (
          <div className="cmc-pinned-badge">
            <Pin />
            <span>Sabitlendi</span>
          </div>
        )}

        {!!msg.replyToId && !!(msg.replyToUsername || msg.replyToContent) && (
          <div className="cmc-reply">
            <span className="cmc-reply__user">
              {msg.replyToUsername === currentUsername ? "Sen" : msg.replyToUsername}
            </span>
            <span className="cmc-reply__text">{msg.replyToContent}</span>
          </div>
        )}

        <div className={`cmc-bubble ${chatBubbleClass(bubbleStyle, isOwn)}`}>
          {msg.poll ? (
            <ChatPollCard
              poll={msg.poll}
              token={token}
              onUpdate={(p) => onPollUpdate?.(msg.id, p)}
            />
          ) : (
            <div className="cmc-text">{renderContent(msg.content)}</div>
          )}
        </div>
      </div>
    </article>
  );
}
