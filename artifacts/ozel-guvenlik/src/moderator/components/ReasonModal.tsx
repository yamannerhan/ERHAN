import React, { useEffect, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";

interface ReasonModalProps {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  confirmLabel?: string;
  required?: boolean;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ReasonModal({
  open,
  title,
  description,
  placeholder = "Neden belirtin...",
  confirmLabel = "Onayla",
  required = true,
  loading,
  onConfirm,
  onCancel,
}: ReasonModalProps) {
  const [reason, setReason] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const valid = !required || reason.trim().length > 0;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onCancel}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)" }} />
      <div
        className="mod-card mod-card-gold"
        style={{ position: "relative", width: "100%", maxWidth: 460, zIndex: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--mod-gold-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MessageSquare size={18} style={{ color: "var(--mod-gold)" }} />
            </div>
            <h3 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 16 }}>{title}</h3>
          </div>
          <button type="button" onClick={onCancel} className="mod-btn mod-btn-ghost mod-btn-sm" style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        {description && (
          <p style={{ fontSize: 13, color: "var(--mod-text-muted)", marginBottom: 12 }}>{description}</p>
        )}
        <textarea
          ref={inputRef}
          className="mod-input"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          style={{ resize: "vertical", marginBottom: 16 }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="mod-btn mod-btn-ghost" onClick={onCancel} disabled={loading}>
            Vazgeç
          </button>
          <button
            type="button"
            className="mod-btn mod-btn-gold"
            disabled={!valid || loading}
            onClick={() => onConfirm(reason.trim())}
          >
            {loading ? "İşleniyor..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
