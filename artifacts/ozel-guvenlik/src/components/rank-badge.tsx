import React from "react";

export type RankKey =
  | "admin"
  | "moderator"
  | "trusted"
  | "active"
  | "new"
  | "chatter"
  | "visitor"
  | "banned"
  | "bot"
  | "vip";

const RANK_LABEL: Record<RankKey, string> = {
  admin: "YÖNETİCİ",
  moderator: "MODERATÖR",
  trusted: "GÜVENİLİR ÜYE",
  active: "AKTİF ÜYE",
  new: "YENİ ÜYE",
  chatter: "SOHBETÇİ",
  visitor: "ZİYARETÇİ",
  banned: "YASAKLI",
  bot: "BOT",
  vip: "VIP",
};

/** Seviye / rol → görseldeki kart tipi */
export function resolveRankKey(opts: {
  role?: string | null;
  level?: number | null;
  isVip?: boolean;
  isBanned?: boolean;
  isBot?: boolean;
}): RankKey {
  if (opts.isBanned) return "banned";
  if (opts.isBot || opts.role === "bot") return "bot";
  if (opts.role === "admin") return "admin";
  if (opts.role === "moderator") return "moderator";
  if (opts.isVip) return "vip";
  const lv = Math.max(1, opts.level ?? 1);
  if (lv >= 50) return "trusted";
  if (lv >= 25) return "active";
  if (lv >= 10) return "new";
  if (lv >= 5) return "chatter";
  return "visitor";
}

function RankIcon({ rank }: { rank: RankKey }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    className: "rank-badge__icon",
    "aria-hidden": true as const,
  };
  switch (rank) {
    case "admin":
    case "vip":
      return (
        <svg {...common}>
          <path d="M5 16L3 7l5.5 3.5L12 4l3.5 6.5L21 7l-2 9H5zm0 2h14v2H5v-2z" />
        </svg>
      );
    case "moderator":
      return (
        <svg {...common}>
          <path d="M12 2l2.4 7.2H22l-6 4.4 2.3 7.1L12 16.8 5.7 20.7 8 13.6 2 9.2h7.6L12 2z" />
        </svg>
      );
    case "trusted":
      return (
        <svg {...common}>
          <path d="M12 2l7 3v6c0 5-3.5 9.4-7 11-3.5-1.6-7-6-7-11V5l7-3zm-1.2 12.6l5.3-5.3-1.4-1.4-3.9 3.9-1.8-1.8-1.4 1.4 3.2 3.2z" />
        </svg>
      );
    case "active":
      return (
        <svg {...common}>
          <path d="M12 2l7 3v6c0 5-3.5 9.4-7 11-3.5-1.6-7-6-7-11V5l7-3zm0 5.5a3 3 0 00-3 3v1h6v-1a3 3 0 00-3-3zm-4 6v1.5A4.5 4.5 0 0012 19.5 4.5 4.5 0 0016 15V13.5H8z" />
        </svg>
      );
    case "new":
      return (
        <svg {...common}>
          <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0v1H5v-1zm14-11h-2v2h-2v2h2v2h2v-2h2v-2h-2V10z" />
        </svg>
      );
    case "chatter":
      return (
        <svg {...common}>
          <path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2zm4 6a1.25 1.25 0 100 2.5A1.25 1.25 0 008 10zm4 0a1.25 1.25 0 100 2.5A1.25 1.25 0 0012 10zm4 0a1.25 1.25 0 100 2.5A1.25 1.25 0 0016 10z" />
        </svg>
      );
    case "visitor":
      return (
        <svg {...common}>
          <path d="M11 2l-1 8H4l8 12 1-8h6L11 2z" />
        </svg>
      );
    case "banned":
      return (
        <svg {...common}>
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm5.3 14.6L7.4 6.7a8 8 0 019.9 9.9zM6.7 7.4l9.9 9.9A8 8 0 016.7 7.4z" />
        </svg>
      );
    case "bot":
      return (
        <svg {...common}>
          <path d="M12 2a2 2 0 012 2v1h3a3 3 0 013 3v8a3 3 0 01-3 3H7a3 3 0 01-3-3V8a3 3 0 013-3h3V4a2 2 0 012-2zM9 11a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
        </svg>
      );
    default:
      return null;
  }
}

type Props = {
  rank: RankKey;
  level?: number | null;
  className?: string;
};

/** Görseldeki oyun tarzı rütbe kartı — pixel-yakın CSS */
export function RankBadge({ rank, level, className = "" }: Props) {
  const label = RANK_LABEL[rank];
  const lvText = rank === "banned" ? "--" : `Lv.${Math.max(1, level ?? 1)}`;

  return (
    <div
      className={`rank-badge rank-badge--${rank} ${className}`.trim()}
      title={`${label} ${lvText}`}
    >
      <div className="rank-badge__hex">
        <RankIcon rank={rank} />
      </div>
      <span className="rank-badge__title">{label}</span>
      <span className="rank-badge__level">{lvText}</span>
    </div>
  );
}
