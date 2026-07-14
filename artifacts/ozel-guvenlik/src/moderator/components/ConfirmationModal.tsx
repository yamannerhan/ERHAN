import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  variant = "default",
  loading,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  if (!open) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onCancel}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)" }} />
      <div
        className="mod-card mod-card-gold"
        style={{ position: "relative", width: "100%", maxWidth: 420, zIndex: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: variant === "danger" ? "rgba(231,76,60,0.15)" : "var(--mod-gold-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AlertTriangle size={18} style={{ color: variant === "danger" ? "var(--mod-danger)" : "var(--mod-gold)" }} />
            </div>
            <h3 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 16 }}>{title}</h3>
          </div>
          <button type="button" onClick={onCancel} className="mod-btn mod-btn-ghost mod-btn-sm" style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <p style={{ fontSize: 14, color: "var(--mod-text-muted)", marginBottom: 24, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="mod-btn mod-btn-ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`mod-btn ${variant === "danger" ? "mod-btn-danger" : "mod-btn-gold"}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "İşleniyor..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
