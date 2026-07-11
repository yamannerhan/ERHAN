import React from "react";
import { Crown } from "lucide-react";

export type ChatBadge = {
  id: number;
  name: string;
  slug: string;
  emoji: string;
  color: string;
  description?: string | null;
};

export type ChatIdentityMsg = {
  userRole?: string | null;
  isVip?: boolean;
  level?: number;
  badges?: ChatBadge[];
  userNameColor?: string | null;
  userNameAnimated?: boolean;
};

function levelColor(level: number): string {
  const lv = Math.max(1, level || 1);
  if (lv >= 40) return "#F5C518";
  if (lv >= 30) return "#F97316";
  if (lv >= 22) return "#A855F7";
  if (lv >= 15) return "#3B82F6";
  if (lv >= 10) return "#22C55E";
  if (lv >= 5) return "#2DD4BF";
  return "#94A3B8";
}

/** Yetki rozeti — ismin ÜSTÜNDE */
function RoleTitle({ role, isVip }: { role: string; isVip?: boolean }) {
  if (role === "admin") {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-[1px] text-[8px] font-black tracking-[0.14em] uppercase"
        style={{
          background: "linear-gradient(90deg,#facc15,#f97316,#ef4444)",
          color: "#1a1200",
          boxShadow: "0 0 10px rgba(250,204,21,0.35)",
        }}
      >
        Yönetici
      </span>
    );
  }
  if (role === "moderator") {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-[1px] text-[8px] font-black tracking-[0.14em] uppercase"
        style={{
          background: "linear-gradient(90deg,#7f1d1d,#1e40af,#60a5fa)",
          color: "#fff",
          boxShadow: "0 0 10px rgba(59,130,246,0.35)",
        }}
      >
        Moderatör
      </span>
    );
  }
  if (isVip) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-[1px] text-[8px] font-black tracking-[0.12em] uppercase"
        style={{ background: "rgba(250,204,21,0.2)", color: "#facc15", border: "1px solid rgba(250,204,21,0.45)" }}
      >
        <Crown className="w-2.5 h-2.5 fill-current" /> VIP
      </span>
    );
  }
  return null;
}

function LevelBadge({ level }: { level: number }) {
  const color = levelColor(level);
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-[1px] text-[8px] font-black tracking-wide"
      style={{ color, background: `${color}22`, border: `1px solid ${color}55` }}
      title={`Seviye ${level}`}
    >
      Lv.{level}
    </span>
  );
}

function CustomBadge({ badge }: { badge: ChatBadge }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-[1px] text-[8px] font-bold max-w-[90px] truncate"
      style={{
        color: badge.color,
        background: `${badge.color}18`,
        border: `1px solid ${badge.color}44`,
      }}
      title={badge.description || badge.name}
    >
      <span className="shrink-0">{badge.emoji}</span>
      <span className="truncate">{badge.name}</span>
    </span>
  );
}

/**
 * Sohbet kimliği: yetki/level/rozetler üstte, isim altta.
 * Level isimleri efektsiz renkli; admin/mod animasyonlu kalabilir.
 */
export function ChatUserIdentity({
  msg,
  name,
  align = "start",
  showMemberLabel = false,
}: {
  msg: ChatIdentityMsg;
  name: string;
  align?: "start" | "end";
  showMemberLabel?: boolean;
}) {
  const role = msg.userRole ?? "user";
  const level = Math.max(1, msg.level ?? 1);
  const badges = msg.badges ?? [];
  const isStaff = role === "admin" || role === "moderator";
  const color = msg.userNameColor || (isStaff || msg.isVip ? undefined : levelColor(level));

  let nameClass = "text-[12px] font-extrabold leading-tight tracking-wide";
  if (role === "admin") nameClass += " name-admin";
  else if (role === "moderator") nameClass += " name-mod";
  else if (msg.isVip && msg.userNameAnimated) nameClass += " name-vip animate-rainbow";
  else if (msg.userNameAnimated) nameClass += " animate-rainbow";

  return (
    <div className={`flex flex-col gap-0.5 min-w-0 ${align === "end" ? "items-end" : "items-start"}`}>
      <div className={`flex items-center gap-1 flex-wrap ${align === "end" ? "justify-end" : "justify-start"}`}>
        <RoleTitle role={role} isVip={msg.isVip} />
        {showMemberLabel && role === "user" && !msg.isVip && (
          <span className="text-[8px] font-bold uppercase tracking-wider text-white/35">Üye</span>
        )}
        {role !== "bot" && <LevelBadge level={level} />}
        {badges.slice(0, 4).map((b) => (
          <CustomBadge key={b.id} badge={b} />
        ))}
      </div>
      <span
        className={nameClass}
        style={
          role === "admin" || role === "moderator" || msg.userNameAnimated
            ? undefined
            : color
              ? { color }
              : { color: "#e2e8f0" }
        }
      >
        {msg.isVip && !isStaff && (
          <Crown className="inline w-3 h-3 mr-0.5 text-amber-300 fill-amber-300" />
        )}
        {name}
      </span>
    </div>
  );
}

/** Profil sayfası için aynı rozet/level şeridi */
export function ProfileBadgesRow({
  role,
  isVip,
  level,
  badges,
}: {
  role?: string;
  isVip?: boolean;
  level?: number;
  badges?: ChatBadge[];
}) {
  const lv = Math.max(1, level ?? 1);
  const color = levelColor(lv);
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap mt-3">
      {role === "admin" && (
        <span className="og-profile-pill og-profile-pill-gold">Yönetici</span>
      )}
      {role === "moderator" && (
        <span className="og-profile-pill og-profile-pill-gold">Moderatör</span>
      )}
      {isVip && (
        <span className="og-profile-pill og-profile-pill-gold">
          <Crown className="w-3 h-3 fill-current" /> VIP
        </span>
      )}
      <span
        className="og-profile-pill font-black"
        style={{ color, borderColor: `${color}66`, background: `${color}18` }}
      >
        Lv.{lv}
      </span>
      {(badges ?? []).map((b) => (
        <span
          key={b.id}
          className="og-profile-pill"
          style={{ color: b.color, borderColor: `${b.color}66`, background: `${b.color}18` }}
          title={b.description || b.name}
        >
          {b.emoji} {b.name}
        </span>
      ))}
    </div>
  );
}
