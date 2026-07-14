import React from "react";
import { RefreshCw } from "lucide-react";

interface PageShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
  children: React.ReactNode;
}

export function PageShell({ title, subtitle, actions, onRefresh, loading, children }: PageShellProps) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--mod-font-display)", fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 13, color: "var(--mod-text-muted)" }}>{subtitle}</p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {onRefresh && (
            <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Yenile
            </button>
          )}
          {actions}
        </div>
      </div>
      {children}
    </div>
  );
}

export function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="mod-table-wrap">
      <table className="mod-table">{children}</table>
    </div>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}
