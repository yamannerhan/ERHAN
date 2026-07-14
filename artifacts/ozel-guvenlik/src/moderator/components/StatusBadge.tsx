import React from "react";

type StatusVariant = "active" | "pending" | "rejected" | "resolved" | "escalated" | "investigating" | "archived" | "deleted" | "default";

const variantStyles: Record<StatusVariant, { bg: string; color: string; label?: string }> = {
  active: { bg: "rgba(46,204,113,0.15)", color: "#2ECC71", label: "Aktif" },
  pending: { bg: "rgba(243,156,18,0.15)", color: "#F39C12", label: "Bekliyor" },
  rejected: { bg: "rgba(231,76,60,0.15)", color: "#E74C3C", label: "Reddedildi" },
  resolved: { bg: "rgba(46,204,113,0.15)", color: "#2ECC71", label: "Çözüldü" },
  escalated: { bg: "rgba(155,89,182,0.15)", color: "#9B59B6", label: "Yükseltildi" },
  investigating: { bg: "rgba(52,152,219,0.15)", color: "#3498DB", label: "İnceleniyor" },
  archived: { bg: "rgba(127,140,141,0.15)", color: "#95A5A6", label: "Arşiv" },
  deleted: { bg: "rgba(231,76,60,0.15)", color: "#E74C3C", label: "Silindi" },
  default: { bg: "rgba(255,255,255,0.08)", color: "var(--mod-text-muted)" },
};

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const variant = (status in variantStyles ? status : "default") as StatusVariant;
  const style = variantStyles[variant];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: style.bg,
        color: style.color,
        whiteSpace: "nowrap",
      }}
    >
      {label ?? style.label ?? status}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; color: string }> = {
    admin: { label: "Admin", color: "#E74C3C" },
    senior_moderator: { label: "Kıdemli Mod", color: "#E4AE2B" },
    moderator: { label: "Moderatör", color: "#3498DB" },
    vip: { label: "VIP", color: "#9B59B6" },
    user: { label: "Üye", color: "#7A8BA0" },
  };
  const cfg = map[role] ?? { label: role, color: "#7A8BA0" };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: `${cfg.color}18`, padding: "2px 8px", borderRadius: 999 }}>
      {cfg.label}
    </span>
  );
}
