import React, { useEffect, useState } from "react";
import { X, CheckCircle, XCircle, ArrowUpCircle } from "lucide-react";
import { modFetch, modPost } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { ReasonModal } from "../components/ReasonModal";
import { fmtDate } from "../components/PageShell";
import { useModerator } from "../context";

export interface ReportItem {
  id: number;
  targetType: string;
  title: string;
  reason: string;
  reasonCode?: string | null;
  reporterUserId?: number | null;
  imageUrl?: string | null;
  createdAt: string;
  status: string;
  contentSnapshot?: string | null;
  assignedModeratorId?: number | null;
}

interface ReportDrawerProps {
  report: ReportItem | null;
  onClose: () => void;
  onAction: () => void;
}

export function ReportDrawer({ report, onClose, onAction }: ReportDrawerProps) {
  const { hasPermission } = useModerator();
  const [detail, setDetail] = useState<{ report: ReportItem; actions: unknown[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [reasonModal, setReasonModal] = useState<"reject" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!report) { setDetail(null); return; }
    setLoading(true);
    modFetch<{ report: ReportItem; actions: unknown[] }>(`/reports/${report.id}`)
      .then(setDetail)
      .catch(() => setDetail({ report, actions: [] }))
      .finally(() => setLoading(false));
  }, [report]);

  if (!report) return null;

  const r = detail?.report ?? report;

  const handleResolve = async () => {
    setActionLoading(true);
    try {
      await modPost(`/reports/${r.id}/resolve`, { note: "" });
      onAction();
      onClose();
    } finally { setActionLoading(false); }
  };

  const handleReject = async (reason: string) => {
    setActionLoading(true);
    try {
      await modPost(`/reports/${r.id}/reject`, { reason });
      setReasonModal(null);
      onAction();
      onClose();
    } finally { setActionLoading(false); }
  };

  const handleEscalate = async () => {
    setActionLoading(true);
    try {
      await modPost(`/reports/${r.id}/escalate`);
      onAction();
      onClose();
    } finally { setActionLoading(false); }
  };

  const handleAssign = async () => {
    setActionLoading(true);
    try {
      await modPost(`/reports/${r.id}/assign`, {});
      onAction();
    } finally { setActionLoading(false); }
  };

  return (
    <>
      <div className="mod-drawer-overlay" onClick={onClose} />
      <div className="mod-drawer">
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--mod-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 18 }}>Rapor #{r.id}</h2>
            <StatusBadge status={r.status} />
          </div>
          <button type="button" onClick={onClose} className="mod-btn mod-btn-ghost mod-btn-sm" style={{ padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {loading ? (
            <div className="mod-loading-center"><div className="mod-spinner" /></div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: "var(--mod-text-dim)", textTransform: "uppercase", marginBottom: 4 }}>Hedef</p>
                <p style={{ fontWeight: 600 }}>{r.title}</p>
                <p style={{ fontSize: 12, color: "var(--mod-text-muted)" }}>{r.targetType} · #{report.id}</p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: "var(--mod-text-dim)", textTransform: "uppercase", marginBottom: 4 }}>Sebep</p>
                <p style={{ fontSize: 14 }}>{r.reason}</p>
              </div>
              {r.contentSnapshot && (
                <div style={{ marginBottom: 16, padding: 12, background: "var(--mod-bg-elevated)", borderRadius: 8, fontSize: 13 }}>
                  {r.contentSnapshot}
                </div>
              )}
              {r.imageUrl && (
                <img src={r.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 16 }} />
              )}
              <p style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(r.createdAt)}</p>
            </>
          )}
        </div>

        {r.status === "pending" || r.status === "investigating" ? (
          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--mod-border-subtle)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {hasPermission("reports.assign") && (
              <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={handleAssign} disabled={actionLoading}>
                Üstlen
              </button>
            )}
            {hasPermission("reports.resolve") && (
              <button type="button" className="mod-btn mod-btn-success mod-btn-sm" onClick={handleResolve} disabled={actionLoading}>
                <CheckCircle size={14} /> Çöz
              </button>
            )}
            {hasPermission("reports.reject") && (
              <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" onClick={() => setReasonModal("reject")} disabled={actionLoading}>
                <XCircle size={14} /> Reddet
              </button>
            )}
            {hasPermission("reports.escalate") && (
              <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={handleEscalate} disabled={actionLoading}>
                <ArrowUpCircle size={14} /> Yükselt
              </button>
            )}
          </div>
        ) : null}
      </div>

      <ReasonModal
        open={reasonModal === "reject"}
        title="Raporu Reddet"
        confirmLabel="Reddet"
        loading={actionLoading}
        onConfirm={handleReject}
        onCancel={() => setReasonModal(null)}
      />
    </>
  );
}
