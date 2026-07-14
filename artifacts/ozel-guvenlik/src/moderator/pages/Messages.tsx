import React, { useCallback, useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { modFetch } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { StatusBadge } from "../components/StatusBadge";
import { ReportDrawer, type ReportItem } from "../components/ReportDrawer";

export default function Messages() {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReportItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: ReportItem[] }>("/reports?status=pending");
      setItems(data.items.filter((r) => r.targetType === "message"));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <PermissionGuard permission="messages.view_reported">
      <PageShell title="Mesajlar" subtitle="Raporlanan mesajlar" onRefresh={load} loading={loading}>
        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Raporlanan mesaj yok</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>Mesaj</th><th>Sebep</th><th>Durum</th><th>Tarih</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{r.title}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-muted)" }}>{r.reason}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(r.createdAt)}</td>
                  <td>
                    <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={() => setSelected(r)}>
                      <Flag size={14} /> İncele
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
