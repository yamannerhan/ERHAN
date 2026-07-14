import React, { useCallback, useEffect, useState } from "react";
import { modFetch } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { StatusBadge } from "../components/StatusBadge";
import { ReportDrawer, type ReportItem } from "../components/ReportDrawer";

export default function Reports() {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<ReportItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: ReportItem[] }>(`/reports${status ? `?status=${status}` : ""}`);
      setItems(data.items);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return (
    <PermissionGuard permission="reports.view">
      <PageShell
        title="Raporlar"
        onRefresh={load}
        loading={loading}
        actions={
          <select className="mod-input mod-select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140 }}>
            <option value="">Tümü</option>
            <option value="pending">Bekleyen</option>
            <option value="investigating">İnceleniyor</option>
            <option value="resolved">Çözüldü</option>
            <option value="rejected">Reddedildi</option>
            <option value="escalated">Yükseltildi</option>
          </select>
        }
      >
        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Rapor bulunamadı</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>#</th><th>Hedef</th><th>Sebep</th><th>Durum</th><th>Tarih</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td style={{ color: "var(--mod-text-dim)", fontSize: 12 }}>{r.id}</td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: "var(--mod-text-dim)" }}>{r.targetType}</div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-muted)", maxWidth: 200 }}>{r.reason}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(r.createdAt)}</td>
                  <td>
                    <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={() => setSelected(r)}>
                      Detay
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </PageShell>

      <ReportDrawer report={selected} onClose={() => setSelected(null)} onAction={load} />
    </PermissionGuard>
  );
}
