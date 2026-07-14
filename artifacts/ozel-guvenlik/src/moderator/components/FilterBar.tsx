import React from "react";

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function BulkActionBar({ selectedCount, onClear, children }: BulkActionBarProps) {
  if (selectedCount <= 0) return null;
  return (
    <div
      className="mod-card"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        marginBottom: 12,
        borderColor: "var(--mod-gold)",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedCount} seçili</span>
      <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={onClear}>
        Temizle
      </button>
      <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}
