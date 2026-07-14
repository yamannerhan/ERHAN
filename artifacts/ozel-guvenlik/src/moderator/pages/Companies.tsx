import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle, XCircle, Pause, Play } from "lucide-react";
import { modFetch, modPost } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { ReasonModal } from "../components/ReasonModal";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

interface Company {
  id: number;
  companyName: string;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

export default function Companies() {
  const { hasPermission, refreshBadges } = useModerator();
  const { toast } = useToast();
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [reasonModal, setReasonModal] = useState<{ id: number; action: "unverify" | "suspend" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: Company[] }>(`/companies${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setItems(data.items);
    } finally { setLoading(false); }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: number, path: string, body?: unknown) => {
    setActionLoading(true);
    try {
      await modPost(`/companies/${id}/${path}`, body);
      toast({ title: "İşlem başarılı" });
      await load();
      await refreshBadges();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  return (
    <PermissionGuard permission="companies.view">
      <PageShell
        title="Şirketler"
        onRefresh={load}
        loading={loading}
        actions={<input className="mod-input" placeholder="Şirket ara..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />}
      >
        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Şirket bulunamadı</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>Şirket</th><th>Doğrulama</th><th>Durum</th><th>Tarih</th><th>İşlemler</th></tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.companyName}</td>
                  <td>
                    <span style={{ fontSize: 12, color: c.isVerified ? "var(--mod-success)" : "var(--mod-warning)" }}>
                      {c.isVerified ? "Doğrulanmış" : "Doğrulanmamış"}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: c.isActive ? "var(--mod-success)" : "var(--mod-danger)" }}>
                      {c.isActive ? "Aktif" : "Askıda"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(c.createdAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {hasPermission("companies.verify") && !c.isVerified && (
                        <button type="button" className="mod-btn mod-btn-success mod-btn-sm" onClick={() => act(c.id, "verify")} disabled={actionLoading}>
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {hasPermission("companies.reject") && c.isVerified && (
                        <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" onClick={() => setReasonModal({ id: c.id, action: "unverify" })} disabled={actionLoading}>
                          <XCircle size={14} />
                        </button>
                      )}
                      {hasPermission("companies.suspend") && c.isActive && (
                        <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" onClick={() => setReasonModal({ id: c.id, action: "suspend" })} disabled={actionLoading}>
                          <Pause size={14} />
                        </button>
                      )}
                      {hasPermission("companies.unsuspend") && !c.isActive && (
                        <button type="button" className="mod-btn mod-btn-success mod-btn-sm" onClick={() => act(c.id, "unsuspend")} disabled={actionLoading}>
                          <Play size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </PageShell>

      <ReasonModal
        open={!!reasonModal}
        title={reasonModal?.action === "suspend" ? "Şirketi Askıya Al" : "Doğrulamayı Kaldır"}
        loading={actionLoading}
        onConfirm={(reason) => reasonModal && act(reasonModal.id, reasonModal.action === "suspend" ? "suspend" : "unverify", { reason })}
        onCancel={() => setReasonModal(null)}
      />
    </PermissionGuard>
  );
}
