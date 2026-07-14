import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, UserCheck } from "lucide-react";
import { modFetch, modPost } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { RoleBadge } from "../components/StatusBadge";
import { ReasonModal } from "../components/ReasonModal";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

interface ModUser {
  id: number;
  username: string;
  email: string;
  displayName: string;
  role: string;
  isBanned: boolean;
  banReason: string | null;
  banExpiresAt: string | null;
  createdAt: string;
  lastKnownIp: string | null;
}

export default function Users() {
  const { hasPermission, refreshBadges } = useModerator();
  const { toast } = useToast();
  const [items, setItems] = useState<ModUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [reasonModal, setReasonModal] = useState<{ id: number; action: "warn" | "suspend" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: ModUser[] }>(`/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setItems(data.items);
    } finally { setLoading(false); }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: number, path: string, body?: unknown) => {
    setActionLoading(true);
    try {
      await modPost(`/users/${id}/${path}`, body);
      toast({ title: "İşlem başarılı" });
      await load();
      await refreshBadges();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const canAct = (role: string) => role === "user" || role === "vip";

  return (
    <PermissionGuard permission="users.view">
      <PageShell
        title="Kullanıcılar"
        subtitle="Rol değiştirme bu panelde yapılamaz"
        onRefresh={load}
        loading={loading}
        actions={<input className="mod-input" placeholder="Kullanıcı ara..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />}
      >
        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Kullanıcı bulunamadı</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>Kullanıcı</th><th>Rol</th><th>Durum</th><th>IP</th><th>Tarih</th><th>İşlemler</th></tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.displayName || u.username}</div>
                    <div style={{ fontSize: 11, color: "var(--mod-text-dim)" }}>@{u.username} · {u.email}</div>
                  </td>
                  <td><RoleBadge role={u.role} /></td>
                  <td>
                    {u.isBanned ? (
                      <span style={{ fontSize: 12, color: "var(--mod-danger)" }}>
                        Yasaklı{u.banExpiresAt ? ` (${fmtDate(u.banExpiresAt)})` : ""}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--mod-success)" }}>Aktif</span>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: "var(--mod-text-dim)", fontFamily: "monospace" }}>{u.lastKnownIp ?? "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(u.createdAt)}</td>
                  <td>
                    {canAct(u.role) && (
                      <div style={{ display: "flex", gap: 4 }}>
                        {hasPermission("users.warn") && !u.isBanned && (
                          <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" title="Uyar" onClick={() => setReasonModal({ id: u.id, action: "warn" })} disabled={actionLoading}>
                            <AlertTriangle size={14} />
                          </button>
                        )}
                        {hasPermission("users.suspend_temporarily") && !u.isBanned && (
                          <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" title="Askıya al" onClick={() => setReasonModal({ id: u.id, action: "suspend" })} disabled={actionLoading}>
                            <Ban size={14} />
                          </button>
                        )}
                        {hasPermission("users.unsuspend") && u.isBanned && (
                          <button type="button" className="mod-btn mod-btn-success mod-btn-sm" title="Yasağı kaldır" onClick={() => act(u.id, "unsuspend")} disabled={actionLoading}>
                            <UserCheck size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </PageShell>

      <ReasonModal
        open={!!reasonModal}
        title={reasonModal?.action === "warn" ? "Kullanıcıyı Uyar" : "Kullanıcıyı Askıya Al"}
        description={reasonModal?.action === "suspend" ? "Varsayılan süre 24 saattir." : undefined}
        loading={actionLoading}
        onConfirm={(reason) => {
          if (!reasonModal) return;
          if (reasonModal.action === "warn") act(reasonModal.id, "warn", { reason });
          else act(reasonModal.id, "suspend", { reason, hours: 24 });
          setReasonModal(null);
        }}
        onCancel={() => setReasonModal(null)}
      />
    </PermissionGuard>
  );
}
