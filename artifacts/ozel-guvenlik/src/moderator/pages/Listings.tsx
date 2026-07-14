import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle, XCircle, Archive, Trash2, Star, StarOff } from "lucide-react";
import { modFetch, modPost } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { StatusBadge } from "../components/StatusBadge";
import { ReasonModal } from "../components/ReasonModal";
import { FilterBar, BulkActionBar } from "../components/FilterBar";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

interface Listing {
  id: number;
  title: string;
  company: string;
  city: string;
  status: string;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
}

export default function Listings() {
  const { hasPermission, refreshBadges } = useModerator();
  const { toast } = useToast();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [reasonModal, setReasonModal] = useState<{ id: number; action: "reject" | "archive" | "soft-delete" } | null>(null);
  const [bulkReason, setBulkReason] = useState<"reject" | "archive" | "delete" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const data = await modFetch<{ items: Listing[] }>(`/listings?${params}`);
      setItems(data.items);
      setSelected([]);
    } finally { setLoading(false); }
  }, [q, status]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: number, path: string, body?: unknown) => {
    setActionLoading(true);
    try {
      await modPost(`/listings/${id}/${path}`, body);
      toast({ title: "İşlem başarılı" });
      await load();
      await refreshBadges();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const handleReason = async (reason: string) => {
    if (!reasonModal) return;
    const map = { reject: "reject", archive: "archive", "soft-delete": "soft-delete" } as const;
    await act(reasonModal.id, map[reasonModal.action], { reason });
    setReasonModal(null);
  };

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.length === items.length ? [] : items.map((i) => i.id)));
  };

  const runBulk = async (action: string, reason?: string) => {
    if (!selected.length) return;
    setActionLoading(true);
    try {
      await modPost("/listings/bulk", { ids: selected, action, reason });
      toast({ title: `${selected.length} ilan güncellendi` });
      setBulkReason(null);
      await load();
      await refreshBadges();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  return (
    <PermissionGuard permission="listings.view">
      <PageShell
        title="İlanlar"
        subtitle={`${items.length} ilan listeleniyor`}
        onRefresh={load}
        loading={loading}
        actions={
          <FilterBar>
            <input className="mod-input" placeholder="Ara..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 160 }} />
            <select className="mod-input mod-select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 130 }}>
              <option value="">Tümü</option>
              <option value="active">Aktif</option>
              <option value="pending">Bekleyen</option>
              <option value="rejected">Reddedilen</option>
            </select>
          </FilterBar>
        }
      >
        {hasPermission("listings.bulk_action") && (
          <BulkActionBar selectedCount={selected.length} onClear={() => setSelected([])}>
            <button type="button" className="mod-btn mod-btn-success mod-btn-sm" disabled={actionLoading} onClick={() => runBulk("approve")}>Onayla</button>
            <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" disabled={actionLoading} onClick={() => setBulkReason("reject")}>Reddet</button>
            <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" disabled={actionLoading} onClick={() => setBulkReason("archive")}>Arşivle</button>
            {hasPermission("listings.soft_delete") && (
              <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" disabled={actionLoading} onClick={() => setBulkReason("delete")}>Sil</button>
            )}
          </BulkActionBar>
        )}

        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">İlan bulunamadı</div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                {hasPermission("listings.bulk_action") && (
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={selected.length === items.length && items.length > 0} onChange={toggleAll} />
                  </th>
                )}
                <th>İlan</th>
                <th>Şirket / Şehir</th>
                <th>Durum</th>
                <th>Tarih</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  {hasPermission("listings.bulk_action") && (
                    <td>
                      <input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggle(l.id)} />
                    </td>
                  )}
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{l.title}</div>
                    {l.isFeatured && <span style={{ fontSize: 10, color: "var(--mod-gold)" }}>★ Öne çıkan</span>}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-muted)" }}>{l.company} · {l.city}</td>
                  <td><StatusBadge status={l.status === "active" && l.isActive ? "active" : l.status} /></td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(l.createdAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {hasPermission("listings.approve") && l.status !== "active" && (
                        <button type="button" className="mod-btn mod-btn-success mod-btn-sm" title="Onayla" onClick={() => act(l.id, "approve")} disabled={actionLoading}>
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {hasPermission("listings.reject") && (
                        <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" title="Reddet" onClick={() => setReasonModal({ id: l.id, action: "reject" })} disabled={actionLoading}>
                          <XCircle size={14} />
                        </button>
                      )}
                      {hasPermission("listings.archive") && (
                        <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" title="Arşivle" onClick={() => setReasonModal({ id: l.id, action: "archive" })} disabled={actionLoading}>
                          <Archive size={14} />
                        </button>
                      )}
                      {hasPermission("listings.soft_delete") && (
                        <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" title="Sil" onClick={() => setReasonModal({ id: l.id, action: "soft-delete" })} disabled={actionLoading}>
                          <Trash2 size={14} />
                        </button>
                      )}
                      {hasPermission("listings.feature") && !l.isFeatured && (
                        <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" title="Öne çıkar" onClick={() => act(l.id, "feature")} disabled={actionLoading}>
                          <Star size={14} />
                        </button>
                      )}
                      {hasPermission("listings.remove_feature") && l.isFeatured && (
                        <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" title="Öne çıkarmayı kaldır" onClick={() => act(l.id, "unfeature")} disabled={actionLoading}>
                          <StarOff size={14} />
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
        title={reasonModal?.action === "reject" ? "İlanı Reddet" : reasonModal?.action === "archive" ? "İlanı Arşivle" : "İlanı Sil"}
        loading={actionLoading}
        required={reasonModal?.action !== "archive"}
        onConfirm={handleReason}
        onCancel={() => setReasonModal(null)}
      />
      <ReasonModal
        open={!!bulkReason}
        title={bulkReason === "reject" ? "Toplu reddet" : bulkReason === "archive" ? "Toplu arşiv" : "Toplu sil"}
        loading={actionLoading}
        required={bulkReason !== "archive"}
        onConfirm={(reason) => runBulk(bulkReason!, reason)}
        onCancel={() => setBulkReason(null)}
      />
    </PermissionGuard>
  );
}
