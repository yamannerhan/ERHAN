import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon: React.ReactNode;
  accent?: "gold" | "success" | "warning" | "danger" | "info";
}

const accentColors = {
  gold: "var(--mod-gold)",
  success: "var(--mod-success)",
  warning: "var(--mod-warning)",
  danger: "var(--mod-danger)",
  info: "var(--mod-info)",
};

export function StatCard({ label, value, delta, deltaLabel, icon, accent = "gold" }: StatCardProps) {
  const color = accentColors[accent];
  const positive = delta != null && delta >= 0;

  return (
    <div className="mod-card" style={{ position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 80,
          height: 80,
          background: `radial-gradient(circle at top right, ${color}22, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={{ fontSize: 12, color: "var(--mod-text-muted)", fontWeight: 500, marginBottom: 8 }}>
            {label}
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--mod-font-display)", lineHeight: 1 }}>
            {value}
          </p>
          {delta != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 12 }}>
              {positive ? (
                <TrendingUp size={14} style={{ color: "var(--mod-success)" }} />
              ) : (
                <TrendingDown size={14} style={{ color: "var(--mod-danger)" }} />
              )}
              <span style={{ color: positive ? "var(--mod-success)" : "var(--mod-danger)", fontWeight: 600 }}>
                {positive ? "+" : ""}{delta}
              </span>
              {deltaLabel && (
                <span style={{ color: "var(--mod-text-dim)" }}>{deltaLabel}</span>
              )}
            </div>
          )}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `${color}18`,
            border: `1px solid ${color}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
