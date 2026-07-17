import React, { useEffect, useRef, useState } from "react";
import {
  CornerUpLeft, Pin, PinOff, Bot, MoreHorizontal, Ban,
} from "lucide-react";
import { FramedAvatar, chatBubbleClass } from "@/components/framed-avatar";
import { useDisplayMode } from "@/contexts/DisplayModeContext";
import { resolveRankKey, type RankKey } from "@/components/rank-badge";
import { ChatPollCard } from "@/components/chat-poll-card";
import { Link } from "wouter";
import { CHAT_MUTE_PRESETS } from "@/components/chat-mod-actions";

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
  onMuted?: (userId: number) => void;
};

const QUICK_EMOJIS = ["👍", "❤️", "🔥", "😂"] as const;

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
  onMuted,
}: Props) {
  const { isLite } = useDisplayMode();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const muteRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

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
  const showRolePill = !isLite && pill.show;
  const nameAnimClass = isLite ? "" :
    tone === "admin" ? "name-admin" :
    tone === "moderator" ? "name-mod" :
    tone === "vip" ? "name-vip" :
    "";
  const bubbleStyle = isLite ? null :
    msg.chatBubble ||
    (tone === "admin" ? "admin" : tone === "moderator" ? "mod" : msg.isVip ? "vip" : systemBot ? "neon" : null);

  const canMuteTarget =
    !!canModerate &&
    !bot &&
    !isOwn &&
    msg.userId > 0 &&
    role !== "admin" &&
    role !== "bot";

  useEffect(() => {
    if (!menuOpen && !muteOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (muteRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
      setMuteOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, muteOpen]);

  const deleteMessage = async (skipConfirm = false) => {
    if (!skipConfirm && !window.confirm("Bu mesaj silinsin mi?")) return;
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

  const muteUser = async (preset: (typeof CHAT_MUTE_PRESETS)[number]) => {
    if (!canMuteTarget) return;
    if (!window.confirm(`${name} için ${preset.label} sohbet yasağı uygulansın mı?`)) return;
    setBusy(true);
    try {
      const body =
        "hours" in preset && preset.hours
          ? { hours: preset.hours }
          : { days: (preset as { days: number }).days };
      const r = await fetch(`/api/admin/users/${msg.userId}/mute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        onMuted?.(msg.userId);
        setMuteOpen(false);
      } else {
        const d = await r.json().catch(() => ({})) as { error?: string };
        window.alert(d.error ?? "Susturma başarısız");
      }
    } finally {
      setBusy(false);
    }
  };

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const startLongPress = () => {
    if (!canModerate || !isDbMessageId(msg.id)) return;
    longPressFired.current = false;
    clearLongPress();
    longPressRef.current = setTimeout(() => {
      longPressFired.current = true;
      void deleteMessage(false);
    }, 550);
  };

  const canShowModTools = !!(canModerate || canPin) && isDbMessageId(msg.id);
  const hasMenu =
    (!isOwn && !!(onReply || onGreet || (onReact && isDbMessageId(msg.id)))) ||
    canShowModTools ||
    !bot;

  const reactionGroups = (() => {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
      cur.count += 1;
      if (currentUserId != null && r.userId === currentUserId) cur.mine = true;
      map.set(r.emoji, cur);
    }
    return [...map.values()];
  })();

  return (
    <article
      className={[
        "cmc",
        `cmc--${tone}`,
        isOwn ? "cmc--own" : "",
        bot ? "cmc--bot" : "",
        msg.isPinned ? "cmc--pinned" : "",
        active ? "cmc--active" : "",
        isLite ? "og-lite-chat-plain" : "",
      ].filter(Boolean).join(" ")}
      onClick={() => {
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        onActivate?.();
      }}
      data-rank={rank}
    >
      <div
        className="cmc-avatar"
        onClick={(e) => {
          if (!canMuteTarget) return;
          e.stopPropagation();
          setMuteOpen((v) => !v);
          setMenuOpen(false);
        }}
        role={canMuteTarget ? "button" : undefined}
        title={canMuteTarget ? "Sustur" : undefined}
      >
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
            frame="none"
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
            <button
              type="button"
              className={["cmc-name", nameAnimClass, canMuteTarget ? "cmc-name--clickable" : ""].filter(Boolean).join(" ")}
              title={canMuteTarget ? "Susturmak için tıkla" : name}
              onClick={(e) => {
                if (!canMuteTarget) return;
                e.stopPropagation();
                setMuteOpen((v) => !v);
                setMenuOpen(false);
              }}
            >
              {name}
            </button>
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
                onClick={() => { setMenuOpen((v) => !v); setMuteOpen(false); }}
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
                  {canMuteTarget && (
                    <button type="button" onClick={() => { setMuteOpen(true); setMenuOpen(false); }}>
                      <Ban className="cmc-menu-ico" /> Sustur
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

        {muteOpen && canMuteTarget && (
          <div
            ref={muteRef}
            className="cmc-mute-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="cmc-mute-title"><Ban className="w-3 h-3" /> {name} — sustur</p>
            <div className="cmc-mute-presets">
              {CHAT_MUTE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={busy}
                  onClick={() => void muteUser(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

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

        <div
          className={`cmc-bubble ${chatBubbleClass(bubbleStyle, isOwn)}`}
          onTouchStart={startLongPress}
          onTouchEnd={clearLongPress}
          onTouchCancel={clearLongPress}
          onMouseDown={(e) => {
            if (e.button === 0) startLongPress();
          }}
          onMouseUp={clearLongPress}
          onMouseLeave={clearLongPress}
          onContextMenu={(e) => {
            if (canModerate && isDbMessageId(msg.id)) {
              e.preventDefault();
              void deleteMessage(false);
            }
          }}
        >
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

        {isDbMessageId(msg.id) && onReact && !msg.poll && (
          <div className="cmc-reactions" onClick={(e) => e.stopPropagation()}>
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                type="button"
                className={`cmc-reaction ${g.mine ? "is-mine" : ""}`}
                onClick={() => onReact(msg.id, g.emoji)}
                title={`${g.count} beğeni`}
              >
                <span>{g.emoji}</span>
                {g.count > 0 && <span>{g.count}</span>}
              </button>
            ))}
            {!reactionGroups.some((g) => g.emoji === "👍" && g.mine) && (
              <button
                type="button"
                className="cmc-reaction cmc-reaction--add"
                onClick={() => onReact(msg.id, "👍")}
                title="Beğen"
              >
                👍
              </button>
            )}
            {QUICK_EMOJIS.filter((e) => e !== "👍" && !reactionGroups.some((g) => g.emoji === e)).slice(0, 2).map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="cmc-reaction cmc-reaction--add"
                onClick={() => onReact(msg.id, emoji)}
                title="Tepki"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
