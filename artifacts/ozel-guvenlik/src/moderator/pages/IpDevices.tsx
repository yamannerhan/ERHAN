import React, { useCallback, useEffect, useState } from "react";
import { Flag, Ban } from "lucide-react";
import { modFetch, modPost } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { ReasonModal } from "../components/ReasonModal";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

interface DeviceRow {
  id: number;
  userId?: number;
  username?: string;
  ip: string;
  deviceId?: string | null;
  riskScore?: number;
  isFlagged?: boolean;
  lastSeenAt?: string | null;
}

export default function IpDevices() {
  const { hasPermission } = useModerator();
  const { toast } = useToast();
  const [items, setItems] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [blockId, setBlockId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: DeviceRow[] }>("/ip-devices");
      setItems(data.items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flag = async (id: number) => {
    setActionLoading(true);
    try {
      await modPost(`/ip-devices/${id}/flag`);
      toast({ title: "Cihaz işaretlendi" });
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const block = async (reason: string) => {
    if (blockId == null) return;
    setActionLoading(true);
    try {
      await modPost(`/ip-devices/${blockId}/block`, { reason });
      toast({ title: "IP engellendi" });
      setBlockId(null);
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  return (
    <PermissionGuard permission="ip_devices.view">
      <PageShell title="IP & Cihazlar" onRefresh={load} loading={loading}>
        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Kayıt bulunamadı</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>Kullanıcı</th><th>IP</th><th>Cihaz ID</th><th>Risk</th><th>Son Görülme</th><th>İşlem</th></tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontSize: 13 }}>{d.username ?? `#${d.userId ?? d.id}`}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.ip}</td>
                  <td style={{ fontSize: 11, color: "var(--mod-text-dim)" }}>{d.deviceId?.slice(0, 12) ?? "—"}</td>
                  <td>
                    <span style={{ color: (d.riskScore ?? 0) > 50 ? "var(--mod-danger)" : "var(--mod-text-muted)", fontSize: 12 }}>
                      {d.riskScore ?? 0}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{d.lastSeenAt ? fmtDate(d.lastSeenAt) : "—"}</td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {hasPermission("ip_devices.flag") && !d.isFlagged && (
                      <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" onClick={() => flag(d.id)} disabled={actionLoading}>
                        <Flag size={14} /> İşaretle
                      </button>
                    )}
                    {hasPermission("ip_devices.block") && (
                      <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" onClick={() => setBlockId(d.id)} disabled={actionLoading}>
                        <Ban size={14} /> Engelle
                      </button>
                    )}
                    {d.isFlagged && <span style={{ fontSize: 11, color: "var(--mod-danger)" }}>İşaretli</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {blockId != null && (
          <ReasonModal
            open
            title="IP / cihaz engelle"
            confirmLabel="Engelle"
            onCancel={() => setBlockId(null)}
            onConfirm={block}
            loading={actionLoading}
          />
        )}
      </PageShell>
    </PermissionGuard>
  );
}
