import React, { useCallback, useEffect, useState } from "react";
import { modFetch } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";

interface LogEntry {
  id: number;
  action: string;
  targetType: string;
  targetId: number;
  reason: string | null;
  actorUserId: number;
  createdAt: string;
  success: boolean;
}

export default function Logs() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: LogEntry[] }>(`/logs${action ? `?action=${encodeURIComponent(action)}` : ""}`);
      setItems(data.items);
    } finally { setLoading(false); }
  }, [action]);

  useEffect(() => { load(); }, [load]);

  return (
    <PermissionGuard permission="logs.view">
      <PageShell
        title="Denetim Logları"
        subtitle="Salt okunur"
        onRefresh={load}
        loading={loading}
        actions={
          <input className="mod-input" placeholder="Aksiyon filtrele..." value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 180 }} />
        }
      >
        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Log kaydı yok</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>Aksiyon</th><th>Hedef</th><th>Sebep</th><th>Moderatör</th><th>Başarı</th><th>Tarih</th></tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontSize: 12, fontFamily: "monospace", color: "var(--mod-gold)" }}>{l.action}</td>
                  <td style={{ fontSize: 12 }}>{l.targetType} #{l.targetId}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-muted)", maxWidth: 200 }}>{l.reason ?? "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>#{l.actorUserId}</td>
                  <td>{l.success ? "✓" : "✗"}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </PageShell>
    </PermissionGuard>
  );
}
